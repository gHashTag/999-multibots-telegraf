import { logger } from '@/utils/logger'
import { runTests } from '../runTests'
import { testPaymentReceiptGeneration } from '../tests/payment/paymentReceiptTest'
import { testSimpleReceiptGeneration } from '../tests/payment/simpleReceiptTest'
import { testReceiptCommand } from '../tests/payment/receiptCommandTest'
import { testPaymentProcessor } from '../tests/payment/paymentProcessorTest'
import {
  testSuccessfulPaymentCreation,
  testDuplicatePayment,
  testNonExistentUserPayment,
  testExistingInvIdCheck,
} from '../tests/payment/createSuccessfulPaymentTest'
import { testPaymentNotification } from '../tests/payment/paymentNotification.test'

/**
 * Запускает все тесты платежной системы
 */
export async function runPaymentTests() {
  logger.info('🚀 Запуск тестов платежной системы', {
    description: 'Running payment system tests',
  })

  try {
    const tests = [
      testPaymentReceiptGeneration,
      testSimpleReceiptGeneration,
      testReceiptCommand,
      testPaymentProcessor,
      testSuccessfulPaymentCreation,
      testDuplicatePayment,
      testNonExistentUserPayment,
      testExistingInvIdCheck,
      testPaymentNotification,
    ]

    const results = await runTests(tests)

    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const totalTests = results.length

    if (failedTests === 0) {
      logger.info('✅ Все тесты платежной системы успешно пройдены', {
        description: 'All payment system tests passed successfully',
        passedTests,
        totalTests,
      })
    } else {
      logger.error('❌ Некоторые тесты платежной системы не пройдены', {
        description: 'Some payment system tests failed',
        passedTests,
        failedTests,
        totalTests,
      })
      process.exit(1)
    }

    return results
  } catch (error: any) {
    logger.error('❌ Ошибка при запуске тестов платежной системы', {
      description: 'Error running payment system tests',
      error: error.message,
      stack: error.stack,
    })
    throw error
  }
}

// Если файл запускается напрямую, выполняем тесты
if (require.main === module) {
  runPaymentTests()
    .then(() => {
      logger.info('🏁 Выполнение тестов платежной системы завершено', {
        description: 'Payment system tests execution completed',
      })
      process.exit(0)
    })
    .catch(error => {
      logger.error(
        '❌ Критическая ошибка при выполнении тестов платежной системы',
        {
          description: 'Critical error during payment system tests execution',
          error: error.message,
          stack: error.stack,
        }
      )
      process.exit(1)
    })
}
