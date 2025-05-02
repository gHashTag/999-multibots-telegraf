// import { Telegram } from 'telegraf/typings/core/types/typegram'
import { MyContext } from '@/interfaces'
import logger from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { toBotName } from '@/helpers/botName.helper'

/**
 * Отправляет сообщение об ошибке пользователю.
 * Используется в сервисах.
 */
export const sendServiceErrorToUser = async (
  // telegram: Telegram,
  bot_name: string,
  telegramId: string,
  error: Error,
  isRu: boolean
): Promise<void> => {
  try {
    const message = isRu
      ? `❌ Произошла ошибка.\n\nОшибка: ${error.message}`
      : `❌ An error occurred.\n\nError: ${error.message}`

    // Получаем инстанс бота по имени
    const botResult = getBotByName(toBotName(bot_name))
    if (!botResult.bot) {
      logger.error('Failed to get bot instance in sendServiceErrorToUser', {
        bot_name,
        error: botResult.error,
      })
      return
    }

    // Используем bot.telegram для отправки
    await botResult.bot.telegram.sendMessage(telegramId, message)
    logger.info(`Sent service error message to user ${telegramId}`, {
      bot_name,
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
