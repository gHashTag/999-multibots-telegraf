import { getBotByName } from '@/core/bot'
import { logger } from './logger'

export async function sendModuleTelegramMessage(
  chatId: string,
  text: string,
  botName: string
): Promise<void> {
  const botInstanceResult = getBotByName(botName)
  if (botInstanceResult.error || !botInstanceResult.bot) {
    logger.error(
      `[TelegramNotifier] Failed to get bot instance for ${botName}: ${botInstanceResult.error}`,
      { chatId }
    )
    // In the context of an Inngest function, we might just log the error
    // and not throw, to avoid failing the entire step if a notification fails.
    // However, if notifications are critical, a NonRetriableError could be thrown.
    // For now, just logging.
    return
  }
  const bot = botInstanceResult.bot

  try {
    await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' })
    logger.debug(
      `[TelegramNotifier] Message sent to ${chatId} via ${botName}`,
      { text }
    )
  } catch (error) {
    logger.error(
      `[TelegramNotifier] Failed to send message to ${chatId} via ${botName}`,
      { error, text }
    )
    // Decide if an error should be thrown here based on criticality.
  }
}
