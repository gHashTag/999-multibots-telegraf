import { MyContext } from '@/interfaces'
import { isDev } from '@/config'
import logger from '@/utils/logger'
import { resolveAdminChatId } from '@/helpers/adminChatId'

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

  // The configured admin channel, never a hard-coded one: this file used to
  // send to a stale '@neuro_coder_privat' that nobody read.
  const adminChatId = resolveAdminChatId()
  if (!adminChatId) {
    logger.warn('Admin channel not configured; service error not forwarded', {
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

    await ctx.telegram.sendMessage(adminChatId, truncatedMessage)
    logger.info(`Sent service error message to admin chat ${adminChatId}`, {
      culpritTelegramId,
      error: error.message,
    })
  } catch (sendError) {
    logger.error('Failed to send service error message to admin', {
      adminChatId,
      culpritTelegramId,
      originalError: error.message,
      sendError,
    })
  }
}
