import { InngestTester } from './inngest-tests'
import { logger } from '@/utils/logger'

async function runTests() {
  logger.info({
    message: '🚀 Запуск тестов',
    description: 'Starting tests',
  })

  const tester = new InngestTester()

  try {
    // Запускаем тесты платежей
    const results = await tester.runAllTests()

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
