export interface TestResult {
  success: boolean
  message: string
  name: string
}

export interface TestError extends Error {
  name: string
  message: string
  stack?: string
}
