import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { testPaymentProcessing } from './core/paymentProcessor.test'
import { testRuPaymentIntegration } from './integrations/test-ru-payment'

/**
 * Запускает все тесты платежной системы
 */
export async function runPaymentTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск всех тестов платежной системы')

  try {
    const results: TestResult[] = []

    // Запускаем тесты платежного процессора
    results.push(await testPaymentProcessing())

    // Запускаем тесты интеграций
    results.push(await testRuPaymentIntegration())

    // Подсчитываем результаты
    const passedTests = results.filter(r => r.success).length
    const totalTests = results.length

    logger.info(
      `✅ Завершено ${passedTests}/${totalTests} тестов платежной системы`
    )

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов платежной системы:', error)

    return [
      {
        success: false,
        name: 'Payment System Tests',
        message: error instanceof Error ? error.message : String(error),
      },
    ]
  }
}

// Если файл запущен напрямую
if (require.main === module) {
  runPaymentTests()
    .then(() => logger.info('✅ Тесты успешно завершены'))
    .catch(error => {
      logger.error('❌ Ошибка выполнения тестов:', error)
      process.exit(1)
    })
}
