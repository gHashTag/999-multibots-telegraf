import axios, { isAxiosError } from 'axios'
import { logger } from './logger'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB - максимальный размер для Telegram

export async function downloadFile(url: string): Promise<Buffer> {
  try {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw new Error(`Invalid URL received: ${url}`)
    }

    logger.info('📥 Начало загрузки файла', {
      description: 'Starting file download',
      url,
    })

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5,
      validateStatus: status => status === 200,
    })

    if (!response.data) {
      throw new Error('Empty response data')
    }

    const buffer = Buffer.from(response.data)

    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(
        `File size (${buffer.length} bytes) exceeds Telegram limit of ${MAX_FILE_SIZE} bytes`
      )
    }

    logger.info('✅ Файл успешно загружен', {
      description: 'File downloaded successfully',
      size: buffer.length,
    })

    return buffer
  } catch (error) {
    logger.error('❌ Ошибка при загрузке файла', {
      description: 'Error downloading file',
      error: error instanceof Error ? error.message : 'Unknown error',
      url,
    })

    if (isAxiosError(error)) {
      logger.error('🔍 Детали ошибки Axios', {
        description: 'Axios error details',
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
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
