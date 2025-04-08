import { pulseBot } from '@/core/bot'
import * as fs from 'fs'
import { Logger as logger } from '@/utils/logger'
import { TelegramId } from '@/interfaces/telegram.interface'
export const pulseNeuroImageV2 = async (
  imagePath: string,
  prompt: string,
  command: string,
  telegram_id: TelegramId,
  username: string,
  is_ru: boolean
) => {
  try {
    // if (process.env.NODE_ENV === 'development') return

    if (!imagePath) {
      throw new Error('Invalid data received in pulseNeuroImageV2')
    }

    if (!prompt) {
      throw new Error('Invalid prompt received in pulseNeuroImageV2')
    }

    // Проверяем - получаем ли мы URL или путь к файлу
    const isLocalFile =
      !imagePath.startsWith('http') && fs.existsSync(imagePath)

    logger.info({
      message: '📤 Отправка изображения в пульс',
      description: 'Sending image to pulse channel',
      isLocalFile,
      imagePath: imagePath.substring(0, 50) + '...',
    })

    const truncatedPrompt = prompt.length > 800 ? prompt.slice(0, 800) : prompt
    const caption = is_ru
      ? `@${
          username || 'Пользователь без username'
        } Telegram ID: ${telegram_id} сгенерировал изображение с промптом: ${truncatedPrompt} \n\n Команда: ${command}`
      : `@${
          username || 'User without username'
        } Telegram ID: ${telegram_id} generated an image with a prompt: ${truncatedPrompt} \n\n Command: ${command}`

    const chatId = '@neuro_blogger_pulse'

    // Используем локальный файл если это возможно
    if (isLocalFile) {
      await pulseBot.telegram.sendPhoto(
        chatId,
        { source: fs.createReadStream(imagePath) },
        { caption }
      )
    } else {
      // Fallback на URL, хотя скорее всего не сработает
      await pulseBot.telegram.sendPhoto(chatId, imagePath, { caption })
    }

    logger.info({
      message: '✅ Изображение успешно отправлено в пульс',
      description: 'Image successfully sent to pulse channel',
      telegram_id,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка отправки в пульс',
      description: 'Error sending to pulse channel',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : null,
    })
    throw new Error('Error sending pulse')
  }
}
