#!/usr/bin/env node
import { logger } from '@/utils/logger'
import { TestResult } from '../types'

// Основная функция для запуска тестов
export async function runTests(
  tests: (() => Promise<TestResult>)[]
): Promise<TestResult[]> {
  const results: TestResult[] = []

  for (const test of tests) {
    try {
      const result = await test()
      results.push(result)

      if (!result.success) {
        logger.error(`❌ Test failed: ${result.name}`, {
          description: result.message,
        })
      } else {
        logger.info(`✅ Test passed: ${result.name}`, {
          description: result.message,
        })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      logger.error(`❌ Test execution error: ${errorMessage}`)

      results.push({
        success: false,
        message: `Test execution error: ${errorMessage}`,
        name: 'Unknown Test',
      })
    }
  }

  return results
}

// ... existing code ...
