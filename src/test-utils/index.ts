import { TestResult } from '@/types/test.interface'
import { logger } from '@/utils/logger'
import { checkTranslations } from './translationTests'

export async function runTests(): Promise<void> {
  const tests: (() => Promise<TestResult>)[] = [
    checkTranslations,
    // Добавьте другие тесты здесь
  ]

  logger.info('🚀 Starting tests', {
    totalTests: tests.length,
  })

  let passed = 0
  let failed = 0

  for (const test of tests) {
    try {
      const result = await test()
      if (result.success) {
        passed++
        logger.info(`✅ Test passed: ${result.name}`, {
          message: result.message,
        })
      } else {
        failed++
        logger.error(`❌ Test failed: ${result.name}`, {
          message: result.message,
        })
      }
    } catch (error) {
      failed++
      logger.error('❌ Test execution error', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info('🏁 Tests completed', {
    total: tests.length,
    passed,
    failed,
  })

  if (failed > 0) {
    process.exit(1)
  }
}
