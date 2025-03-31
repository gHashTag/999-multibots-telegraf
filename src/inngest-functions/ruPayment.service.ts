import { sendPaymentNotificationWithBot } from '@/price/helpers/sendPaymentNotificationWithBot'
import { sendPaymentNotificationToUser } from '@/price/helpers/sendPaymentNotificationToUser'
import { inngest } from '@/core/inngest/clients'
import { updateUserSubscription } from '@/core/supabase'
import { updatePaymentStatus } from '@/core/supabase/updatePaymentStatus'
import { logger } from '@/utils/logger'
import { errorMessageAdmin } from '@/helpers/errorMessage'
import { getTelegramIdFromInvId } from '@/helpers/getTelegramIdFromInvId'

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createBotByName } from '@/core/bot'
// Константы для вариантов оплаты
const PAYMENT_OPTIONS = [
  { amount: 500, stars: 217 },
  { amount: 1000, stars: 434 },
  { amount: 2000, stars: 869 },
  { amount: 5000, stars: 2173 },
  { amount: 10000, stars: 4347 },
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

// Получаем данные бота из Supabase

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
        const botConfig = await createBotByName(bot_name)
        // Отправляем уведомление о платеже
        await sendPaymentNotificationToUser({
          amount: stars.toString(),
          stars,
          telegramId: telegram_id,
          language_code: language_code === 'ru' ? 'ru' : 'en',
          bot: botConfig.bot as Telegraf<MyContext>,
        })

        // 6. Отправляем уведомление о платеже - отдельный шаг
        await step.run('send-notification', async () => {
          try {
            console.log('🚀 Начало отправки уведомлений:', {
              description: 'Starting notifications sending',
              bot_name,
              telegram_id,
              roundedIncSum,
              stars,
            })

            if (!botConfig.bot) {
              throw new Error(`❌ Бот ${bot_name} не найден`)
            }

            console.log('✅ Бот получен:', {
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
                language_code,
                bot: botConfig.bot as Telegraf<MyContext>,
              })

              console.log('✅ Личное уведомление отправлено:', {
                description: 'Personal notification sent',
                telegram_id,
              })
            } catch (error) {
              console.error('❌ Ошибка отправки личного уведомления:', {
                description: 'Error sending personal notification',
                error: error instanceof Error ? error.message : 'Unknown error',
              })
              throw error
            }

            // Проверяем наличие groupId
            if (!botConfig.groupId) {
              console.warn(
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
                bot: botConfig.bot,
                groupId: botConfig.groupId,
                telegram_id: telegram_id,
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
              console.error('❌ Ошибка отправки уведомления в группу:', {
                description: 'Error sending group notification',
                error: error instanceof Error ? error.message : 'Unknown error',
              })
              // Не выбрасываем ошибку, так как личное уведомление уже отправлено
            }

            console.log('📨 Статус отправки уведомлений:', {
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
            console.error('❌ Ошибка при отправке уведомлений:', {
              description: 'Error in notifications sending',
              error: error instanceof Error ? error.message : 'Unknown error',
              bot_name,
              telegram_id,
            })
            throw error // Пробрасываем ошибку для обработки в Inngest
          }
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
        // const { telegram_id, language_code } = await getTelegramIdFromInvId(
        //   inv_id
        // )
        // errorMessage(error as Error, telegram_id, language_code === 'ru')
        // errorMessageAdmin(error as Error)
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
