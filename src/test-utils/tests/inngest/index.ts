import { TestResult } from '../../types'
import { TestCategory } from '../../core/categories'
import { logger } from '@/utils/logger'
import { runInngestAvailabilityTest } from './basicInngestTests'

/**
 * Опции для запуска тестов Inngest
 */
export interface InngestTestOptions {
  verbose?: boolean
  testType?:
    | 'direct'
    | 'sdk'
    | 'registration'
    | 'full'
    | 'all'
    | 'availability'
    | 'api'
}

/**
 * Запускает тесты Inngest
 */
export async function runInngestTests(
  options: InngestTestOptions = {}
): Promise<TestResult[]> {
  const { verbose = false, testType = 'all' } = options

  // Логирование начала выполнения тестов
  logger.info('🚀 Запуск тестов Inngest', {
    description: 'Running Inngest tests',
    testType,
    verbose,
  })

  const results: TestResult[] = []

  try {
    // Определяем, какие тесты запускать
    let testsToRun: Array<() => Promise<TestResult>> = []

    switch (testType) {
      case 'availability':
        testsToRun = [runInngestAvailabilityTest]
        logger.info('📋 Запуск теста доступности Inngest')
        break
      default:
        // По умолчанию запускаем только тест доступности
        testsToRun = [runInngestAvailabilityTest]
        logger.info('📋 Запуск тестов доступности Inngest')
    }

    logger.info(`📋 Будет запущено ${testsToRun.length} тестов`)

    // Выполняем все тесты последовательно
    for (const testFn of testsToRun) {
      try {
        const result = await testFn()

        // Добавляем категорию, если её нет
        if (!result.category) {
          result.category = TestCategory.Inngest
        }

        results.push(result)

        // Логируем результат
        logger.info(
          `${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`
        )
      } catch (error: any) {
        // Если тест вызвал ошибку, добавляем результат с ошибкой
        const errorResult: TestResult = {
          name: 'Inngest Test Error',
          category: TestCategory.Inngest,
          success: false,
          message: `Ошибка при выполнении теста: ${error.message}`,
          error: error.message,
        }

        results.push(errorResult)
        logger.error(`❌ Ошибка при выполнении теста Inngest: ${error.message}`)
      }
    }

    // Анализируем и логируем общий результат
    const successCount = results.filter(r => r.success).length
    const failCount = results.length - successCount

    logger.info(
      `📊 Результаты тестов Inngest: ${successCount} успешно, ${failCount} с ошибками`
    )

    return results
  } catch (error: any) {
    // В случае критической ошибки, возвращаем её как результат теста
    logger.error(
      '🔥 Критическая ошибка при запуске тестов Inngest:',
      error.message
    )

    return [
      {
        name: 'Inngest Tests',
        category: TestCategory.Inngest,
        success: false,
        message: `Критическая ошибка при запуске тестов: ${error.message}`,
        error: error.message,
      },
    ]
  }
}

// Экспортируем тесты
export { runInngestAvailabilityTest }

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  runInngestTests({ verbose: true })
    .then(results => {
      logger.info({
        message: '📊 Результаты тестов Inngest функций',
        description: 'Inngest function tests results',
        success: results.every((r: TestResult) => r.success),
        testName: 'Inngest Tests Suite',
        details: results
          .map((r: TestResult) => ({
            testName: r.name,
            success: r.success,
            message: r.message,
          }))
          .join('\n'),
      })

      if (!results.every((r: TestResult) => r.success)) {
        process.exit(1)
      }
    })
    .catch(error => {
      logger.error('Критическая ошибка при запуске тестов:', error)
      process.exit(1)
    })
}
