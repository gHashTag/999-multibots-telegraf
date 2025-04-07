import { logger } from '@/utils/logger'
import { TestResult } from './interfaces'
import { runBalanceTests } from './run-balance-test'
import { testPaymentSystem } from './tests/payment.test'

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test'

export async function runAllTests(): Promise<TestResult[]> {
  const allResults: TestResult[] = []

  try {
    logger.info('🚀 Запуск всех тестов', {
      description: 'Starting all tests',
    })

    // Запускаем тесты баланса
    const balanceResults = await runBalanceTests()
    allResults.push(...balanceResults)

    // Запускаем тесты платежной системы
    const paymentResults = await testPaymentSystem()
    allResults.push(paymentResults)

    return allResults
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов',
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return [
      {
        name: 'All Tests',
        success: false,
        message: `Ошибка при запуске тестов: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ]
  }
}

async function runTests() {
  try {
    const results = await runAllTests()

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
      message: '❌ Ошибка при выполнении тестов',
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// Запускаем тесты
runTests()
