import { getBotByName } from '@/core/bot'
import { logger } from '@/utils/logger'

export async function getFileLink(
  file_id: string,
  bot_name: string
): Promise<string | null> {
  try {
    const botResult = getBotByName(bot_name)
    if (!botResult || !botResult.bot) {
      throw new Error(`Bot not found: ${bot_name}`)
    }

    const { bot, token } = botResult
    const file = await bot.telegram.getFile(file_id)
    const fileLink = `https://api.telegram.org/file/bot${token}/${file.file_path}`

    logger.info('✅ Получена ссылка на файл:', {
      description: 'Got file link from Telegram',
      bot_name,
      file_id,
    })

    return fileLink
  } catch (error) {
    logger.error('❌ Ошибка при получении ссылки на файл:', {
      description: 'Error getting file link from Telegram',
      error: error instanceof Error ? error.message : String(error),
      bot_name,
      file_id,
    })
    return null
  }
}
