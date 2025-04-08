import { TestResult } from './types'
import { logger } from '../utils/logger'

/**
 * Runs a single test and returns the result
 */
export async function runTest(
  testFn: () => Promise<TestResult>,
  name: string
): Promise<TestResult> {
  const startTime = Date.now()
  logger.info(`🚀 Starting test: ${name}`)

  try {
    const result = await testFn()
    const endTime = Date.now()
    const duration = endTime - startTime

    result.startTime = startTime
    result.endTime = endTime
    result.duration = duration

    if (result.success) {
      logger.info(`✅ Test passed: ${name} (${duration}ms)`)
    } else {
      logger.error(
        `❌ Test failed: ${name} (${duration}ms) - ${result.message}`
      )
    }

    return result
  } catch (error: any) {
    const endTime = Date.now()
    const duration = endTime - startTime

    logger.error(
      `❌ Test error: ${name} (${duration}ms) - ${error?.message || 'Unknown error'}`
    )

    return {
      success: false,
      message: error?.message || 'Unknown error',
      name,
      startTime,
      endTime,
      duration,
    }
  }
}

/**
 * Runs multiple tests in sequence and returns array of results
 */
export async function runTests(
  tests: Array<{ fn: () => Promise<TestResult>; name: string }>
): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  logger.info(`🎯 Starting test suite with ${tests.length} tests`)

  for (const test of tests) {
    const result = await runTest(test.fn, test.name)
    results.push(result)
  }

  const endTime = Date.now()
  const duration = endTime - startTime
  const passed = results.filter(r => r.success).length
  const failed = results.length - passed

  logger.info(`
🏁 Test suite completed in ${duration}ms
✅ Passed: ${passed}
❌ Failed: ${failed}
  `)

  return results
}

/**
 * Runs a test with retry logic
 */
export async function runTestWithRetry(
  testFn: () => Promise<TestResult>,
  name: string,
  maxRetries = 3,
  initialDelay = 1000
): Promise<TestResult> {
  let attempt = 0
  const startTime = Date.now()

  while (attempt < maxRetries) {
    try {
      const result = await testFn()

      if (result.success) {
        return {
          ...result,
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
        }
      }

      attempt++
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1)
        logger.info(
          `🔄 Retrying test: ${name} (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    } catch (error: any) {
      attempt++
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1)
        logger.error(
          `❌ Test error: ${name} (attempt ${attempt}/${maxRetries}) - ${error?.message || 'Unknown error'}`
        )
        logger.info(`🔄 Retrying after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        return {
          success: false,
          message: error?.message || 'Unknown error',
          name,
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
        }
      }
    }
  }

  return {
    success: false,
    message: `Test failed after ${maxRetries} attempts`,
    name,
    startTime,
    endTime: Date.now(),
    duration: Date.now() - startTime,
  }
}
