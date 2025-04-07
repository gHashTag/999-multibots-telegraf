#!/usr/bin/env node
/**
 * Основной файл для запуска тестов
 * Использование:
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts [тип теста]
 *
 * Примеры:
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts webhook
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts database
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts all
 */

import { logger } from '@/utils/logger'
import { TestResult } from './types'
import { testBroadcastMessage } from './tests/broadcast.test'
import { testPaymentSystem } from './tests/payment.test'
import { testImageToPrompt } from './tests/imageToPrompt.test'
import 'dotenv/config'
import path from 'path'

// Загружаем переменные окружения из .env.test
const envPath = path.resolve(process.cwd(), '.env.test')
require('dotenv').config({ path: envPath })

// Проверяем наличие необходимых переменных окружения
logger.info('🔍 Проверка переменных окружения:', {
  description: 'Checking environment variables',
  SUPABASE_URL: process.env.SUPABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  env_path: envPath,
})

/** Константы для статусов тестов */
export const TEST_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  SKIPPED: 'skipped',
  ERROR: 'error',
} as const

/** Константы для эмодзи в логах */
const LOG_EMOJI = {
  START: '🚀',
  SUCCESS: '✅',
  ERROR: '❌',
  INFO: 'ℹ️',
  DETAILS: '📝',
  STATS: '📊',
  TIME: '⏱️',
  TEST: '🧪',
} as const

/** Интерфейс для статистики тестов */
interface TestStats {
  /** Общее количество тестов */
  total: number
  /** Количество успешных тестов */
  passed: number
  /** Количество неудачных тестов */
  failed: number
  /** Общее время выполнения */
  totalDuration: number
  /** Среднее время выполнения */
  averageDuration: number
}

/**
 * Вычисляет статистику по результатам тестов
 * @param results - Массив результатов тестов
 * @returns Статистика тестов
 */
export function calculateStats(results: TestResult[]): TestStats {
  const total = results.length
  const passed = results.filter(r => r.success).length
  const failed = total - passed
  const totalDuration = 0 // Убираем подсчет duration
  const averageDuration = 0 // Убираем подсчет duration

  return {
    total,
    passed,
    failed,
    totalDuration,
    averageDuration,
  }
}

/**
 * Форматирует результаты тестов для вывода в консоль
 */
function formatResults(results: TestResult[], category: string) {
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  logger.info(`📊 Результаты тестов для категории "${category}"`, {
    description: `Test results for category "${category}"`,
    success_count: successCount,
    fail_count: failCount,
    total: results.length,
  })

  // Выводим информацию о неудачных тестах
  if (failCount > 0) {
    const failedTests = results.filter(r => !r.success)
    failedTests.forEach(test => {
      logger.error(`❌ Тест "${test.name}" не прошел`, {
        description: `Test "${test.name}" failed`,
        error:
          test.error instanceof Error ? test.error.message : String(test.error),
      })
    })
  }
}

/**
 * Запускает все тесты и возвращает результаты
 */
export async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  logger.info('🚀 Запуск всех тестов', {
    description: 'Starting all tests',
  })

  try {
    // Тест платежной системы
    logger.info('💰 Запуск тестов платежной системы', {
      description: 'Starting payment system tests',
    })
    const paymentResult = await testPaymentSystem()
    results.push(paymentResult)
    formatResults([paymentResult], 'Платежная система')

    // Тест рассылки сообщений
    logger.info('📨 Запуск тестов рассылки', {
      description: 'Starting broadcast tests',
    })
    const broadcastResults = await testBroadcastMessage()
    results.push(...broadcastResults)
    formatResults(broadcastResults, 'Рассылка сообщений')

    // Тест генерации промптов из изображений
    logger.info('🖼️ Запуск тестов генерации промптов', {
      description: 'Starting image to prompt tests',
    })
    const imageToPromptResult = await testImageToPrompt()
    results.push(imageToPromptResult)
    formatResults([imageToPromptResult], 'Генерация промптов')

    // Подсчет результатов
    const stats = calculateStats(results)

    logger.info('✅ Все тесты завершены', {
      description: 'All tests completed',
      total_tests: stats.total,
      passed_tests: stats.passed,
      failed_tests: stats.failed,
      success_rate: `${((stats.passed / stats.total) * 100).toFixed(2)}%`,
    })

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов:', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return [
      {
        success: false,
        name: 'Test Runner',
        message: `Ошибка при запуске тестов: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ]
  }
}

/**
 * Базовый класс для запуска тестов
 */
export class TestRunner {
  /** Массив результатов тестов */
  protected testResults: TestResult[] = []

  /**
   * Запускает тест и добавляет результат в массив
   * @param name - Название теста
   * @param testFn - Функция теста
   * @returns Promise<TestResult>
   */
  public async runTest(
    name: string,
    testFn: () => Promise<TestResult>
  ): Promise<TestResult> {
    logger.info(`${LOG_EMOJI.START} Запуск теста`, {
      description: 'Starting test',
      test_name: name,
      start_time: new Date().toISOString(),
    })

    try {
      const result = await testFn()

      logger.info(`${LOG_EMOJI.SUCCESS} Тест завершен`, {
        description: 'Test completed',
        test_name: name,
        success: result.success,
        message: result.message,
      })

      return result
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      logger.error(`${LOG_EMOJI.ERROR} Ошибка в тесте`, {
        description: 'Test failed',
        test_name: name,
        error: errorMessage,
      })

      return {
        name,
        success: false,
        message: `${LOG_EMOJI.ERROR} Тест завершился с ошибкой`,
        error: error instanceof Error ? error : new Error(errorMessage),
      }
    }
  }

  /**
   * Возвращает результаты всех тестов
   * @returns TestResult[]
   */
  getResults(): TestResult[] {
    return this.testResults
  }

  /**
   * Очищает результаты тестов
   */
  clearResults(): void {
    this.testResults = []
  }

  /**
   * Выводит сводку по результатам тестов
   */
  printSummary(): void {
    const totalTests = this.testResults.length
    const passedTests = this.testResults.filter(r => r.success).length
    const failedTests = totalTests - passedTests

    logger.info('📊 Сводка по тестам', {
      description: 'Test summary',
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: failedTests,
    })

    if (failedTests > 0) {
      const failedResults = this.testResults.filter(r => !r.success)
      logger.error('❌ Провалившиеся тесты', {
        description: 'Failed tests',
        tests: failedResults.map(r => ({
          name: r.name,
          message: r.message,
          error: r.error instanceof Error ? r.error.message : r.error,
        })),
      })
    }
  }
}

/**
 * Запускает один тест
 * @param testName - Название теста
 * @param testFn - Функция теста
 * @returns Promise<TestResult>
 */
export async function runTest(
  testName: string,
  testFn: () => Promise<TestResult>
): Promise<TestResult> {
  const runner = new TestRunner()
  return runner.runTest(testName, testFn)
}

/**
 * Запускает массив тестов
 * @param tests - Массив функций тестов
 * @returns Promise<TestResult[]>
 */
export async function runTests(
  tests: Array<() => Promise<TestResult>>
): Promise<TestResult[]> {
  const results: TestResult[] = []

  for (const test of tests) {
    try {
      const result = await test()
      results.push(result)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      results.push({
        name: 'Unknown Test',
        success: false,
        message: '❌ Тест завершился с ошибкой',
        error: error instanceof Error ? error : new Error(errorMessage),
      })
    }
  }

  return results
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  ;(async () => {
    try {
      const results = await runAllTests()
      const failedTests = results.filter(r => !r.success)

      if (failedTests.length > 0) {
        logger.error('❌ Некоторые тесты не прошли:', {
          description: 'Some tests failed',
          failed_tests: failedTests.map(t => t.name),
        })
        process.exit(1)
      }

      logger.info('✅ Все тесты успешно пройдены', {
        description: 'All tests passed successfully',
      })
      process.exit(0)
    } catch (error) {
      logger.error('❌ Критическая ошибка при запуске тестов:', {
        description: 'Critical error running tests',
        error: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    }
  })()
}
