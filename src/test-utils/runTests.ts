/**
 * Custom test runner for running tests without Jest dependencies
 * This file provides a simple way to run all tests in the project
 */

import { logger } from '@/utils/logger'
import path from 'path'
import fs from 'fs'

// Import test modules
import { testTextToVideo } from './tests/neuro/text-to-video/textToVideo.test'

// Configuration
const TEST_TIMEOUT = 60000 // 60 seconds
const ENABLE_COLOR = true

// Colors for console output
const colors = {
  reset: ENABLE_COLOR ? '\x1b[0m' : '',
  green: ENABLE_COLOR ? '\x1b[32m' : '',
  red: ENABLE_COLOR ? '\x1b[31m' : '',
  yellow: ENABLE_COLOR ? '\x1b[33m' : '',
  blue: ENABLE_COLOR ? '\x1b[34m' : '',
  magenta: ENABLE_COLOR ? '\x1b[35m' : '',
  cyan: ENABLE_COLOR ? '\x1b[36m' : '',
}

// Test results
interface TestResult {
  name: string
  success: boolean
  duration: number
  error?: Error
}

// Test statistics
interface TestStats {
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
}

/**
 * Run a single test with timeout
 */
async function runTest(
  name: string,
  testFn: () => Promise<any>
): Promise<TestResult> {
  logger.info(`${colors.blue}Running test:${colors.reset} ${name}`)
  console.time(`Test: ${name}`)

  const startTime = Date.now()

  try {
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Test timed out after ${TEST_TIMEOUT}ms`)),
        TEST_TIMEOUT
      )
    })

    // Race the test against the timeout
    await Promise.race([testFn(), timeoutPromise])

    const duration = Date.now() - startTime
    console.timeEnd(`Test: ${name}`)
    logger.info(
      `${colors.green}✓ Test passed:${colors.reset} ${name} (${duration}ms)`
    )

    return {
      name,
      success: true,
      duration,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    console.timeEnd(`Test: ${name}`)

    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    logger.error(
      `${colors.red}✗ Test failed:${colors.reset} ${name} (${duration}ms)`,
      {
        error: errorMessage,
        stack: errorStack,
      }
    )

    return {
      name,
      success: false,
      duration,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

/**
 * Run all available tests
 */
async function runAllTests() {
  console.log(`\n${colors.magenta}=== Starting Test Suite ===${colors.reset}\n`)
  const startTime = Date.now()

  const tests = [
    { name: 'Text to Video', fn: testTextToVideo },
    // Add more tests here as they're converted from Jest
  ]

  const results: TestResult[] = []

  for (const test of tests) {
    const result = await runTest(test.name, test.fn)
    results.push(result)
  }

  const totalDuration = Date.now() - startTime
  const stats: TestStats = {
    total: results.length,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    skipped: 0, // We don't have a skip mechanism yet
    duration: totalDuration,
  }

  // Print summary
  console.log(`\n${colors.magenta}=== Test Results ===${colors.reset}`)
  console.log(`${colors.blue}Total:${colors.reset}   ${stats.total}`)
  console.log(`${colors.green}Passed:${colors.reset}  ${stats.passed}`)
  console.log(`${colors.red}Failed:${colors.reset}  ${stats.failed}`)
  console.log(`${colors.yellow}Skipped:${colors.reset} ${stats.skipped}`)
  console.log(`${colors.cyan}Time:${colors.reset}    ${stats.duration}ms`)

  // Print failed tests
  if (stats.failed > 0) {
    console.log(`\n${colors.red}=== Failed Tests ===${colors.reset}`)
    results
      .filter(r => !r.success)
      .forEach(result => {
        console.log(`\n${colors.red}✗ ${result.name}${colors.reset}`)
        if (result.error) {
          console.log(`  ${result.error.message}`)
          if (result.error.stack) {
            console.log(
              `  ${result.error.stack.split('\n').slice(1).join('\n  ')}`
            )
          }
        }
      })
  }

  console.log(`\n${colors.magenta}=== Test Suite Complete ===${colors.reset}\n`)

  // Return exit code based on test results
  return stats.failed === 0 ? 0 : 1
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
    .then(exitCode => {
      process.exit(exitCode)
    })
    .catch(error => {
      console.error('Error running tests:', error)
      process.exit(1)
    })
}

export { runAllTests, runTest }
