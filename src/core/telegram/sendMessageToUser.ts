import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'

interface SendMessageParams {
  telegram_id: string
  bot_name: string
  text: string
  parse_mode?: 'HTML' | 'Markdown'
}

/**
 * Отправляет сообщение пользователю через Telegram бота
 */
export async function sendMessageToUser({
  telegram_id,
  bot_name,
  text,
  parse_mode = 'HTML',
}: SendMessageParams): Promise<void> {
  try {
    logger.info('📤 Отправка сообщения пользователю', {
      description: 'Sending message to user',
      telegram_id,
      bot_name,
    })

    const { bot, error } = getBotByName(bot_name)
    if (error || !bot) {
      throw new Error(error || `Bot ${bot_name} not found`)
    }

    await bot.telegram.sendMessage(telegram_id, text, {
      parse_mode,
    })

    logger.info('✅ Сообщение успешно отправлено', {
      description: 'Message sent successfully',
      telegram_id,
      bot_name,
    })
  } catch (error) {
    logger.error('❌ Ошибка при отправке сообщения', {
      description: 'Error sending message',
      telegram_id,
      bot_name,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
