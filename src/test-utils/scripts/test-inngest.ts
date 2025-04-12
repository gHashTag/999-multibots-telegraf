import { testInngestConnectivity } from '../tests/inngest/simpleInngestTest'
import { logger } from '@/utils/logger'

/**
 * Запускает тесты Inngest
 */
async function main() {
  logger.info({
    message: '🚀 Запуск тестирования подключения к Inngest',
    description: 'Starting Inngest connectivity tests',
  })

  try {
    const result = await testInngestConnectivity()

    if (result.success) {
      logger.info({
        message: '✅ Тестирование подключения к Inngest успешно завершено',
        description: 'Inngest connectivity testing completed successfully',
        result,
      })
      process.exit(0)
    } else {
      logger.error({
        message: '❌ Тестирование подключения к Inngest завершилось с ошибками',
        description: 'Inngest connectivity testing completed with errors',
        error: result.error,
      })
      process.exit(1)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Критическая ошибка при тестировании подключения к Inngest: ${errorMessage}`,
      description: `Critical error during Inngest connectivity testing: ${errorMessage}`,
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

// Запускаем скрипт, если он вызван напрямую
if (require.main === module) {
  main()
}
