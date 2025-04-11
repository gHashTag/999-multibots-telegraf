import { logger } from '@/utils/logger'
import { runTests } from '../runTests'
import { testRuBillPaymentIntegration } from '../tests/payment/ruBillPaymentTest'

/**
 * Запускает все тесты для RuBill
 */
export async function runRuBillTests() {
  logger.info('🚀 Запуск тестов RuBill', {
    description: 'Running RuBill tests',
  })

  try {
    const results = await runTests([
      testRuBillPaymentIntegration,
      // Здесь можно добавить дополнительные тесты для RuBill
    ])

    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const totalTests = results.length

    if (failedTests === 0) {
      logger.info('✅ Все тесты RuBill пройдены успешно', {
        description: 'All RuBill tests passed successfully',
        passedTests,
        totalTests,
      })
    } else {
      logger.error('❌ Есть ошибки в тестах RuBill', {
        description: 'Some RuBill tests failed',
        passedTests,
        failedTests,
        totalTests,
      })
    }

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов RuBill', {
      description: 'Error running RuBill tests',
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
}

// Если файл запущен напрямую, запускаем тесты
if (require.main === module) {
  runRuBillTests()
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      logger.error('❌ Критическая ошибка при запуске тестов RuBill', {
        description: 'Critical error running RuBill tests',
        error: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    })
}
