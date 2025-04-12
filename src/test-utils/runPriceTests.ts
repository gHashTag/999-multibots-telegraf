import { runPriceCalculationTests } from './tests/price/priceCalculationTest'
import { logger } from '@/utils/logger'

/**
 * Функция для запуска всех тестов системы ценообразования
 */
async function runAllTests() {
  try {
    logger.info('🚀 Запуск тестов системы ценообразования')

    // Запускаем тесты
    const results = await runPriceCalculationTests()

    // Считаем успешные тесты
    const successCount = results.filter(r => r.success).length
    const totalCount = results.length

    // Выводим результаты
    logger.info(`✅ Результаты тестов системы ценообразования:`)
    logger.info(`   • Всего тестов: ${totalCount}`)
    logger.info(`   • Успешно: ${successCount}`)
    logger.info(`   • Провалено: ${totalCount - successCount}`)

    // Если есть неуспешные тесты, выводим их
    if (successCount < totalCount) {
      const failedTests = results.filter(r => !r.success)

      logger.error('❌ Список неудачных тестов:')
      failedTests.forEach((test, index) => {
        logger.error(`   ${index + 1}. ${test.name}: ${test.message}`)
      })

      // Завершаем с ошибкой
      process.exit(1)
    }

    // Успешное завершение
    logger.info('🎉 Все тесты успешно пройдены!')
    process.exit(0)
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов системы ценообразования',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    process.exit(1)
  }
}

// Запускаем тесты
if (require.main === module) {
  runAllTests()
}
