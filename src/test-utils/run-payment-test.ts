import { logger } from '@/utils/logger'
import { TestResult } from './interfaces'
import { testPaymentSystem } from './tests/payment.test'

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test'

export async function runPaymentTests(): Promise<TestResult[]> {
  try {
    logger.info('🚀 Запуск тестов платежной системы', {
      description: 'Starting payment system tests',
    })

    const result = await testPaymentSystem()
    return [result]
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов платежной системы',
      description: 'Error running payment system tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return [
      {
        name: 'Payment System Tests',
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
    message: '🚀 Запуск тестов платежной системы',
    description: 'Starting payment system tests',
  })

  try {
    const results = await runPaymentTests()

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
