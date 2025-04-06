/**
 * Интерфейс результата теста
 */
export interface TestResult {
  testName: string
  success: boolean
  message: string
  error?: string | Error
}
