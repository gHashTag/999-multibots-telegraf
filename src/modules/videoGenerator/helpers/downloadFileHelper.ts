import axios, { isAxiosError } from 'axios'
import { logger } from '@/utils/logger'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB - максимальный размер для Telegram

export async function downloadFileHelper(
  url: string,
  maxRetries = 3
): Promise<Buffer> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error(`Invalid URL received: ${url}`)
  }

  let lastError: Error | null = null

  // Retry механизм для обработки сетевых ошибок
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[downloadFileHelper] Attempt ${attempt}/${maxRetries}`, {
        url: url.substring(0, 100) + '...',
        attempt,
      })

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxRedirects: 5,
        // Abort the download once the body exceeds the Telegram limit instead of
        // buffering an unbounded response into memory: the post-download
        // buffer.length check below only fires AFTER the whole file is in RAM,
        // so a hostile/huge URL could OOM the shared process before it runs.
        maxContentLength: MAX_FILE_SIZE,
        maxBodyLength: MAX_FILE_SIZE,
        validateStatus: status => status === 200,
        headers: {
          'User-Agent': 'TelegramBot/1.0 (compatible; VideoGenerator)',
          Accept: 'image/*,video/*,*/*',
        },
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

      logger.info('[downloadFileHelper] Successfully downloaded file', {
        attempt,
        size: buffer.length,
        url: url.substring(0, 100) + '...',
      })

      return buffer
    } catch (error) {
      lastError = error as Error

      // Логируем детали ошибки
      if (isAxiosError(error)) {
        logger.error(`[downloadFileHelper] Axios error on attempt ${attempt}`, {
          attempt,
          status: error.response?.status,
          statusText: error.response?.statusText,
          code: error.code,
          message: error.message,
          url: url.substring(0, 100) + '...',
        })

        // Если получили 404 или другую постоянную ошибку, не повторяем
        if (
          error.response?.status &&
          [404, 403, 401, 400].includes(error.response.status)
        ) {
          throw new Error(
            `Permanent error (${error.response.status}): ${error.message}`
          )
        }
      } else {
        logger.error(`[downloadFileHelper] Error on attempt ${attempt}`, {
          attempt,
          error: lastError.message,
          url: url.substring(0, 100) + '...',
        })
      }

      // Если это последняя попытка, пробрасываем ошибку
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to download file after ${maxRetries} attempts: ${
            lastError instanceof Error ? lastError.message : 'Unknown error'
          }`
        )
      }

      // Ждем перед следующей попыткой с увеличивающейся задержкой
      const waitTime = 2000 * attempt // 2, 4, 6 секунд
      logger.info(`[downloadFileHelper] Waiting ${waitTime}ms before retry`, {
        attempt,
        waitTime,
      })

      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  throw lastError || new Error('Download failed for unknown reason')
}
