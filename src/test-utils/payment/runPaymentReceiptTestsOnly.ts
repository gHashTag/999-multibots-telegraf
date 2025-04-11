import { logger } from '@/utils/logger'
import { runTests } from '../runTests'
import { testPaymentReceiptGeneration } from '../tests/payment/paymentReceiptTest'
import { testReceiptCommand } from '../tests/payment/receiptCommandTest'

/**
 * Запускает тесты для платежных чеков
 */
export async function runPaymentReceiptTests() {
  logger.info('🚀 Запуск тестов платежных чеков', {
    description: 'Running payment receipt tests',
  })

  try {
    const results = await runTests([
      testPaymentReceiptGeneration,
      testReceiptCommand,
      // Здесь можно добавить дополнительные тесты для платежных чеков
    ])

    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const totalTests = results.length

    if (failedTests === 0) {
      logger.info('✅ Все тесты платежных чеков пройдены успешно', {
        description: 'All payment receipt tests have passed successfully',
        passedTests,
        totalTests,
      })
    } else {
      logger.error('❌ Некоторые тесты платежных чеков не пройдены', {
        description: 'Some payment receipt tests have failed',
        passedTests,
        failedTests,
        totalTests,
      })
    }

    return results
  } catch (error: any) {
    logger.error('❌ Ошибка при запуске тестов платежных чеков', {
      description: 'Error running payment receipt tests',
      error: error.message,
      stack: error.stack,
    })
    throw error
  }
}

// Если файл запускается напрямую, выполняем тесты
if (require.main === module) {
  runPaymentReceiptTests()
    .then(() => {
      logger.info('🏁 Выполнение тестов платежных чеков завершено', {
        description: 'Payment receipt tests execution completed',
      })
      process.exit(0)
    })
    .catch(error => {
      logger.error(
        '❌ Критическая ошибка при выполнении тестов платежных чеков',
        {
          description: 'Critical error during payment receipt tests execution',
          error: error.message,
          stack: error.stack,
        }
      )
      process.exit(1)
    })
}
