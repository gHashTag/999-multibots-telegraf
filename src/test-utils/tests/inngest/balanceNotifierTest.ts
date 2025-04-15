import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import { testBalanceNotifierScheduledTask } from './balanceNotifier.test'

/**
 * Запускает все тесты для функций уведомлений о балансе
 */
export async function runBalanceNotifierTests(
  options: { verbose?: boolean } = {}
): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов уведомлений о балансе...', {
    description: 'Starting Balance Notification Tests...',
  })

  const results: TestResult[] = []

  try {
    // Run the balance notification scheduled task test
    const result = await testBalanceNotifierScheduledTask()
    results.push(result)

    // Add more balance notification related tests here as they are developed

    const passedTests = results.filter(r => r.success).length

    logger.info(
      `📊 Тесты уведомлений о балансе завершены: ${passedTests}/${results.length} успешно`,
      {
        description: `Balance Notification Tests completed: ${passedTests}/${results.length} passed`,
      }
    )

    if (passedTests < results.length) {
      const failedTests = results.filter(r => !r.success)
      logger.warn(`❗ ${failedTests.length} тестов провалено:`, {
        description: `${failedTests.length} tests failed:`,
      })

      failedTests.forEach((test, index) => {
        logger.warn(`  ${index + 1}. ${test.name}: ${test.message}`, {
          description: `  ${index + 1}. ${test.name}: ${test.message}`,
        })
      })
    }
  } catch (error: any) {
    logger.error(
      `❌ Критическая ошибка при запуске тестов уведомлений о балансе: ${error.message}`,
      {
        description: `Critical error running Balance Notification tests: ${error.message}`,
      }
    )
  }

  return results
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  runBalanceNotifierTests({ verbose: true })
    .then(results => {
      logger.info({
        message: '📊 Результаты тестов уведомлений о балансе',
        description: 'Balance Notification tests results',
        success: results.every(r => r.success),
        testName: 'Balance Notification Tests Suite',
        details: results
          .map(r => ({
            testName: r.name,
            success: r.success,
            message: r.message,
          }))
          .join('\n'),
      })

      if (!results.every(r => r.success)) {
        process.exit(1)
      }
    })
    .catch(error => {
      logger.error('Критическая ошибка при запуске тестов:', error)
      process.exit(1)
    })
}
