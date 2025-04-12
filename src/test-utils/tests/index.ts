import { logger } from '../../utils/logger'
import { testApiHealth } from './apiHealthTest'
import { TestResult } from '../types'

/**
 * Запуск тестов API
 */
export async function runApiTests(): Promise<TestResult[]> {
  logger.info('🚀 [TEST_RUNNER]: Запуск тестов API', {
    description: 'Running API tests',
  })

  // Запускаем тест API
  const result = await testApiHealth()

  logger.info(
    `📊 [TEST_RUNNER]: Результаты теста API: ${result.success ? 'успешно' : 'не пройден'}`,
    {
      description: 'API test results',
      success: result.success,
      message: result.message,
    }
  )

  return [result]
}

/**
 * Главная функция для запуска всех тестов
 */
export async function runAllTests(): Promise<TestResult[]> {
  logger.info('🚀 [TEST_RUNNER]: Запуск всех тестов', {
    description: 'Running all tests',
  })

  const testSuites = [
    { name: 'API Tests', fn: runApiTests },
    // Здесь можно добавить другие наборы тестов
  ]

  const allResults: TestResult[] = []

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
  runAllTests().catch(error => {
    logger.error('❌ Ошибка при запуске тестов:', error)
    process.exit(1)
  })
}

// Экспортируем функции для запуска тестов
export { testApiHealth }
