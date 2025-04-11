import { runTextToVideoTests } from './tests/inngest/textToVideoTest'
import { runTextToVideoFuncTests } from './tests/inngest/textToVideoPaymentTest'
import { logger } from '@/utils/logger'

/**
 * Функция для запуска всех тестов для Text-to-Video
 */
async function runAllTests() {
  try {
    logger.info('🚀 Запуск тестов Text-to-Video')

    // Запускаем функциональные тесты (общие)
    const functionalResults = await runTextToVideoTests()

    // Запускаем тесты платежной функциональности
    const paymentResults = await runTextToVideoFuncTests()

    // Объединяем результаты
    const allResults = [...functionalResults, ...paymentResults]

    // Считаем успешные тесты
    const successCount = allResults.filter(r => r.success).length
    const totalCount = allResults.length

    // Выводим результаты
    logger.info(`✅ Результаты тестов Text-to-Video:`)
    logger.info(`   • Всего тестов: ${totalCount}`)
    logger.info(`   • Успешно: ${successCount}`)
    logger.info(`   • Провалено: ${totalCount - successCount}`)

    // Если есть неуспешные тесты, выводим их
    if (successCount < totalCount) {
      const failedTests = allResults.filter(r => !r.success)

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
      message: '❌ Ошибка при запуске тестов Text-to-Video',
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
