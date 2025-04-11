import { logger } from '@/utils/logger'
import { runTests } from '../runTests'
import { testAmbassadorIntegration } from '../tests/ambassador/ambassadorTest'

/**
 * Запускает все тесты для Ambassador
 */
export async function runAmbassadorTests() {
  logger.info('🚀 Запуск тестов Ambassador', {
    description: 'Running Ambassador tests',
  })

  try {
    const results = await runTests([
      testAmbassadorIntegration,
      // Здесь можно добавить дополнительные тесты для Ambassador
    ])

    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const totalTests = results.length

    if (failedTests === 0) {
      logger.info('✅ Все тесты Ambassador пройдены успешно', {
        description: 'All Ambassador tests passed successfully',
        passedTests,
        totalTests,
      })
    } else {
      logger.error('❌ Некоторые тесты Ambassador не прошли', {
        description: 'Some Ambassador tests failed',
        passedTests,
        failedTests,
        totalTests,
      })
    }

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов Ambassador', {
      description: 'Error running Ambassador tests',
      error: error.message,
      stack: error.stack,
    })
    throw error
  }
}
