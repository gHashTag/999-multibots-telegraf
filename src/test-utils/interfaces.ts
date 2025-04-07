/**
 * Интерфейс результата теста
 */
export interface TestResult {
  name: string
  success: boolean
  message: string
  error?: string | Error
  duration?: number
  details?: Record<string, unknown>
  telegram_id?: string
  operation_id?: string
  metadata?: {
    startTime?: number
    endTime?: number
    environment?: string
    testType?: string
  }
  event?: {
    result: TextToVideoResponse
  }
}

/**
 * Интерфейс для результата теста видео
 */
export interface VideoTestResult extends TestResult {
  videoBuffer?: Buffer
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

/**
 * Интерфейс для параметров генерации видео в тестах
 */
export interface TextToVideoParams {
  prompt?: string
  telegram_id?: string
  is_ru?: boolean
  bot_name?: string
  model_id?: string
  _test?: {
    api_error?: boolean
    insufficient_balance?: boolean
  }
}

/**
 * Интерфейс для ответа функции text-to-video
 */
export interface TextToVideoResponse {
  success: boolean
  error?: string
  telegram_id?: string
  operation_id?: string
}
