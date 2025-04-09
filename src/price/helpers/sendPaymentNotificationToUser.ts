import { Telegraf } from 'telegraf'
import { MyContext } from '@/types'
import { logger } from '@/utils/logger'

interface SendPaymentNotificationToUserProps {
  amount: string
  stars: number
  telegramId: string
  language_code?: string
  bot: Telegraf<MyContext>
}

export async function sendPaymentNotificationToUser({
  amount,
  stars,
  telegramId,
  language_code = 'ru',
  bot,
}: SendPaymentNotificationToUserProps) {
  try {
    // Проверяем наличие telegram клиента и его методов
    if (!bot.telegram || typeof bot.telegram.sendMessage !== 'function') {
      logger.error(
        '❌ Telegram клиент не инициализирован или отсутствует метод sendMessage:',
        {
          description:
            'Telegram client not initialized or missing sendMessage method',
          hasTelegram: !!bot.telegram,
          methods: bot.telegram ? Object.keys(bot.telegram) : [],
        }
      )
      throw new Error('Telegram client not properly initialized')
    }

    const isRussian = language_code === 'ru'

    const message = isRussian
      ? `🎉 Поздравляем! Ваш платеж на сумму ${amount} руб. успешно обработан.\n\n⭐️ На ваш баланс начислено ${stars} звезд.\n\nПриятного использования! Нажмите на команду /menu, чтобы начать пользоваться ботом.`
      : `🎉 Congratulations! Your payment of ${amount} RUB has been successfully processed.\n\n⭐️ ${stars} stars have been credited to your balance.\n\nEnjoy using our service! \n\nClick on the /menu command to start using the bot.`

    await bot.telegram.sendMessage(telegramId, message)

    logger.info('📨 Личное уведомление о платеже отправлено', {
      description: 'Personal payment notification sent',
      telegram_id: telegramId,
      amount,
      stars,
    })
  } catch (error) {
    logger.error('❌ Ошибка при отправке личного уведомления', {
      description: 'Error sending personal payment notification',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: telegramId,
    })
    throw error
  }
}
