/**
 * Интерфейс результата теста
 */
export interface TestResult {
  name: string
  success: boolean
  message: string
  error?: string | Error
}
