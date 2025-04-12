import { runAllPulseIntegrationTests } from './tests/pulse/pulseIntegrationTest'
import { logger } from '@/utils/logger'

/**
 * Функция для запуска всех тестов интеграции для Pulse
 */
async function runAllTests() {
  try {
    logger.info(
      '🚀 Запуск всех тестов интеграции функций отправки медиа в Pulse'
    )

    const results = await runAllPulseIntegrationTests()
    const successCount = results.filter(r => r.success).length
    const failedCount = results.length - successCount

    logger.info(`✅ Результаты тестов интеграции Pulse:`)
    logger.info(`   • Всего тестов: ${results.length}`)
    logger.info(`   • Успешно: ${successCount}`)
    logger.info(`   • Провалено: ${failedCount}`)

    if (failedCount > 0) {
      // Выводим детальную информацию о неудачных тестах
      const failedTests = results.filter(r => !r.success)

      logger.error('❌ Список неудачных тестов:')
      failedTests.forEach((test, index) => {
        logger.error(`   ${index + 1}. ${test.name}: ${test.message}`)
      })

      // Выходим с ошибкой, если есть неудачные тесты
      process.exit(1)
    }

    // Успешное завершение
    logger.info('🎉 Все тесты успешно пройдены!')
    process.exit(0)
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов интеграции Pulse',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    process.exit(1)
  }
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  runAllTests()
}
