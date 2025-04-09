import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'

interface SendMessageParams {
  chat_id: string | number
  text: string
  bot_name: string
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
}

export async function sendMessage({
  chat_id,
  text,
  bot_name,
  parse_mode = 'HTML',
}: SendMessageParams): Promise<boolean> {
  try {
    const botResult = getBotByName(bot_name)
    if (!botResult || !botResult.bot) {
      throw new Error(`Bot not found: ${bot_name}`)
    }

    const { bot } = botResult
    await bot.telegram.sendMessage(chat_id, text, { parse_mode })

    logger.info('✅ Сообщение отправлено:', {
      description: 'Message sent',
      bot_name,
      chat_id,
    })

    return true
  } catch (error) {
    logger.error('❌ Ошибка при отправке сообщения:', {
      description: 'Error sending message',
      error: error instanceof Error ? error.message : String(error),
      bot_name,
      chat_id,
    })
    return false
  }
}
