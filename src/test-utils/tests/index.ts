import { runTests } from '../runTests'
import { runPaymentProcessorTests } from './paymentProcessorTest'
import { runPaymentProcessorMockTests } from './paymentProcessorMockTest'
import { logger } from '../../utils/logger'

/**
 * Запуск всех тестов платежного процессора
 */
export async function runAllPaymentProcessorTests() {
  logger.info('🚀 [TEST_RUNNER]: Запуск всех тестов платежного процессора', {
    description: 'Running all payment processor tests',
  })

  // Запускаем основные тесты
  const results1 = await runPaymentProcessorTests()

  // Запускаем тесты с моками
  const results2 = await runPaymentProcessorMockTests()

  // Объединяем результаты
  const allResults = [...results1, ...results2]

  // Выводим общие результаты
  const passedTests = allResults.filter(r => r.success).length
  const failedTests = allResults.filter(r => !r.success).length

  logger.info(
    `📊 [TEST_RUNNER]: Общие результаты тестов платежного процессора: ${passedTests} успешно, ${failedTests} не пройдено`,
    {
      description: 'Overall payment processor test results',
      passed: passedTests,
      failed: failedTests,
      total: allResults.length,
    }
  )

  return allResults
}

/**
 * Главная функция для запуска всех тестов
 */
export async function runAllTests() {
  logger.info('🚀 [TEST_RUNNER]: Запуск всех тестов', {
    description: 'Running all tests',
  })

  const testSuites = [
    { name: 'Payment Processor Tests', fn: runAllPaymentProcessorTests },
    // Здесь можно добавить другие наборы тестов
  ]

  const allResults = []

  for (const suite of testSuites) {
    logger.info(`🧪 [TEST_RUNNER]: Запуск набора тестов: ${suite.name}`, {
      description: 'Running test suite',
      suiteName: suite.name,
    })

    const suiteResults = await suite.fn()
    allResults.push(...suiteResults)
  }

  const passedTests = allResults.filter(r => r.success).length
  const failedTests = allResults.filter(r => !r.success).length

  logger.info(
    `📊 [TEST_RUNNER]: Итоговые результаты всех тестов: ${passedTests} успешно, ${failedTests} не пройдено`,
    {
      description: 'Final test results',
      passed: passedTests,
      failed: failedTests,
      total: allResults.length,
      successRate: `${Math.round((passedTests / allResults.length) * 100)}%`,
    }
  )

  return allResults
}

// Если файл запущен напрямую, запускаем все тесты
if (require.main === module) {
  runTests([runAllTests])
}
