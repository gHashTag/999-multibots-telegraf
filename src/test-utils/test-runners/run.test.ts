import { logger } from '@/utils/logger'
import { runVideoWebhookTest } from './videoWebhook.test'

async function runAllTests() {
  logger.info('🚀 Запуск всех тестов', {
    description: 'Starting all tests',
  })

  try {
    // Запускаем тесты вебхуков видео
    logger.info('🎥 Запуск тестов вебхуков видео', {
      description: 'Starting video webhook tests',
    })
    const videoWebhookResults = await runVideoWebhookTest()

    // Подсчитываем общие результаты
    const totalTests = videoWebhookResults.length
    const passedTests = videoWebhookResults.filter(r => r.passed).length
    const failedTests = totalTests - passedTests

    logger.info('📊 Итоговые результаты тестирования', {
      description: 'Final test results',
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      success_rate: `${((passedTests / totalTests) * 100).toFixed(2)}%`,
    })

    // Если есть неуспешные тесты, выводим их
    if (failedTests > 0) {
      const failedResults = videoWebhookResults.filter(r => !r.passed)
      logger.error('❌ Неуспешные тесты:', {
        description: 'Failed tests',
        tests: failedResults.map(r => ({
          description: r.description,
          error: r.error?.message,
        })),
      })
      process.exit(1)
    }

    process.exit(0)
  } catch (error) {
    logger.error('❌ Критическая ошибка при выполнении тестов', {
      description: 'Critical error running tests',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  runAllTests()
}

export { runAllTests }
