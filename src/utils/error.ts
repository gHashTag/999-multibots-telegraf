import { AxiosError } from 'axios'

export interface ErrorResponse {
  message?: string
  error?: string
  details?: unknown
  [key: string]: unknown
}

/**
 * Утилита для безопасного получения сообщения об ошибке
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  if (error instanceof AxiosError) {
    return error.response?.data?.message || error.message
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as ErrorResponse

    // Проверяем наличие message или error
    if (typeof err.message === 'string') return err.message
    if (typeof err.error === 'string') return err.error

    // Проверяем вложенные объекты response.data
    if (
      'response' in err &&
      typeof err.response === 'object' &&
      err.response !== null
    ) {
      const response = err.response as ErrorResponse
      if (typeof response.message === 'string') return response.message
      if (typeof response.error === 'string') return response.error

      if (
        'data' in response &&
        typeof response.data === 'object' &&
        response.data !== null
      ) {
        const data = response.data as ErrorResponse
        if (typeof data.message === 'string') return data.message
        if (typeof data.error === 'string') return data.error
      }
    }
  }

  return 'Unknown error'
}

/**
 * Утилита для безопасного получения деталей ошибки
 */
export const getErrorDetails = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    const details: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    }

    if (error.stack) {
      details.stack = error.stack
    }

    if (error instanceof AxiosError) {
      if (error.response) {
        details.response = {
          status: error.response.status,
          data: error.response.data,
        }
      }
      if (error.config) {
        details.request = {
          method: error.config.method,
          url: error.config.url,
        }
      }
    }

    return details
  }

  if (typeof error === 'object' && error !== null) {
    return error as Record<string, unknown>
  }

  return { message: String(error) }
}
