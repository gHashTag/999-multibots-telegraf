/**
 * Результат выполнения теста
 */
export interface TestResult {
  name: string
  passed: boolean
  success: boolean
  error?: string
  duration: number
  testName: string
  message: string
  details: Record<string, any>
}

export interface TestCase {
  name: string
  test: () => Promise<TestResult>
}

export interface TestSuite {
  name: string
  tests: TestCase[]
}
