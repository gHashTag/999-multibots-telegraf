import { logger } from '@/utils/logger'
import { runTests } from './runTests'
import { testRuBillWizardSceneSimple } from './tests/rubill/ruBillWizardTest2'

/**
 * Запускает все тесты для RuBillWizard
 */
export async function runRuBillTests() {
  logger.info('🚀 Запуск тестов RuBillWizard', {
    description: 'Running RuBillWizard tests',
  })

  try {
    const results = await runTests([
      testRuBillWizardSceneSimple,
      // Здесь можно добавить дополнительные тесты для RuBillWizard
    ])

    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const totalTests = results.length

    if (failedTests === 0) {
      logger.info('✅ Все тесты RuBillWizard пройдены успешно', {
        description: 'All RuBillWizard tests passed successfully',
        passedTests,
        totalTests,
      })
    } else {
      logger.error('❌ Некоторые тесты RuBillWizard не пройдены', {
        description: 'Some RuBillWizard tests failed',
        passedTests,
        failedTests,
        totalTests,
      })
    }

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов RuBillWizard', {
      description: 'Error running RuBillWizard tests',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// Автоматически запускать тесты при вызове скрипта напрямую
if (require.main === module) {
  runRuBillTests()
    .then(() => {
      logger.info('🏁 Завершение запуска тестов RuBillWizard', {
        description: 'Finished running RuBillWizard tests',
      })
    })
    .catch(error => {
      logger.error('💥 Критическая ошибка при запуске тестов RuBillWizard', {
        description: 'Critical error running RuBillWizard tests',
        error: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    })
}
