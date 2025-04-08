import { Logger as logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'
import { Telegraf } from 'telegraf'

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
