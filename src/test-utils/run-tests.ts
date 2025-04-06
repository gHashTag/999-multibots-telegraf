import { logger } from '@/utils/logger'
import { statsTest } from './tests/stats.test'
import { balanceTest } from './tests/balance.test'

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test'

async function runTests() {
  try {
    logger.info('🚀 Запуск тестов...', {
      description: 'Starting tests',
    })

    const results = await Promise.all([statsTest(), balanceTest()])

    const failedTests = results.filter(test => !test.success)

    if (failedTests.length > 0) {
      logger.error('❌ Некоторые тесты не прошли:', {
        description: 'Some tests failed',
        failedTests,
      })
      process.exit(1)
    }

    logger.info('✅ Все тесты успешно пройдены', {
      description: 'All tests passed successfully',
      results,
    })
    process.exit(0)
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов:', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

// Запускаем тесты
runTests()
