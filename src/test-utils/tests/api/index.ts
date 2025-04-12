import { runApiMonitoring } from './apiMonitoringTest'
import { logger } from '../../../utils/logger'
import { TestResult } from '../../types'
import { TestCategory } from '../../core/categories'

/**
 * Запускает тесты API
 */
export async function runApiTests(): Promise<TestResult> {
  logger.info({
    message: '🚀 Запуск тестов API',
    description: 'Starting API tests',
  })

  try {
    // Запускаем мониторинг API
    const monitoringResult = await runApiMonitoring({ generateReport: true })

    // Если отчет сгенерирован, выводим его
    if (monitoringResult.report) {
      logger.info({
        message: '📊 Отчет о мониторинге API:',
        description: 'API monitoring report:',
      })
      // Разделяем отчет на строки для лучшей читаемости в логах
      monitoringResult.report.split('\n').forEach(line => {
        if (line.trim()) {
          logger.info({
            message: line,
            description: line,
          })
        }
      })
    }

    if (monitoringResult.success) {
      logger.info({
        message: '✅ Все тесты API успешно пройдены',
        description: 'All API tests passed successfully',
      })
    } else {
      logger.error({
        message: '❌ Некоторые тесты API не пройдены',
        description: 'Some API tests failed',
      })
    }

    return {
      success: monitoringResult.success,
      name: 'API тесты',
      message: monitoringResult.message,
      category: TestCategory.Api,
      details: { report: monitoringResult.report },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Ошибка при запуске тестов API: ${errorMessage}`,
      description: `Error running API tests: ${errorMessage}`,
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      name: 'API тесты',
      message: `Ошибка при запуске тестов API: ${errorMessage}`,
      category: TestCategory.Api,
      error: errorMessage,
    }
  }
}

/**
 * Экспорт тестов API
 */
export { runApiMonitoring }

/**
 * Функция для запуска из CLI
 */
if (require.main === module) {
  ;(async () => {
    try {
      const result = await runApiTests()
      console.log(
        result.success
          ? '✅ Все тесты API успешно пройдены'
          : '❌ Некоторые тесты API не пройдены'
      )
      process.exit(result.success ? 0 : 1)
    } catch (error) {
      console.error('Критическая ошибка при выполнении тестов API:', error)
      process.exit(1)
    }
  })()
}
