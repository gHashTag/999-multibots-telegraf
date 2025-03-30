import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

export const errorMessage = async (
  error: Error,
  telegram_id: string,
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

export const errorMessageAdmin = async (error: Error) => {
  try {
    const adminIds = process.env.ADMIN_IDS?.split(',') || []
    const botToken = process.env.BOT_TOKEN_1

    if (!botToken || adminIds.length === 0) {
      logger.error('❌ Не удалось отправить сообщение администраторам', {
        description: 'Failed to send message to admins',
        error: 'Bot token not found or no admin IDs configured',
      })
      return
    }

    const bot = new Telegraf<MyContext>(botToken)
    const message = `❌ Ошибка в системе:\n${error.message}\n\nStack:\n${error.stack}`

    for (const adminId of adminIds) {
      try {
        await bot.telegram.sendMessage(adminId, message)
        logger.info('✅ Сообщение об ошибке отправлено администратору', {
          description: 'Error message sent to admin',
          adminId,
        })
      } catch (sendError) {
        logger.error('❌ Ошибка при отправке сообщения администратору', {
          description: 'Error sending message to admin',
          adminId,
          error:
            sendError instanceof Error ? sendError.message : 'Unknown error',
        })
      }
    }
  } catch (error) {
    logger.error('❌ Ошибка при отправке сообщения администраторам', {
      description: 'Error sending message to admins',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
