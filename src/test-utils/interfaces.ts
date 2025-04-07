/**
 * Интерфейс результата теста
 */
export interface TestResult {
  name: string
  success: boolean
  message: string
  details?: any
  error?: string | Error
  duration?: number
}

/**
 * Интерфейс для ошибки теста с дополнительным контекстом
 */
export interface TestError extends Error {
  context?: Record<string, unknown>
  code?: string
  timestamp?: number
}

/**
 * Тип для логирования ошибок в тестах
 */
export type TestLogError = {
  message: string
  description: string
  error: Error | string
  context?: Record<string, unknown>
  code?: string
}

export interface LogData {
  message: string
  description?: string
  [key: string]: any
}
