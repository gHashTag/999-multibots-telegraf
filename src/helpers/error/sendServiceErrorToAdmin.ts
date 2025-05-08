import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isDev } from '@/config'
import logger from '@/utils/logger'

const ADMIN_CHAT_ID = '@neuro_coder_privat' // Или используй переменную окружения

/**
 * Отправляет сообщение об ошибке администратору напрямую через bot.telegram.
 * Используется в сервисах, где нет доступа к ctx.
 */
export const sendServiceErrorToAdmin = async (
  ctx: MyContext,
  culpritTelegramId: string, // ID пользователя, у которого произошла ошибка
  error: Error
): Promise<void> => {
  if (isDev) {
    // В режиме разработки не спамим админский чат
    logger.warn('Skipping admin error notification in dev mode', {
      culpritTelegramId,
      error: error.message,
    })
    return
  }

  try {
    const message = `❌ Произошла ошибка у пользователя ${culpritTelegramId}.\n\nОшибка: ${
      error.message
    }\nСтек: ${error.stack || 'N/A'}`
    // Урезаем сообщение, если оно слишком длинное для Telegram
    const truncatedMessage =
      message.length > 4000 ? message.substring(0, 4000) + '...' : message

    await ctx.telegram.sendMessage(ADMIN_CHAT_ID, truncatedMessage)
    logger.info(`Sent service error message to admin chat ${ADMIN_CHAT_ID}`, {
      culpritTelegramId,
      error: error.message,
    })
  } catch (sendError) {
    logger.error('Failed to send service error message to admin', {
      adminChatId: ADMIN_CHAT_ID,
      culpritTelegramId,
      originalError: error.message,
      sendError,
    })
  }
}
