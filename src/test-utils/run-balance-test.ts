import { logger } from '../utils/logger'
import { runBalanceTest } from './tests/balance-test'

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test'

async function runTests() {
  logger.info({
    message: '🚀 Запуск тестов баланса',
    description: 'Starting balance tests',
  })

  try {
    const result = await runBalanceTest()

    logger.info({
      message: result.success ? '✅ Тест успешно завершен' : '❌ Тест провален',
      description: 'Test completed',
      testName: result.testName,
      success: result.success,
      details: result.message,
      error: result.error,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при выполнении теста',
      description: 'Error running test',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// Запускаем тесты
runTests()
