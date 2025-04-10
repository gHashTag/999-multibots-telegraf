import { logger } from '@/utils/logger'
import { TelegramId } from '@/types/telegram.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/types'

export const errorMessage = async (
  error: Error,
  telegram_id: TelegramId,
  isRussian = true
) => {
  try {
    logger.error('❌ Отправка сообщения об ошибке пользователю', {
      description: 'Sending error message to user',
      telegram_id,
      error: error.message,
    })

    const botToken = process.env.BOT_TOKEN_1
    if (!botToken) {
      throw new Error('Bot token not found')
    }

    const bot = new Telegraf<MyContext>(botToken)

    const message = isRussian
      ? '❌ Произошла ошибка при обработке платежа. Пожалуйста, свяжитесь с поддержкой.'
      : '❌ An error occurred while processing the payment. Please contact support.'

    await bot.telegram.sendMessage(telegram_id, message)

    logger.info('✅ Сообщение об ошибке отправлено', {
      description: 'Error message sent',
      telegram_id,
    })
  } catch (sendError) {
    logger.error('❌ Ошибка при отправке сообщения об ошибке', {
      description: 'Error sending error message',
      telegram_id,
      error: sendError instanceof Error ? sendError.message : 'Unknown error',
    })
  }
}
