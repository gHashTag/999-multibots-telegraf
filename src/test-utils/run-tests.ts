import { logger } from '@/utils/logger'
import { TestResult } from './types'
import { DatabaseTester } from './database-tests'
import { ReplicateWebhookTester } from './webhook-tests'
import { VoiceTester } from './test-voices'
import { InngestTester } from './inngest-tests'

/**
 * Запускает все тесты и возвращает результаты
 */
export async function runTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов...', {
    description: 'Starting test execution',
  })

  const results: TestResult[] = []

  try {
    // База данных
    const databaseTester = new DatabaseTester()
    const databaseResults = await databaseTester.runAllTests()
    results.push(...databaseResults)

    // Вебхуки
    const webhookTester = new ReplicateWebhookTester()
    const webhookResults = await webhookTester.runAllTests()
    results.push(...webhookResults)

    // Голосовые тесты
    const voiceTester = new VoiceTester()
    const voiceResults = await voiceTester.runAllTests()
    results.push(...voiceResults)

    // Тесты Inngest
    const inngestTester = new InngestTester()
    const inngestResults = await inngestTester.runAllTests()
    results.push(...inngestResults)

    // Выводим статистику
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length
    const totalCount = results.length

    logger.info('📊 Статистика тестов', {
      description: 'Test statistics',
      total: totalCount,
      success: successCount,
      fail: failCount,
    })

    return results
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов:', {
      description: 'Error during test execution',
      error: error instanceof Error ? error.message : String(error),
    })
    return [
      {
        success: false,
        name: 'Общая ошибка тестов',
        message: error instanceof Error ? error.message : String(error),
      },
    ]
  }
}

// Запускаем тесты
runTests()
  .then(results => {
    const hasFailures = results.some(r => !r.success)

    if (hasFailures) {
      logger.error('🔴 Некоторые тесты завершились с ошибками', {
        description: 'Some tests failed',
        failed_count: results.filter(r => !r.success).length,
        failed_tests: results.filter(r => !r.success).map(r => r.name),
      })
      process.exit(1)
    } else {
      logger.info('🟢 Все тесты успешно выполнены', {
        description: 'All tests passed successfully',
        total_tests: results.length,
      })
      process.exit(0)
    }
  })
  .catch(error => {
    logger.error('💥 Критическая ошибка при выполнении тестов', {
      description: 'Critical error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  })
