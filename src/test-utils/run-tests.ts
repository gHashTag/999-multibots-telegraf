import { logger } from '@/utils/logger'
import { testImageToPrompt } from './tests'
import { TestResult } from './types'

/**
 * Запускает все тесты и возвращает результаты
 */
async function runTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестирования', {
    description: 'Starting tests',
  })

  const results: TestResult[] = []

  try {
    // Тест imageToPrompt
    logger.info('🎯 Запуск теста imageToPrompt', {
      description: 'Running imageToPrompt test',
    })

    const imageToPromptResult = await testImageToPrompt()
    results.push(imageToPromptResult)

    if (imageToPromptResult.success) {
      logger.info('✅ Тест imageToPrompt успешно выполнен', {
        description: 'imageToPrompt test completed successfully',
        details: imageToPromptResult.details,
      })
    } else {
      logger.error('❌ Тест imageToPrompt завершился с ошибкой', {
        description: 'imageToPrompt test failed',
        error: imageToPromptResult.error,
      })
    }

    // Здесь можно добавить другие тесты
  } catch (error) {
    logger.error('❌ Ошибка в процессе тестирования', {
      description: 'Error during testing',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // Выводим общий результат
  const successCount = results.filter(r => r.success).length
  const totalCount = results.length

  logger.info(
    `📊 Результаты тестирования: ${successCount}/${totalCount} успешно`,
    {
      description: 'Test results',
      success_count: successCount,
      total_count: totalCount,
      success_rate: `${(successCount / totalCount) * 100}%`,
    }
  )

  return results
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
