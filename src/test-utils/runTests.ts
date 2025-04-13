import { logger } from '@/utils/logger'
import { TestResult } from './core/types'
// Условно импортируем тесты - создадим заглушки, если они еще не реализованы
import { runSystemTests } from './tests/system'

// Заглушки для тестов, которые могут быть еще не реализованы
const runNeuroTests = async (): Promise<TestResult[]> => []
const runDatabaseTests = async (): Promise<TestResult[]> => []
const runWebhookTests = async (): Promise<TestResult[]> => []
const runApiTests = async (): Promise<TestResult[]> => []

import { TestRunner } from './core/TestRunner'

/**
 * Запускает все тесты и возвращает результаты
 * Структура директорий тестов:
 * - tests/neuro - тесты нейрофункций
 * - tests/database - тесты базы данных
 * - tests/webhooks - тесты вебхуков
 * - tests/api - тесты API
 * - tests/system - тесты системных компонентов
 */
export async function runTests(options: {
  categories?: string[]
  verbose?: boolean
  test?: string
}): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов...')

  const results: TestResult[] = []
  const testRunner = new TestRunner({
    verbose: options.verbose,
    only: options.test ? [options.test] : [],
  })

  await testRunner.init()

  try {
    // Регистрируем тесты по категориям
    registerTestsByCategory(testRunner, options.categories || [])

    // Запускаем тесты
    const testResults = await testRunner.runTestsInParallel(4)
    results.push(...testResults)

    // Анализируем результаты
    const successCount = results.filter(r => r.success).length
    const failCount = results.length - successCount

    logger.info(`
    📊 Результаты тестирования:
    ✅ Успешно: ${successCount}
    ❌ Провалено: ${failCount}
    🔍 Всего тестов: ${results.length}
    `)

    if (failCount > 0) {
      logger.error('❌ Обнаружены ошибки в тестах')
    } else {
      logger.info('✅ Все тесты успешно пройдены')
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`❌ Ошибка при запуске тестов: ${errorMessage}`)
  } finally {
    await testRunner.cleanup()
  }

  return results
}

/**
 * Регистрирует тесты по категориям
 */
function registerTestsByCategory(
  testRunner: TestRunner,
  categories: string[]
): void {
  const allCategories = categories.length === 0

  // Если указаны конкретные категории - запускаем только их
  if (allCategories || categories.includes('neuro')) {
    registerNeuroTests(testRunner)
  }

  if (allCategories || categories.includes('database')) {
    registerDatabaseTests(testRunner)
  }

  if (allCategories || categories.includes('webhooks')) {
    registerWebhookTests(testRunner)
  }

  if (allCategories || categories.includes('api')) {
    registerApiTests(testRunner)
  }

  if (allCategories || categories.includes('system')) {
    registerSystemTests(testRunner)
  }
}

/**
 * Регистрирует системные тесты
 */
function registerSystemTests(testRunner: TestRunner): void {
  testRunner.addTests([
    {
      name: 'Системные тесты',
      category: 'system',
      description: 'Проверка основных системных компонентов',
      run: async () => {
        const results = await runSystemTests()
        const failedTests = results.filter((r: TestResult) => !r.success)

        if (failedTests.length > 0) {
          const errors = failedTests
            .map((t: TestResult) => `${t.name}: ${t.message}`)
            .join('\n')
          throw new Error(`Системные тесты провалены:\n${errors}`)
        }

        return results
      },
    },
  ])
}

/**
 * Регистрирует тесты нейрофункций
 */
function registerNeuroTests(testRunner: TestRunner): void {
  testRunner.addTests([
    {
      name: 'Нейротесты',
      category: 'neuro',
      description: 'Проверка работы нейрофункций',
      run: async () => {
        const results = await runNeuroTests()
        const failedTests = results.filter((r: TestResult) => !r.success)

        if (failedTests.length > 0) {
          const errors = failedTests
            .map((t: TestResult) => `${t.name}: ${t.message}`)
            .join('\n')
          throw new Error(`Нейротесты провалены:\n${errors}`)
        }

        return results
      },
    },
  ])
}

/**
 * Регистрирует тесты базы данных
 */
function registerDatabaseTests(testRunner: TestRunner): void {
  testRunner.addTests([
    {
      name: 'Тесты базы данных',
      category: 'database',
      description: 'Проверка работы с базой данных',
      run: async () => {
        const results = await runDatabaseTests()
        const failedTests = results.filter((r: TestResult) => !r.success)

        if (failedTests.length > 0) {
          const errors = failedTests
            .map((t: TestResult) => `${t.name}: ${t.message}`)
            .join('\n')
          throw new Error(`Тесты базы данных провалены:\n${errors}`)
        }

        return results
      },
    },
  ])
}

/**
 * Регистрирует тесты вебхуков
 */
function registerWebhookTests(testRunner: TestRunner): void {
  testRunner.addTests([
    {
      name: 'Тесты вебхуков',
      category: 'webhooks',
      description: 'Проверка работы вебхуков',
      run: async () => {
        const results = await runWebhookTests()
        const failedTests = results.filter((r: TestResult) => !r.success)

        if (failedTests.length > 0) {
          const errors = failedTests
            .map((t: TestResult) => `${t.name}: ${t.message}`)
            .join('\n')
          throw new Error(`Тесты вебхуков провалены:\n${errors}`)
        }

        return results
      },
    },
  ])
}

/**
 * Регистрирует тесты API
 */
function registerApiTests(testRunner: TestRunner): void {
  testRunner.addTests([
    {
      name: 'Тесты API',
      category: 'api',
      description: 'Проверка работы API',
      run: async () => {
        const results = await runApiTests()
        const failedTests = results.filter((r: TestResult) => !r.success)

        if (failedTests.length > 0) {
          const errors = failedTests
            .map((t: TestResult) => `${t.name}: ${t.message}`)
            .join('\n')
          throw new Error(`Тесты API провалены:\n${errors}`)
        }

        return results
      },
    },
  ])
}
