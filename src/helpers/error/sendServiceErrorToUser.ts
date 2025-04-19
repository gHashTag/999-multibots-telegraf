import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import logger from '@/utils/logger'

/**
 * Отправляет сообщение об ошибке пользователю напрямую через bot.telegram.
 * Используется в сервисах, где нет доступа к ctx.
 */
export const sendServiceErrorToUser = async (
  bot: Telegraf<MyContext>,
  telegramId: string,
  error: Error,
  isRu: boolean
): Promise<void> => {
  try {
    const message = isRu
      ? `❌ Произошла ошибка.\n\nОшибка: ${error.message}`
      : `❌ An error occurred.\n\nError: ${error.message}`

    await bot.telegram.sendMessage(telegramId, message)
    logger.info(`Sent service error message to user ${telegramId}`, {
      telegramId,
      error: error.message,
    })
  } catch (sendError) {
    logger.error('Failed to send service error message to user', {
      telegramId,
      originalError: error.message,
      sendError,
    })
  }
}
