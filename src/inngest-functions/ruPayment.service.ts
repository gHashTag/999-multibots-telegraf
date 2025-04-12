import { notifyUserAboutSuccess, notifyUserAboutFailure } from '@/helpers/notifications/userNotifier'
import { notifyAdminsAboutPayment } from '@/helpers/notifications/adminNotifier'
import { inngest } from '@/inngest-functions/clients'
import { updateUserSubscription } from '@/core/supabase'
import { updatePaymentStatus } from '@/core/supabase/updatePaymentStatus'
import { logger } from '@/utils/logger'
import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'
import { getTelegramIdFromInvId } from '@/helpers/getTelegramIdFromInvId'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createBotByName } from '@/core/bot'
import { TransactionType, PaymentProcessParams } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/payments.interface'

// Константы для вариантов оплаты
export const PAYMENT_OPTIONS = [
  { amount: 500, stars: 217 },
  { amount: 1000, stars: 434 },
  { amount: 2000, stars: 869 },
  { amount: 5000, stars: 2173 },
  { amount: 10000, stars: 4347 },
] as const

// Константы для тарифов
export const SUBSCRIPTION_PLANS = [
  {
    row: 0,
    text: '🎨 NeuroPhoto',
    en_price: 10,
    ru_price: 1110,
    description: 'Creating photos using neural networks.',
    stars_price: 476,
    callback_data: 'neurophoto',
  },
  {
    row: 1,
    text: '📚 NeuroBase',
    en_price: 33,
    ru_price: 2999,
    description: 'Self-study using neural networks with an AI avatar.',
    stars_price: 1303,
    callback_data: 'neurobase',
  },
  {
    row: 2,
    text: '🤖 NeuroBlogger',
    en_price: 833,
    ru_price: 75000,
    description: 'Training on neural networks with a mentor.',
    stars_price: 32608,
    callback_data: 'neuroblogger',
  },
  {
    row: 3, // Укажите номер строки, где хотите разместить тестовый план
    text: '🧪 Тест', // Название тестового плана
    en_price: 1, // Тестовая цена в долларах
    ru_price: 1, // Тестовая цена в рублях
    description: 'Тестовый план для проверки функционала.',
    stars_price: 1, // Количество звезд для тестового плана
    callback_data: 'neurotester', // Уникальный идентификатор для тестового плана
  },
] as const

// Функция Inngest для обработки платежей
export const ruPaymentProcessPayment = inngest.createFunction(
  {
    id: 'ru-payment-processing',
    name: 'ru-payment-processing',
    retries: 3, // Автоматические повторы при сбоях
  },
  { event: 'ru-payment/process-payment' }, // Триггерное событие
  async ({ event, step }) => {
    const { IncSum, inv_id } = event.data
    const roundedIncSum = Math.round(Number(IncSum))
    let userData: Awaited<ReturnType<typeof getTelegramIdFromInvId>> | null = null

    try {
      let stars = 0
      let subscription = ''

      // 1. Получаем данные пользователя
      userData = await step.run('get-user-data', async () => {
        return await getTelegramIdFromInvId(inv_id)
      })

      const { telegram_id, username, language_code, bot_name } = userData

      // 2. Определяем тип платежа (подписка или звезды)
      const paymentDetails = await step.run('determine-payment-type', async () => {
        const plan = SUBSCRIPTION_PLANS.find(p => p.ru_price === roundedIncSum)
        if (plan) {
          return { stars: plan.stars_price, subscription: plan.callback_data }
        }
        const option = PAYMENT_OPTIONS.find(opt => opt.amount === roundedIncSum)
        if (option) {
          return { stars: option.stars, subscription: '' }
        }
        return { stars: 0, subscription: '' }
      })

      stars = paymentDetails.stars
      subscription = paymentDetails.subscription

      // 3. Обновляем статус платежа и подписку (если есть)
      await step.run('update-status', async () => {
        await updatePaymentStatus({
          telegram_id,
          inv_id,
          status: 'COMPLETED',
        })
        if (subscription) {
          logger.info('🔄 Обновление подписки пользователя:', {
            telegram_id,
            subscription,
          })
          await updateUserSubscription(telegram_id.toString(), subscription)
          logger.info('✅ Подписка обновлена:', {
            telegram_id,
            subscription,
          })
        }
      })

      // 4. Отправляем событие для обновления баланса, если найдены звезды
      if (stars > 0) {
        await step.run('send-balance-update-event', async () => {
          const paymentData: PaymentProcessParams = {
            amount: stars, // Отправляем звезды как amount
            stars: stars,
            telegram_id: telegram_id.toString(),
            type: subscription ? TransactionType.SUBSCRIPTION_PURCHASE : TransactionType.MONEY_INCOME,
            description: subscription
              ? `Покупка подписки ${subscription}`
              : `Пополнение баланса Robokassa на ${stars} звезд`,
            bot_name: bot_name || 'default',
            inv_id: inv_id, // Используем исходный inv_id
            service_type: subscription ? ModeEnum.Subscribe : ModeEnum.TopUpBalance,
            metadata: {
              payment_method: 'Robokassa',
              subscription: subscription || undefined,
              amount_rub: roundedIncSum,
            },
          }
          await inngest.send({ name: 'payment/process', data: paymentData })
          logger.info('✅ Событие пополнения баланса отправлено:', {
            telegram_id,
            stars,
            subscription,
          })
        })

        // 5. Отправляем уведомления (после успешной обработки основного события)
        // Уведомление пользователю
        await step.run('send-user-notification', async () => {
          await notifyUserAboutSuccess({
            telegram_id: telegram_id.toString(),
            bot_name: bot_name || 'default',
            language_code: language_code || 'ru',
            amount: roundedIncSum, // Показываем сумму в рублях
            currency: 'RUB',
            stars: stars,
            description: subscription ? `Покупка подписки ${subscription}` : `Пополнение баланса Robokassa`,
            subscription: subscription || undefined,
            type: subscription ? TransactionType.SUBSCRIPTION_PURCHASE : TransactionType.MONEY_INCOME,
            // Баланс здесь неизвестен
          })
        })

        // Уведомление админам
        await step.run('send-admin-notification', async () => {
          await notifyAdminsAboutPayment({
            telegram_id: telegram_id.toString(),
            bot_name: bot_name || 'default',
            username: username,
            amount: roundedIncSum,
            currency: 'RUB',
            stars: stars,
            subscription: subscription || undefined,
            type: subscription ? TransactionType.SUBSCRIPTION_PURCHASE : TransactionType.MONEY_INCOME,
            description: subscription ? `купил подписку ${subscription}` : `пополнил баланс через Robokassa`,
          })
        })
      } else {
        // Если оплата не прошла (stars === 0), уведомляем пользователя об ошибке
        logger.warn('⚠️ Платеж Robokassa не обработан: не найден тариф/пакет', {
          amount: roundedIncSum,
          inv_id,
        })
        await step.run('send-failure-notification', async () => {
          await notifyUserAboutFailure({
            telegram_id: telegram_id.toString(),
            bot_name: bot_name || 'default',
            language_code: language_code || 'ru',
            error: 'Не найден подходящий тариф или пакет звезд для указанной суммы',
            attemptedAmount: roundedIncSum,
            attemptedAction: 'оплаты Robokassa',
          })
        })
      }

      logger.info('💰 Платеж Robokassa успешно обработан', {
        telegram_id,
        amount: roundedIncSum,
        stars,
      })

      return {
        success: stars > 0,
        telegram_id,
        amount: roundedIncSum,
        stars,
        subscription: subscription || null,
      }
    } catch (error) {
      logger.error('❌ Ошибка обработки платежа Robokassa:', {
        error,
        inv_id,
      })
      // Отправляем уведомление пользователю об ошибке, если есть данные
      if (userData?.telegram_id) {
        try {
          await notifyUserAboutFailure({
            telegram_id: userData.telegram_id.toString(),
            bot_name: userData.bot_name || 'default',
            language_code: userData.language_code || 'ru',
            error: error instanceof Error ? error : new Error(String(error)),
            attemptedAction: 'обработки платежа Robokassa',
          })
        } catch (notifyError) {
          logger.error('❌ Ошибка при отправке уведомления об ошибке', {
            notifyError,
          })
        }
      }
      errorMessageAdmin(error as Error)
      throw error
    }
  }
)
// {
//     "data": {
//       "inv_id": "999999", "IncSum": "1110.00"
//     }
//   }
