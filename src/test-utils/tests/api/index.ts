import { runApiTests } from './apiHealthTest'
import { TestResult } from '../../types'
import { logger } from '@/utils/logger'

/**
 * Запускает все API тесты
 */
export async function runAllApiTests(): Promise<TestResult[]> {
  logger.info({
    message: '🚀 Запуск всех API тестов',
    description: 'Running all API tests',
  })

  const results: TestResult[] = []

  // Выполняем все тесты API
  const apiTestResult = await runApiTests()
  results.push(apiTestResult)

  // Здесь можно добавить дополнительные тесты API

  logger.info({
    message: '✅ Все API тесты выполнены',
    description: 'All API tests completed',
    successCount: results.filter(r => r.success).length,
    totalCount: results.length,
  })

  return results
}

// Экспортируем функции для использования в других местах
export { runApiTests }
