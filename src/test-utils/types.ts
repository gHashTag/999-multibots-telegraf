export interface TestResult {
  success: boolean
  error?: string
  duration?: number
  testName: string
  message?: string
  details?: string
}
