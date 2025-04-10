/**
 * Скрипт для тестирования вебхуков BFL
 */
import { BFLWebhookTester } from './webhook.test'
import { logger } from '@/utils/logger'
import { TestResult } from './types'

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
    message: '🚀 Запуск тестов BFL вебхуков',
    description: 'Starting BFL webhook tests',
  })

  const tester = new BFLWebhookTester()
  const results = await tester.runAllTests()

  // Подсчитываем статистику
  const successCount = results.filter(r => r.success).length
  const failCount = results.length - successCount

  logger.info({
    message: '📊 Результаты тестов BFL вебхуков',
    description: 'BFL webhook test results',
    successCount,
    failCount,
    totalTests: results.length,
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
