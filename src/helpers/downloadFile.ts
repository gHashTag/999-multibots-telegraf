import axios, { isAxiosError } from 'axios'
import { logger } from '@/utils/enhancedLogger'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB - максимальный размер для Telegram

/**
 * Универсальная функция для скачивания файлов
 * Используется во всех модулях проекта
 *
 * @param url - URL файла для скачивания
 * @param options - Дополнительные параметры
 * @returns Buffer с содержимым файла
 * @throws Error если скачивание не удалось или файл слишком большой
 */
export async function downloadFile(
  url: string,
  options?: {
    maxFileSize?: number
    timeout?: number
    maxRedirects?: number
  }
): Promise<Buffer> {
  const maxFileSize = options?.maxFileSize || MAX_FILE_SIZE
  const timeout = options?.timeout || 60000
  const maxRedirects = options?.maxRedirects || 5

  try {
    // Валидация URL
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      logger.error('❌ Invalid URL for file download:', { url })
      throw new Error(`Invalid URL received: ${url}`)
    }

    logger.info('📥 Downloading file from URL:', {
      url,
      timeout,
      maxRedirects,
      maxFileSize,
    })

    // Скачивание файла
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout,
      maxRedirects,
      validateStatus: status => status === 200,
    })

    if (!response.data) {
      logger.error('❌ Empty response data from URL:', { url })
      throw new Error('Empty response data')
    }

    const buffer = Buffer.from(response.data)

    // Проверка размера
    if (buffer.length > maxFileSize) {
      logger.error('❌ File size exceeds limit:', {
        url,
        fileSize: buffer.length,
        maxFileSize,
      })
      throw new Error(
        `File size (${buffer.length} bytes) exceeds limit of ${maxFileSize} bytes`
      )
    }

    logger.info('✅ File downloaded successfully:', {
      url,
      fileSize: buffer.length,
    })

    return buffer
  } catch (error) {
    logger.error('❌ Error downloading file:', {
      url,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    if (isAxiosError(error)) {
      logger.error('❌ Axios error details:', {
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers,
        config: {
          url: error.config?.url,
          method: error.config?.method,
        },
      })
    }

    throw new Error(
      `Failed to download file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}
