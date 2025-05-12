import { getBotByName } from '../core/bot'
import { logger } from './logger'
import type { Message } from 'telegraf/types' // Убедимся, что Message импортируется корректно

/**
 * Отправляет сообщение пользователю от имени указанного бота.
 * Эта функция предназначена для использования в сценариях, где нет прямого доступа к ctx,
 * например, в Inngest воркерах.
 *
 * @param botName Имя бота (как оно определено в конфигурации, например, 'neuro_blogger_bot')
 * @param telegramId ID пользователя Telegram, которому нужно отправить сообщение.
 * @param text Текст сообщения.
 * @param extra Дополнительные параметры для Telegraf sendMessage (например, parse_mode, reply_markup).
 * @returns Promise<Message.TextMessage>.
 * @throws Ошибка, если бот не найден или произошла ошибка при отправке сообщения.
 */
export async function sendTelegramMessageFromWorker(
  botName: string,
  telegramId: string | number,
  text: string,
  extra?: any // Можно уточнить тип, если необходимо, например ExtraSendMessage из telegraf/typings
): Promise<Message.TextMessage> {
  // Явно указываем возвращаемый тип
  logger.info('[sendTelegramMessageFromWorker] Attempting to send message', {
    botName,
    telegramId,
    textLength: text.length,
    hasExtra: !!extra,
  })

  const { bot, error: botError } = getBotByName(botName)

  if (botError || !bot) {
    logger.error('[sendTelegramMessageFromWorker] Failed to get bot instance', {
      botName,
      error: botError || 'Bot instance is undefined',
    })
    throw new Error(`Bot '${botName}' not found or failed to initialize.`)
  }

  // Проверка, что метод sendMessage существует, перед его вызовом
  if (!bot.telegram || typeof bot.telegram.sendMessage !== 'function') {
    logger.error(
      '[sendTelegramMessageFromWorker] bot.telegram.sendMessage is not a function',
      {
        botName,
      }
    )
    throw new Error(
      `bot.telegram.sendMessage is not available for bot '${botName}'.`
    )
  }

  try {
    const result = await bot.telegram.sendMessage(telegramId, text, extra)
    logger.info('[sendTelegramMessageFromWorker] Message sent successfully', {
      botName,
      telegramId,
      messageId: result.message_id,
    })
    return result as Message.TextMessage // Приведение типа, если TypeScript не может его вывести автоматически
  } catch (error) {
    logger.error('[sendTelegramMessageFromWorker] Failed to send message', {
      botName,
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    })
    throw error // Перебрасываем ошибку для дальнейшей обработки (например, Inngest retry)
  }
}
