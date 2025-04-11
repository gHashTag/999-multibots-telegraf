import { logger } from '@/utils/logger'
import { runTests } from './runTests'
import { testSelectModelWizardPaymentIntegration } from './tests/payment/selectModelWizardPaymentTest'

/**
 * Запускает все тесты для SelectModelWizard
 */
export async function runSelectModelTests() {
  logger.info('🚀 Запуск тестов SelectModelWizard', {
    description: 'Running SelectModelWizard tests',
  })

  try {
    const results = await runTests([
      testSelectModelWizardPaymentIntegration,
      // Здесь можно добавить дополнительные тесты для SelectModelWizard
    ])

    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const totalTests = results.length

    if (failedTests === 0) {
      logger.info('✅ Все тесты SelectModelWizard пройдены успешно', {
        description: 'All SelectModelWizard tests passed successfully',
        passedTests,
        totalTests,
      })
    } else {
      logger.error('❌ Есть ошибки в тестах SelectModelWizard', {
        description: 'Some SelectModelWizard tests failed',
        passedTests,
        failedTests,
        totalTests,
      })
    }

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов SelectModelWizard', {
      description: 'Error running SelectModelWizard tests',
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
}

// Если файл запущен напрямую, запускаем тесты
if (require.main === module) {
  runSelectModelTests()
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      logger.error(
        '❌ Критическая ошибка при запуске тестов SelectModelWizard',
        {
          description: 'Critical error running SelectModelWizard tests',
          error: error instanceof Error ? error.message : String(error),
        }
      )
      process.exit(1)
    })
}
