import { InngestTester } from './inngest-tests'
import { logger } from '@/utils/logger'
import { runBalanceTest } from './tests/balance-test'

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test'

async function runTests() {
  logger.info({
    message: '🚀 Запуск тестов',
    description: 'Starting tests',
  })

  const tester = new InngestTester()

  try {
    // Запускаем тест баланса
    const balanceTestResult = await runBalanceTest()

    // Запускаем тесты платежей
    const inngestResults = await tester.runAllTests()

    const results = [balanceTestResult, ...inngestResults]

    // Выводим результаты
    const successCount = results.filter(r => r.success).length
    const totalTests = results.length

    logger.info({
      message: `✅ Тесты завершены: ${successCount}/${totalTests} успешно`,
      description: 'Tests completed',
      successRate: `${((successCount / totalTests) * 100).toFixed(2)}%`,
      results: results.map(r => ({
        name: r.testName,
        success: r.success,
        message: r.message,
        error: r.error,
      })),
    })
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
