import { sendPaymentNotificationWithBot } from '@/price/helpers/sendPaymentNotificationWithBot'
import { sendPaymentNotificationToUser } from '@/price/helpers/sendPaymentNotificationToUser'
import { inngest } from '@/inngest-functions/clients'
import { updateUserSubscription } from '@/core/supabase'
import { updatePaymentStatus } from '@/core/supabase/updatePaymentStatus'
import { Logger as logger } from '@/utils/logger'
import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'
import { getTelegramIdFromInvId } from '@/helpers/getTelegramIdFromInvId'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createBotByName } from '@/core/bot'

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
    // Преобразуем строку в число и округляем до целого
    const roundedIncSum = Math.round(Number(IncSum))

    try {
      let stars = 0
      let subscription = ''

      // 1. Сначала получаем данные пользователя
      const userData = await step.run('get-user-data', async () => {
        return await getTelegramIdFromInvId(inv_id)
      })

      const { telegram_id, username, language_code, bot_name } = userData

      // 2. Проверяем, соответствует ли сумма одному из тарифов
      const checkSubscriptionStep = await step.run(
        'check-subscription-plan',
        async () => {
          const plan = SUBSCRIPTION_PLANS.find(
            p => p.ru_price === roundedIncSum
          )
          if (plan) {
            return {
              stars: plan.stars_price,
              subscription: plan.callback_data,
            }
          }
          return { stars: 0, subscription: '' }
        }
      )

      stars = checkSubscriptionStep.stars
      subscription = checkSubscriptionStep.subscription

      // 3. Если не соответствует тарифу, проверяем стандартные варианты оплаты
      if (stars === 0) {
        const checkPaymentOptionStep = await step.run(
          'check-payment-option',
          async () => {
            const option = PAYMENT_OPTIONS.find(
              opt => opt.amount === roundedIncSum
            )
            if (option) {
              return { stars: option.stars }
            }
            return { stars: 0 }
          }
        )

        stars = checkPaymentOptionStep.stars
      }

      // 4. Теперь, когда у нас есть все данные, обновляем статус платежа и подписку
      await step.run('update-payment-status-and-subscription', async () => {
        // Обновляем статус платежа
        await updatePaymentStatus({
          telegram_id,
          inv_id,
          status: 'COMPLETED',
          error_message: undefined,
        })

        // Если это оплата подписки, обновляем её
        if (subscription) {
          logger.info('🔄 Обновление подписки пользователя:', {
            description: 'Updating user subscription',
            telegram_id,
            subscription,
          })

          await updateUserSubscription(telegram_id.toString(), subscription)

          logger.info('✅ Подписка обновлена:', {
            description: 'Subscription updated',
            telegram_id,
            subscription,
          })
        }

        return { success: true }
      })

      // 5. Отправляем событие о пополнении баланса
      if (stars > 0) {
        await inngest.send({
          name: 'payment/process',
          data: {
            amount: stars,
            telegram_id: telegram_id.toString(),
            type: 'money_income',
            description: subscription
              ? `Покупка подписки ${subscription}`
              : `Пополнение баланса на ${stars} звезд`,
            bot_name: bot_name || 'default',
            metadata: {
              payment_method: 'Robokassa',
              subscription: subscription || undefined,
              stars,
            },
          },
        })

        logger.info('✅ Событие пополнения баланса отправлено:', {
          description: 'Balance update event sent',
          telegram_id,
          stars,
          subscription: subscription || 'no subscription',
        })
      }

      if (stars > 0) {
        const botConfig = await createBotByName(bot_name || 'default')
        if (!botConfig) {
          throw new Error(`Бот ${bot_name} не найден`)
        }

        // Отправляем уведомление о платеже
        await sendPaymentNotificationToUser({
          amount: stars.toString(),
          stars,
          telegramId: telegram_id.toString(),
          language_code: language_code || 'ru',
          bot: botConfig.bot as Telegraf<MyContext>,
        })

        // 6. Отправляем уведомление о платеже - отдельный шаг
        await step.run('send-notification', async () => {
          try {
            logger.info('🚀 Начало отправки уведомлений:', {
              description: 'Starting notifications sending',
              bot_name,
              telegram_id,
              roundedIncSum,
              stars,
            })

            if (!botConfig.bot) {
              throw new Error(`❌ Бот ${bot_name} не найден`)
            }

            logger.info('✅ Бот получен:', {
              description: 'Bot retrieved',
              bot_name,
            })

            // Проверяем входные параметры
            if (!telegram_id || !roundedIncSum || !stars) {
              throw new Error(
                '❌ Отсутствуют обязательные параметры для отправки уведомлений'
              )
            }

            // Отправляем личное уведомление пользователю
            try {
              await sendPaymentNotificationToUser({
                amount: roundedIncSum.toString(),
                stars,
                telegramId: telegram_id.toString(),
                language_code: language_code || 'ru',
                bot: botConfig.bot as Telegraf<MyContext>,
              })

              logger.info('✅ Личное уведомление отправлено:', {
                description: 'Personal notification sent',
                telegram_id,
              })
            } catch (error) {
              logger.error('❌ Ошибка отправки личного уведомления:', {
                description: 'Error sending personal notification',
                error: error instanceof Error ? error.message : 'Unknown error',
              })
              throw error
            }

            // Проверяем наличие groupId
            if (!botConfig.groupId) {
              logger.warn(
                '⚠️ groupId не настроен, пропускаем отправку в группу'
              )
              return {
                success: true,
                personalNotification: true,
                groupNotification: false,
              }
            }

            // Отправляем уведомление в группу
            let groupNotificationSent = false
            try {
              await sendPaymentNotificationWithBot({
                telegram_id,
                username: username || 'Пользователь без username',
                amount: roundedIncSum.toString(),
                stars,
              })

              logger.info('✅ Уведомление отправлено в группу:', {
                description: 'Group notification sent',
                telegram_id,
              })

              groupNotificationSent = true
            } catch (error) {
              logger.error('❌ Ошибка отправки уведомления в группу:', {
                description: 'Error sending group notification',
                error: error instanceof Error ? error.message : 'Unknown error',
              })
            }

            logger.info('📨 Статус отправки уведомлений:', {
              description: 'Notifications status',
              personalNotification: true,
              groupNotification: groupNotificationSent,
            })

            return {
              success: true,
              personalNotification: true,
              groupNotification: groupNotificationSent,
            }
          } catch (error) {
            logger.error('❌ Ошибка при отправке уведомлений:', {
              description: 'Error in notifications sending',
              error: error instanceof Error ? error.message : 'Unknown error',
              bot_name,
              telegram_id,
            })
            throw error
          }
        })

        logger.info('💰 Платеж успешно обработан', {
          description: 'Payment processed successfully',
          telegram_id,
          language_code,
          amount: roundedIncSum,
          stars,
        })

        return {
          success: true,
          telegram_id,
          amount: roundedIncSum,
          stars,
          subscription: subscription || null,
          timestamp: new Date().toISOString(),
        }
      } else {
        logger.warn(
          '⚠️ Платеж не обработан: не найден подходящий тариф или пакет звезд',
          {
            description:
              'Payment not processed: no matching plan or star package found',
            amount: roundedIncSum,
            inv_id,
          }
        )

        return {
          success: false,
          reason:
            'Не найден подходящий тариф или пакет звезд для указанной суммы',
          amount: roundedIncSum,
        }
      }
    } catch (error) {
      try {
        errorMessageAdmin(error as Error)
      } catch (innerError) {
        logger.error('❌ processPayment: ошибка при получении telegram_id', {
          error: innerError,
        })
        errorMessageAdmin(innerError as Error)
      }

      throw error
    }
  }
)
// {
//     "data": {
//       "inv_id": "999999", "IncSum": "1110.00"
//     }
//   }
