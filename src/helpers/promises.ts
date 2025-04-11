import { logger } from '@/utils/logger'

interface RetryOptions {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
}

/**
 * Выполняет функцию с повторными попытками и экспоненциальной задержкой
 * @param fn Функция для выполнения
 * @param options Параметры повторных попыток
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000,
  }
): Promise<T> {
  let lastError: Error | undefined
  let attempt = 1

  while (attempt <= options.maxAttempts) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === options.maxAttempts) {
        logger.error('❌ Все попытки исчерпаны', {
          description: 'All retry attempts exhausted',
          error: lastError.message,
          attempt,
          maxAttempts: options.maxAttempts,
        })
        throw lastError
      }

      const delay = Math.min(
        options.initialDelay * Math.pow(2, attempt - 1),
        options.maxDelay
      )

      logger.info('🔄 Повторная попытка', {
        description: 'Retrying operation',
        attempt,
        maxAttempts: options.maxAttempts,
        delay,
        error: lastError.message,
      })

      await new Promise(resolve => setTimeout(resolve, delay))
      attempt++
    }
  }

  throw lastError
}
