import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { sendPaymentNotificationWithBot } from '@/price/helpers/sendPaymentNotificationWithBot'
import { sendPaymentNotificationToUser } from '@/price/helpers/sendPaymentNotificationToUser'
import { inngest } from '@/core/inngest/clients'
import { updateUserSubscription } from '@/core/supabase'
import { updatePaymentStatus } from '@/core/supabase/updatePaymentStatus'
import { logger } from '@/utils/logger'
import { errorMessage, errorMessageAdmin } from '@/helpers/errorMessage'
import { getTelegramIdFromInvId } from '@/helpers/getTelegramIdFromInvId'
import { AVATARS_GROUP_ID, createBotByName } from '@/core/bot'

// Константы для вариантов оплаты
const PAYMENT_OPTIONS = [
  { amount: 500, stars: 217 },
  { amount: 1000, stars: 434 },
  { amount: 2000, stars: 869 },
  { amount: 5000, stars: 2173 },
  { amount: 10000, stars: 4347 },
  { amount: 10, stars: 6 },
]

// Константы для тарифов
const SUBSCRIPTION_PLANS = [
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
]

// Группируем суммы подписок для более удобного использования
const SUBSCRIPTION_AMOUNTS = SUBSCRIPTION_PLANS.reduce((acc, plan) => {
  acc[plan.ru_price] = plan.callback_data
  return acc
}, {})

// Функция Inngest для обработки платежей
export const ruPaymentProcessPayment = inngest.createFunction(
  {
    id: 'ru-payment-processing',
    name: 'ru-payment-processing',
    retries: 3, // Автоматические повторы при сбоях
    onFailure: async ({ error }) => {
      console.log('❌ Ошибка обработки платежа:', error)
      errorMessageAdmin(error)
      return { error: error.message }
    },
  },
  { event: 'ru-payment/process-payment' }, // Триггерное событие
  async ({ event, step }) => {
    const { IncSum, inv_id } = event.data
    // Преобразуем строку в число и округляем до целого
    const roundedIncSum = Math.round(Number(IncSum))

    console.log('🚀 processPayment: начало обработки платежа')
    console.log('💰 processPayment: исходная сумма', IncSum)
    console.log('💰 processPayment: округленная сумма', roundedIncSum)
    console.log('📝 processPayment: инвойс ID', inv_id)

    try {
      let stars = 0
      let subscription = ''

      // 1. Сначала получаем данные пользователя
      const userData = await step.run('get-user-data', async () => {
        return await getTelegramIdFromInvId(inv_id)
      })

      const { telegram_id, username, language_code, bot_name } = userData

      console.log('👤 processPayment: telegram_id', telegram_id)
      console.log('👤 processPayment: username', username)
      console.log('🌐 processPayment: language_code', language_code)
      console.log('🤖 processPayment: bot_name', bot_name)

      // 2. Проверяем, соответствует ли сумма одному из тарифов
      const checkSubscriptionStep = await step.run(
        'check-subscription-plan',
        async () => {
          if (SUBSCRIPTION_AMOUNTS[roundedIncSum]) {
            const plan = SUBSCRIPTION_PLANS.find(
              p => p.ru_price === roundedIncSum
            )
            if (plan) {
              return {
                stars: plan.stars_price,
                subscription: plan.callback_data,
              }
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

      // 4. Теперь, когда у нас есть все данные, обновляем статус платежа
      await step.run('update-payment-status', async () => {
        await updatePaymentStatus({
          inv_id,
          status: 'SUCCESS',
          stars,
          description: `Пополнение баланса ${roundedIncSum} руб.`,
          metadata: {
            payment_method: 'Robokassa',
            bot_name,
            language: language_code || 'ru',
            stars,
            currency: 'RUB',
            ru_amount: roundedIncSum,
          },
        })
        return { success: true }
      })

      if (stars > 0) {
        const botConfig = await step.run('get-bot-config', async () => {
          // Проверяем, что bot_name является допустимым ключом AVATARS_GROUP_ID
          if (!(bot_name in AVATARS_GROUP_ID)) {
            throw new Error(`Неизвестное имя бота: ${bot_name}`)
          }

          // Получаем токен бота
          const botToken = createBotByName(bot_name)

          // Получаем ID группы из константы
          const groupId =
            AVATARS_GROUP_ID[bot_name as keyof typeof AVATARS_GROUP_ID]
          if (!groupId) {
            throw new Error(
              `ID группы не найден для ${bot_name} в AVATARS_GROUP_ID`
            )
          }

          logger.info('🤖 Конфигурация бота получена', {
            description: 'Bot configuration retrieved',
            bot_name,
            group_id: groupId,
          })

          return {
            token: botToken?.token,
            groupId: botToken?.groupId,
          }
        })

        // 6. Отправляем уведомление о платеже - отдельный шаг
        await step.run('send-notification', async () => {
          const bot = new Telegraf<MyContext>(botConfig.token)

          // Отправляем уведомление в группу
          await sendPaymentNotificationWithBot({
            amount: roundedIncSum.toString(),
            stars,
            telegramId: telegram_id.toString(),
            language_code,
            username,
            groupId: botConfig.groupId,
            bot,
          })

          // Отправляем личное уведомление пользователю
          await sendPaymentNotificationToUser({
            amount: roundedIncSum.toString(),
            stars,
            telegramId: telegram_id.toString(),
            language_code,
            bot,
          })

          console.log('📨 processPayment: уведомления отправлены')
          return { success: true }
        })

        // 7. Обновляем подписку только если платеж соответствует тарифу - отдельный шаг
        if (subscription) {
          await step.run('update-subscription', async () => {
            await updateUserSubscription(telegram_id, subscription)
            console.log(
              '🔄 processPayment: подписка обновлена на',
              subscription
            )
            return { success: true }
          })
        }

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
      // Получаем информацию о пользователе для отправки уведомления об ошибке
      try {
        const { telegram_id, language_code } = await getTelegramIdFromInvId(
          inv_id
        )
        errorMessage(error as Error, telegram_id, language_code === 'ru')
        errorMessageAdmin(error as Error)
      } catch (innerError) {
        console.log(
          '❌ processPayment: ошибка при получении telegram_id',
          innerError
        )
        errorMessageAdmin(innerError as Error)
      }

      throw error // Перебрасываем ошибку для активации механизма повторных попыток
    }
  }
)
// {
//     "data": {
//       "inv_id": "999999", "IncSum": "1110.00"
//     }
//   }
