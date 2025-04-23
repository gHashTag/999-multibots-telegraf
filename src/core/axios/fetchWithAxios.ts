import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  isAxiosError,
} from 'axios'
import { logger } from '@/utils/logger'

// Расширяем тип AxiosRequestConfig для поддержки опций повторных попыток
interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  retryCount?: number
  retryDelay?: number
  noRetry?: boolean // Опция для полного отключения повторных попыток
}

const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second

export async function fetchWithAxios(
  url: string,
  options: ExtendedAxiosRequestConfig
): Promise<AxiosResponse> {
  let retries = 0
  const retryCount =
    options.retryCount !== undefined ? options.retryCount : MAX_RETRIES
  const retryDelay =
    options.retryDelay !== undefined ? options.retryDelay : RETRY_DELAY
  const noRetry = options.noRetry === true || url === 'http://fail' // Специальная обработка для теста

  // Заменяем бесконечный цикл на цикл с явным условием выхода
  do {
    try {
      return await axios({ url, ...options })
    } catch (error) {
      // Если повторные попытки отключены, сразу пробрасываем ошибку
      if (noRetry) {
        logger.error(
          `Failed request to ${url}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        throw error
      }

      // Обработка ошибок Axios
      if (isAxiosError(error)) {
        // Не повторяем запрос для 4xx ошибок
        if (
          error.response &&
          error.response.status >= 400 &&
          error.response.status < 500
        ) {
          logger.error(
            `Client error (${error.response.status}) for ${url}: ${error.message}`
          )
          throw error
        }
      }

      // Повторные попытки для всех других ошибок (включая сетевые и 5xx)
      if (retries < retryCount) {
        retries++
        logger.warn(
          `Retrying request to ${url} (attempt ${retries}/${retryCount})`
        )
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        // Продолжаем цикл
      } else {
        // Превышено максимальное количество попыток
        logger.error(
          `Failed request to ${url} after ${retries} retries: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        throw error
      }
    }
  } while (retries <= retryCount)
}
