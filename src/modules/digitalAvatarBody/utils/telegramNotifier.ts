import { Telegraf } from 'telegraf'
import { getBotByName, BotInstanceResult } from '@/core/bot'
import { logger } from './logger'
import { MyContext } from '@/interfaces'

export async function sendModuleTelegramMessage(
  chatId: string,
  text: string,
  botInstanceResult: BotInstanceResult
): Promise<void> {
  if (botInstanceResult.error || !botInstanceResult.bot) {
    logger.error(
      `[TelegramNotifier] Bot instance not provided or invalid: ${botInstanceResult.error || 'Bot instance is null'}`,
      { chatId }
    )
    return
  }
  const bot = botInstanceResult.bot as Telegraf<MyContext>

  try {
    await bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' })
    logger.debug(`[TelegramNotifier] Message sent to ${chatId}`, { text })
  } catch (error) {
    logger.error(`[TelegramNotifier] Failed to send message to ${chatId}`, {
      error,
      text,
    })
  }
}
