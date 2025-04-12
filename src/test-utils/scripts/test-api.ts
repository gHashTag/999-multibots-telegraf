import { runAllApiTests, runApiTests } from '../tests/api'
import { logger } from '@/utils/logger'

/**
 * Запускает тесты API
 */
async function main() {
  logger.info({
    message: '🚀 Запуск тестирования API',
    description: 'Starting API tests',
  })

  try {
    // Проверяем аргументы командной строки
    const args = process.argv.slice(2)
    const detailed = args.includes('--detailed')

    if (detailed) {
      // Запускаем детальное тестирование с генерацией отчета
      const result = await runApiTests({ generateReport: true })

      if (result.report) {
        console.log('\n' + result.report + '\n')
      }

      if (result.success) {
        logger.info({
          message: '✅ Тестирование API успешно завершено',
          description: 'API testing completed successfully',
        })
        process.exit(0)
      } else {
        logger.error({
          message: '❌ Тестирование API завершилось с ошибками',
          description: 'API testing completed with errors',
        })
        process.exit(1)
      }
    } else {
      // Запускаем все API тесты
      const results = await runAllApiTests()

      const successCount = results.filter(r => r.success).length
      const totalCount = results.length

      logger.info({
        message: `🏁 Результаты тестирования API: ${successCount}/${totalCount} успешно`,
        description: `API testing results: ${successCount}/${totalCount} successful`,
      })

      if (successCount === totalCount) {
        process.exit(0)
      } else {
        process.exit(1)
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Критическая ошибка при тестировании API: ${errorMessage}`,
      description: `Critical error during API testing: ${errorMessage}`,
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

// Запускаем скрипт, если он вызван напрямую
if (require.main === module) {
  main()
}
