import { inngest } from './clients'
import { logger } from '../utils/logger'
import { convertAudioToText } from '../core/voiceToText/convertAudioToText'
import { CustomError } from '../utils/customError'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export const voiceToTextProcessor = inngest.createFunction(
  { id: 'voice-to-text' },
  { event: 'voice/to-text' },
  async ({ event }) => {
    const { fileUrl, telegram_id, service_type } = event.data

    logger.info('🎙️ Starting voice to text conversion', {
      telegram_id,
      service_type,
      fileUrl,
    })

    try {
      // Получаем файл по URL
      const response = await fetch(fileUrl)
      const buffer = await response.arrayBuffer()

      // Проверяем размер файла
      if (buffer.byteLength > MAX_FILE_SIZE) {
        throw new CustomError(
          'File size exceeds maximum allowed',
          'FILE_SIZE_ERROR'
        )
      }

      // Конвертируем аудио в текст
      const result = await convertAudioToText(fileUrl)

      logger.info('✅ Voice successfully converted to text', {
        telegram_id,
        service_type,
        text_length: result.text.length,
      })

      return { text: result.text }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      logger.error('❌ Error converting voice to text', {
        telegram_id,
        service_type,
        error: errorMessage,
      })

      throw new CustomError(
        'Failed to convert voice to text',
        'CONVERSION_ERROR',
        error instanceof Error ? error : undefined
      )
    }
  }
)

// Экспортируем функцию для использования в других модулях
export const functions = [voiceToTextProcessor]
