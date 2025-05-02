// import { Telegram } from 'telegraf/typings/core/types/typegram'
import { MyContext } from '@/interfaces'
import { isDev } from '@/config'
import logger from '@/utils/logger'
import { getBotByName } from '@/core/bot' // Импортируем getBotByName
import { toBotName } from '@/helpers/botName.helper' // Импортируем валидатор

const ADMIN_CHAT_ID = '@neuro_coder_privat' // Или используй переменную окружения

/**
 * Отправляет сообщение об ошибке администратору.
 * Используется в сервисах.
 */
export const sendServiceErrorToAdmin = async (
  // ctx: MyContext,
  bot_name: string, // Принимаем имя бота
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
    // Получаем инстанс бота по имени
    const botResult = getBotByName(toBotName(bot_name))
    if (!botResult.bot) {
      logger.error('Failed to get bot instance in sendServiceErrorToAdmin', {
        bot_name,
        error: botResult.error,
      })
      return
    }

    const message = `❌ Произошла ошибка у пользователя ${culpritTelegramId} (бот: ${bot_name}).\n\nОшибка: ${
      error.message
    }\nСтек: ${error.stack || 'N/A'}`
    // Урезаем сообщение, если оно слишком длинное для Telegram
    const truncatedMessage =
      message.length > 4000 ? message.substring(0, 4000) + '...' : message

    // Используем bot.telegram для отправки
    await botResult.bot.telegram.sendMessage(ADMIN_CHAT_ID, truncatedMessage)
    logger.info(`Sent service error message to admin chat ${ADMIN_CHAT_ID}`, {
      bot_name,
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
