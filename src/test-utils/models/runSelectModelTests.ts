import { logger } from '@/utils/logger'
import { runTests } from '../runTests'
import { testSelectModelWizardPaymentIntegration } from '../tests/payment/selectModelWizardPaymentTest'

/**
 * Запускает все тесты для SelectModel
 */
export async function runSelectModelTests() {
  logger.info('🚀 Запуск тестов SelectModel', {
    description: 'Running SelectModel tests',
  })

  try {
    const results = await runTests([
      testSelectModelWizardPaymentIntegration,
      // Здесь можно добавить дополнительные тесты для SelectModel
    ])

    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const totalTests = results.length

    if (failedTests === 0) {
      logger.info('✅ Все тесты SelectModel пройдены успешно', {
        description: 'All SelectModel tests passed successfully',
        passedTests,
        totalTests,
      })
    } else {
      logger.error('❌ Есть ошибки в тестах SelectModel', {
        description: 'Some SelectModel tests failed',
        passedTests,
        failedTests,
        totalTests,
      })
    }

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов SelectModel', {
      description: 'Error running SelectModel tests',
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
}
