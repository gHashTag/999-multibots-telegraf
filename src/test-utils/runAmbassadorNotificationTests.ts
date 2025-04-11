import { logger } from '@/utils/logger'
import { runTests } from './runTests'
import { testAmbassadorNotifications } from './tests/payment/ambassadorNotificationTest'

/**
 * Запускает все тесты для уведомлений амбассадорам
 */
export async function runAmbassadorNotificationTests() {
  logger.info('🚀 Запуск тестов уведомлений амбассадорам', {
    description: 'Running ambassador notification tests',
  })

  try {
    const results = await runTests([
      testAmbassadorNotifications,
      // Здесь можно добавить дополнительные тесты для уведомлений амбассадорам
    ])

    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const totalTests = results.length

    if (failedTests === 0) {
      logger.info('✅ Все тесты уведомлений амбассадорам пройдены успешно', {
        description: 'All ambassador notification tests passed successfully',
        passedTests,
        totalTests,
      })
    } else {
      logger.error('❌ Есть ошибки в тестах уведомлений амбассадорам', {
        description: 'Some ambassador notification tests failed',
        passedTests,
        failedTests,
        totalTests,
      })
    }

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов уведомлений амбассадорам', {
      description: 'Error running ambassador notification tests',
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
}

// Если файл запущен напрямую, запускаем тесты
if (require.main === module) {
  runAmbassadorNotificationTests()
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      logger.error(
        '❌ Критическая ошибка при запуске тестов уведомлений амбассадорам',
        {
          description: 'Critical error running ambassador notification tests',
          error: error instanceof Error ? error.message : String(error),
        }
      )
      process.exit(1)
    })
}
