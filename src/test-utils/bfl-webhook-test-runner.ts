/**
 * Скрипт для тестирования вебхуков BFL
 */
import { BFLWebhookTester } from './webhook-tests'
import { logger } from '../utils/logger'
import { TestResult } from './interfaces'

// Интерфейс для итогов тестирования
interface TestSummary {
  success: boolean
  totalTests: number
  successCount: number
  failCount: number
  results: TestResult[]
}

async function runBFLWebhookTests(): Promise<TestSummary> {
  logger.info({
    message: '🚀 Запуск тестов вебхуков BFL',
    description: 'Starting BFL webhook tests',
  })

  const tester = new BFLWebhookTester()
  const results = await tester.runAllTests()

  // Считаем успешные и неуспешные тесты
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  // Выводим результаты
  logger.info({
    message: `✅ Тесты BFL вебхуков завершены: ${successCount} успешно, ${failCount} неуспешно`,
    description: `BFL webhook tests completed: ${successCount} success, ${failCount} failures`,
    results,
  })

  // Выводим детали по каждому тесту
  results.forEach(result => {
    if (result.success) {
      logger.info({
        message: `✓ ${result.name} - ${result.message}`,
        description: `Test passed: ${result.name}`,
        duration: result.duration,
      })
    } else {
      logger.error({
        message: `✗ ${result.name} - ${result.message}`,
        description: `Test failed: ${result.name}`,
        error: result.error,
      })
    }
  })

  return {
    success: failCount === 0,
    totalTests: results.length,
    successCount,
    failCount,
    results,
  }
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  runBFLWebhookTests()
    .then(summary => {
      logger.info({
        message: '📊 Итоги тестирования BFL вебхуков',
        description: 'BFL webhook testing summary',
        summary,
      })

      // Завершаем процесс с соответствующим статусом
      process.exit(summary.success ? 0 : 1)
    })
    .catch(error => {
      logger.error({
        message: '💥 Критическая ошибка при запуске тестов BFL вебхуков',
        description: 'Critical error during BFL webhook tests',
        error: error.message,
        stack: error.stack,
      })
      process.exit(1)
    })
}

export { runBFLWebhookTests }
