import { logger } from '@/utils/logger'
import { runBalanceTests } from './tests/balance.test'
import { runStatsTests } from './tests/stats.test'
import { runClientsMigrationTests } from './tests/clients-migration.test'

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test'

const runTests = async () => {
  try {
    logger.info('🚀 Начало тестирования', {
      description: 'Starting test suite',
    })

    const testResults = [
      ...(await runBalanceTests()),
      ...(await runStatsTests()),
      ...(await runClientsMigrationTests()),
    ]

    const totalTests = testResults.length
    const successfulTests = testResults.filter(test => test.success).length
    const failedTests = totalTests - successfulTests
    const successRate = ((successfulTests / totalTests) * 100).toFixed(2)

    logger.info('📊 Результаты тестирования', {
      description: 'Test results summary',
      total_tests: totalTests,
      successful_tests: successfulTests,
      failed_tests: failedTests,
      success_rate: `${successRate}%`,
    })

    // Вывод деталей для неуспешных тестов
    const failedTestDetails = testResults
      .filter(test => !test.success)
      .map(test => ({
        name: test.name,
        message: test.message,
        details: test.details,
      }))

    if (failedTestDetails.length > 0) {
      logger.error('❌ Детали неуспешных тестов', {
        description: 'Failed tests details',
        failed_tests: failedTestDetails,
      })
    }

    process.exit(failedTests > 0 ? 1 : 0)
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

// Запускаем тесты
runTests()
