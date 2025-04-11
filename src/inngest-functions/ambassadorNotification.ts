import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'

/**
 * Данные события уведомления амбассадора о платеже
 */
interface AmbassadorPaymentNotificationEvent {
  data: {
    ambassador_id: string
    telegram_id: string
    payment_id: number
    payment_amount: number
    payment_stars: number
    payment_type: string
    payment_status: string
    bot_name: string
    commission_amount: number
    commission_rate: number
    user_telegram_id: string
    timestamp: string
  }
}

/**
 * Обработчик уведомлений амбассадоров о платежах
 * Отправляет сообщение амбассадору через бота системы амбассадоров
 */
export const ambassadorPaymentNotificationHandler = inngest.createFunction(
  { id: 'ambassador-payment-notification-handler' },
  { event: 'ambassador/payment.notification' },
  async ({ event, step }) => {
    const data = event.data as AmbassadorPaymentNotificationEvent['data']

    logger.info('🚀 Начало обработки уведомления о платеже для амбассадора', {
      description: 'Starting ambassador payment notification processing',
      ambassadorId: data.ambassador_id,
      telegramId: data.telegram_id,
      paymentId: data.payment_id,
    })

    try {
      // Получаем бота для отправки уведомления (используем системного бота)
      const botName = 'ambassador_system'
      const botResult = await step.run(
        'get-ambassador-system-bot',
        async () => {
          return await getBotByName(botName)
        }
      )

      if (!botResult.bot) {
        throw new Error(
          `Системный бот для амбассадоров не найден: ${botName}. Ошибка: ${botResult.error || 'Неизвестная ошибка'}`
        )
      }

      // Формируем сообщение с уведомлением о платеже
      const message = await step.run(
        'prepare-notification-message',
        async () => {
          // Получаем символ валюты и форматируем суммы
          const currencySymbol = '⭐' // Звезды (внутренняя валюта)
          const formattedAmount = data.payment_amount.toFixed(2)
          const formattedCommission = data.commission_amount.toFixed(2)

          // Формируем текст сообщения
          let messageText = `💰 *Уведомление о платеже*\n\n`
          messageText += `В вашем боте _${data.bot_name}_ была совершена оплата:\n\n`

          // Данные платежа
          messageText += `*ID платежа:* \`#${data.payment_id}\`\n`
          messageText += `*Тип операции:* \`${data.payment_type}\`\n`
          messageText += `*Статус:* \`${data.payment_status}\`\n`
          messageText += `*Сумма:* \`${formattedAmount} ${currencySymbol}\`\n`

          // Данные о комиссии (если есть)
          if (data.commission_amount > 0) {
            messageText += `\n*Ваша комиссия (${data.commission_rate}%):* \`${formattedCommission} ${currencySymbol}\`\n`
            messageText += `Комиссия уже начислена на ваш баланс! 🎉\n`
          }

          // Дата и время операции
          const operationDate = new Date(data.timestamp)
          messageText += `\n*Дата операции:* \`${operationDate.toLocaleString('ru-RU')}\`\n`

          return messageText
        }
      )

      // Отправляем сообщение амбассадору
      await step.run('send-notification-to-ambassador', async () => {
        // Получаем бота из результата
        const bot = botResult.bot as Telegraf<MyContext>

        try {
          // Отправляем сообщение с использованием приведения типов
          // для обхода проблем с типизацией
          await (bot as any).telegram.sendMessage(data.telegram_id, message, {
            parse_mode: 'Markdown',
          })

          logger.info(
            '✅ Уведомление о платеже успешно отправлено амбассадору',
            {
              description:
                'Payment notification successfully sent to ambassador',
              ambassadorId: data.ambassador_id,
              telegramId: data.telegram_id,
              paymentId: data.payment_id,
            }
          )
        } catch (sendError: any) {
          logger.error('❌ Ошибка при отправке сообщения через Telegram бота', {
            description: 'Error sending message via Telegram bot',
            error: sendError.message,
            telegramId: data.telegram_id,
            botName,
          })
          throw sendError
        }
      })

      return {
        success: true,
        ambassador_id: data.ambassador_id,
        telegram_id: data.telegram_id,
        payment_id: data.payment_id,
        message: 'Уведомление успешно отправлено',
      }
    } catch (error: any) {
      logger.error('❌ Ошибка при отправке уведомления амбассадору о платеже', {
        description: 'Error sending payment notification to ambassador',
        ambassadorId: data.ambassador_id,
        telegramId: data.telegram_id,
        paymentId: data.payment_id,
        error: error.message,
        stack: error.stack,
      })

      return {
        success: false,
        ambassador_id: data.ambassador_id,
        telegram_id: data.telegram_id,
        payment_id: data.payment_id,
        error: error.message,
      }
    }
  }
)
