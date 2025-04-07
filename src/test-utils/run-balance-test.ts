import { logger } from '@/utils/logger'
import { TestResult } from './interfaces'
import { testBalance } from './tests/balance.test'

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test'

export async function runBalanceTests(): Promise<TestResult[]> {
  try {
    logger.info('🚀 Запуск тестов баланса', {
      description: 'Starting balance tests',
    })

    const results = await testBalance()
    return Array.isArray(results) ? results : [results]
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов баланса',
      description: 'Error running balance tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return [
      {
        name: 'Balance Tests',
        success: false,
        message: `Ошибка при запуске тестов: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ]
  }
}

async function runTests() {
  logger.info({
    message: '🚀 Запуск тестов баланса',
    description: 'Starting balance tests',
  })

  try {
    const results = await runBalanceTests()

    for (const result of results) {
      logger.info({
        message: result.success
          ? '✅ Тест успешно завершен'
          : '❌ Тест провален',
        description: 'Test completed',
        name: result.name,
        success: result.success,
        details: result.message,
        error: result.error,
      })
    }
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
