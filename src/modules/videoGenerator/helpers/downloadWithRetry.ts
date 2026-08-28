import axios from 'axios'
import { logger } from '@/utils/logger'

/**
 * Скачивает файл с повторными попытками при сетевых ошибках
 */
export async function downloadWithRetry(
  url: string,
  maxRetries = 3,
  delayMs = 2000
): Promise<ArrayBuffer> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        `[downloadWithRetry] Attempt ${attempt}/${maxRetries} for URL`,
        {
          url: url.substring(0, 100) + '...',
          attempt,
        }
      )

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 секунд таймаут
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
        },
      })

      if (response.status === 200 && response.data) {
        logger.info('[downloadWithRetry] Successfully downloaded file', {
          attempt,
          size: response.data.byteLength,
        })
        return response.data
      }

      throw new Error(`Unexpected response status: ${response.status}`)
    } catch (error) {
      lastError = error as Error

      logger.error(`[downloadWithRetry] Attempt ${attempt} failed`, {
        attempt,
        maxRetries,
        error: lastError.message,
        url: url.substring(0, 100) + '...',
      })

      // Если это последняя попытка, пробрасываем ошибку
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to download after ${maxRetries} attempts: ${lastError.message}`
        )
      }

      // Ждем перед следующей попыткой с увеличивающейся задержкой
      const waitTime = delayMs * attempt
      logger.info(`[downloadWithRetry] Waiting ${waitTime}ms before retry`, {
        attempt,
        waitTime,
      })

      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  throw lastError || new Error('Download failed for unknown reason')
}
