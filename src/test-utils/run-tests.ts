import { logger } from '@/utils/logger'
import { TestResult } from './interfaces'
import { testImageToPrompt } from './tests'

/**
 * Запускает все тесты и возвращает результаты
 */
export async function runTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов...')

  const results: TestResult[] = []

  try {
    const imageToPromptResult = await testImageToPrompt()
    results.push(imageToPromptResult)

    logger.info(
      `✅ Успешно выполнено тестов: ${results.filter(r => r.success).length}`
    )
    logger.info(
      `❌ Провалено тестов: ${results.filter(r => !r.success).length}`
    )

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
