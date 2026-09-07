import { inngest } from '@/inngest_app/client'
import { isRussianLanguageCode } from '@/helpers/isRussianLanguageCode'
import { updateUserBalance } from '@/core/supabase'
import { createBotByName } from '@/core/bot'
import { getTelegramIdFromInvId } from '@/core/supabase'
import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'
import { errorMessage } from '@/helpers'
import { defaultBot } from '@/core/bot'
import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { PaymentType } from '@/interfaces/payments.interface'
import { slugify } from 'inngest' // For v3 migration
import { createInngestFailureHandler } from '@/inngest_app/client'
import { telegramClientOptions } from '@/services/telegramApi'

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
    text: '📚 NeuroVideo',
    en_price: 33,
    ru_price: 2999,
    description: 'Self-study using neural networks with an AI avatar.',
    stars_price: 1303,
    callback_data: 'neurovideo',
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
]

// Группируем суммы подписок для более удобного использования
const SUBSCRIPTION_AMOUNTS = SUBSCRIPTION_PLANS.reduce((acc, plan) => {
  acc[plan.ru_price] = plan.callback_data
  return acc
}, {})

// Функция Inngest для обработки платежей
export const processPayment = inngest.createFunction(
  {
    id: slugify('payment-processing-ai-server'), // v3 requires id
    name: '💳 Payment Processing AI Server', // Optional display name
    retries: 3, // Автоматические повторы при сбоях
    onFailure: createInngestFailureHandler('payment-processing-ai-server'),
  },
  { event: 'payment/process-ai-server' }, // Триггерное событие
  async ({ event, step }) => {
    console.log('🎯 Получено событие платежа:', event)
    console.log('📦 Данные события:', event.data)

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

      // 1. Проверяем, соответствует ли сумма одному из тарифов - выполняем в отдельном шаге
      const checkSubscriptionStep = await step.run(
        'check-subscription-plan',
        async () => {
          if (SUBSCRIPTION_AMOUNTS[roundedIncSum]) {
            // Находим соответствующий тариф
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

      // 2. Если не соответствует тарифу, проверяем стандартные варианты оплаты - в отдельном шаге
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

      if (stars > 0) {
        // 3. Получаем информацию о пользователе - в отдельном шаге с повторными попытками
        const userInfo = await step.run('get-user-info', async () => {
          return await getTelegramIdFromInvId(inv_id)
        })

        const { telegram_id, username, language_code, bot_name } = userInfo

        console.log('👤 processPayment: telegram_id', telegram_id)
        console.log('👤 processPayment: username', username)
        console.log('🌐 processPayment: language_code', language_code)
        console.log('🤖 processPayment: bot_name', bot_name)

        // 4. Получаем токен и групповой ID для бота
        const botConfig = await step.run('get-bot-config', async () => {
          const botData = await createBotByName(bot_name)
          if (!botData) {
            throw new Error(`Не удалось создать бота для ${bot_name}`)
          }

          return {
            groupId: botData.groupId,
          }
        })

        // 5. Обновляем запись платежа и баланс пользователя через функцию updateUserBalance
        await step.run('update-user-balance', async () => {
          const description = `Пополнение баланса ${roundedIncSum} руб.`

          // Передаем inv_id в метаданных, чтобы функция обновила существующую запись
          const result = await updateUserBalance(
            telegram_id.toString(),
            Number(roundedIncSum),
            PaymentType.MONEY_INCOME,
            description,
            {
              payment_method: 'Robokassa',
              bot_name,
              language: language_code || 'ru',
              stars,
              currency: 'RUB',
              ru_amount: roundedIncSum,
              inv_id, // Передаем inv_id для обновления существующей записи
            }
          )
          if (!result) {
            throw new Error(
              `Не удалось обновить баланс пользователя ${telegram_id}`
            )
          }

          console.log('⭐ processPayment: баланс увеличен на', stars)
          return { success: true }
        })

        // 6. Отправляем уведомление о платеже - отдельный шаг
        await step.run('send-notification', async () => {
          // Создаем новый экземпляр бота для каждого запроса, чтобы избежать проблем с типами
          const botToken =
            process.env[
              `BOT_TOKEN_${bot_name === 'neuro_blogger_bot' ? '1' : '2'}`
            ]
          if (!botToken) {
            throw new Error(`Токен бота не найден для ${bot_name}`)
          }

          const bot = new Telegraf<MyContext>(botToken, {
            telegram: telegramClientOptions(),
          })

          // Отправляем уведомление об оплате
          const caption = isRussianLanguageCode(language_code)
            ? `💸 Пользователь @${username || 'Пользователь без username'} (Telegram ID: ${telegram_id}) оплатил ${roundedIncSum} рублей и получил ${stars} звезд.`
            : `💸 User @${username || 'User without username'} (Telegram ID: ${telegram_id}) paid ${roundedIncSum} RUB and received ${stars} stars.`

          await bot.telegram.sendMessage('-4166575919', caption)

          console.log('📨 processPayment: уведомление отправлено')
          return { success: true }
        })

        // Подписка уже записана в payments_v2 при обработке платежа
        // После обновления баланса, подписка автоматически активируется
        // getUserDetailsSubscription проверяет payments_v2.subscription_type

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
        const { telegram_id, language_code } =
          await getTelegramIdFromInvId(inv_id)
        errorMessage(null, error as Error, isRussianLanguageCode(language_code))
        errorMessageAdmin(null, error as Error)
      } catch (innerError) {
        console.log(
          '❌ processPayment: ошибка при получении telegram_id',
          innerError
        )
        errorMessageAdmin(null, innerError as Error)
      }

      throw error // Перебрасываем ошибку для активации механизма повторных попыток
    }
  }
)

// "inv_id": "553912", "IncSum": "1110.00"
