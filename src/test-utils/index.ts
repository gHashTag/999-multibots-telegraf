#!/usr/bin/env node
/**
 * Основной файл для запуска тестов
 *
 * Этот файл предоставляет простой интерфейс для запуска доступных тестов
 * с использованием новой модульной системы тестирования.
 *
 * Структура директорий для тестов:
 * - tests/neuro - Тесты нейрофункций
 * - tests/database - Тесты БД
 * - tests/webhooks - Тесты вебхуков
 * - tests/inngest - Тесты Inngest функций
 * - tests/speech - Тесты аудио
 * - tests/translations - Тесты переводов
 * - tests/api - Тесты API эндпоинтов
 * - tests/system - Тесты системных компонентов
 *
 * Использование:
 *   npm run test:all - запуск всех тестов
 *   npm run test:discover - автоматическое обнаружение и запуск тестов
 *   npm run test:translations - запуск тестов переводов
 *   npm run test:api - запуск тестов API
 *   npm run test:system - запуск системных тестов
 */

import { config } from 'dotenv'
import path from 'path'
import { logger } from '@/utils/logger'
import { TestCategory } from './core/categories'
import { runTests } from './core/runTests'
import { runBalanceTests } from './tests/payment/balance.test'
import { runPaymentNotificationTests } from './tests/payment/paymentNotification.test'
// Импортируем тесты API
import { runApiTests, runApiMonitoring, runApiEndpointTests } from './tests/api'

// Импортируем системные тесты
import { runSystemTests, runAgentRouterTests } from './tests/system'

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

/**
 * Выводим справку по использованию
 */
function showHelp() {
  const message = `
Использование: ts-node -r tsconfig-paths/register src/test-utils [опции]

Опции:
  --help, -h                   : Показать эту справку
  --verbose, -v                : Показать подробный вывод результатов
  --category=XXX               : Запуск тестов для конкретной категории
  --only=XXX                   : Запустить только тесты с указанным названием
  --skip=XXX                   : Пропустить тесты с указанным названием
  --parallel=N                 : Запустить тесты параллельно (по умолчанию: 4)
  --json                       : Вывести результаты в формате JSON
  --html                       : Сгенерировать HTML-отчет
  --output=FILE                : Сохранить результаты в файл
  --tags=TAG1,TAG2             : Запустить только тесты с указанными тегами
  --discover                   : Автоматически обнаружить и запустить тесты
  --test-dir=DIR               : Указать директорию для поиска тестов (для --discover)

Доступные категории:
  all                          : Все тесты
  neuro                        : Тесты нейрофункций
  translations                 : Тесты переводов
  database                     : Тесты базы данных
  webhook                      : Тесты вебхуков
  inngest                      : Тесты Inngest функций
  api                          : Тесты API эндпоинтов
  system                       : Тесты системных компонентов
  agent-router                 : Тесты маршрутизатора агента

Примеры:
  ts-node -r tsconfig-paths/register src/test-utils --category=translations
  ts-node -r tsconfig-paths/register src/test-utils --category=database --verbose
  ts-node -r tsconfig-paths/register src/test-utils --discover --test-dir=src/test-utils/tests
  ts-node -r tsconfig-paths/register src/test-utils --json --output=test-results.json
  ts-node -r tsconfig-paths/register src/test-utils --category=neuro --verbose
  ts-node -r tsconfig-paths/register src/test-utils --category=api --verbose
  ts-node -r tsconfig-paths/register src/test-utils --category=system --verbose
  ts-node -r tsconfig-paths/register src/test-utils --category=agent-router --verbose
  `

  console.log(message)
}

// Экспортируем основные компоненты новой системы
export { TestRunner } from './core/TestRunner'
export { TestCategory }
export { TestResult, RunnerOptions } from './core/types'
export { default as assert } from './core/assert'
export { default as mock } from './core/mock/index'
export { default as snapshot } from './core/snapshot'

// Импортируем тесты Inngest
import {
  runInngestDirectTest,
  runInngestSDKTest,
  runInngestFunctionRegistrationTest,
  runInngestFullTest,
} from './tests/inngestTest'

export const paymentTests = {
  runBalanceTests,
  runPaymentNotificationTests,
}

// Экспортируем тесты Inngest
export const inngestTests = {
  runInngestDirectTest,
  runInngestSDKTest,
  runInngestFunctionRegistrationTest,
  runInngestFullTest,
}

// Экспортируем API тесты
export const apiTests = {
  runApiTests,
  runApiMonitoring,
  runApiEndpointTests,
}

// Экспортируем системные тесты
export const systemTests = {
  runSystemTests,
  runAgentRouterTests,
}

// Экспортируем функции тестов Inngest напрямую
export {
  runInngestDirectTest,
  runInngestSDKTest,
  runInngestFunctionRegistrationTest,
  runInngestFullTest,
}

// Экспортируем API тесты напрямую
export { runApiTests, runApiMonitoring, runApiEndpointTests }

// Экспортируем системные тесты напрямую
export { runSystemTests, runAgentRouterTests }

import { testSelfImprovement } from './self-improvement.test'

// Интерфейс для результатов тестов
export interface TestResult {
  success: boolean
  message: string
  name: string
}

// Функция запуска тестов
export async function runTests(): Promise<void> {
  console.log('🚀 Запуск тестов...')

  const tests = [
    testSelfImprovement
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    const result = await test()
    if (result.success) {
      passed++
      console.log(`✅ ${result.name}: ${result.message}`)
    } else {
      failed++
      console.log(`❌ ${result.name}: ${result.message}`)
    }
  }

  console.log('\n📊 Результаты тестов:')
  console.log(`✅ Пройдено: ${passed}`)
  console.log(`❌ Не пройдено: ${failed}`)
  console.log('🏁 Тесты завершены')

  if (failed > 0) {
    process.exit(1)
  }
}

/**
 * Запуск тестов
 */
async function start(): Promise<void> {
  // Проверяем, нужно ли вывести справку
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp()
    process.exit(0)
  }

  logger.info('📊 Запуск тестов проекта')
  logger.info('📊 Running project tests')

  try {
    // Проверяем, запрошен ли конкретный тест
    const testArg = process.argv.find(arg => arg.startsWith('--test='))
    if (testArg) {
      const testName = testArg.split('=')[1]
      logger.info(`🧪 Запуск теста: ${testName}`)

      // Проверяем, запрошен ли тест мок-функций
      if (testName === 'mockFnTest') {
        const { runMockFunctionTest } = require('./tests/mockFnTest')
        const result = await runMockFunctionTest()

        if (result.success) {
          logger.info(`✅ Тест успешно пройден: ${result.name}`)
          logger.info(`✅ ${result.message}`)
          process.exit(0)
        } else {
          logger.error(`❌ Тест не пройден: ${result.name}`)
          logger.error(`❌ ${result.message}`)
          process.exit(1)
        }
        return
      } else {
        logger.error(`❌ Неизвестный тест: ${testName}`)
        process.exit(1)
      }
    }

    // Проверяем, нужно ли запустить только тест агента
    if (process.argv.includes('--category=agent-router')) {
      logger.info('🤖 Запуск тестов маршрутизатора агента...')
      const results = await runAgentRouterTests()

      const passed = results.filter(r => r.success).length
      const failed = results.length - passed

      logger.info(`
📊 Результаты тестирования:
  ✅ Пройдено: ${passed}
  ❌ Не пройдено: ${failed}
  🕒 Всего: ${results.length}
      `)

      if (failed > 0) {
        logger.error('❌ Обнаружены ошибки в тестах:')
        for (const result of results.filter(r => !r.success)) {
          logger.error(`  - ${result.name}: ${result.message}`)
        }
        process.exit(1)
      } else {
        logger.info('✅ Все тесты пройдены успешно!')
        process.exit(0)
      }
      return
    }

    // Запускаем тесты с указанными аргументами
    await runTests(process.argv.slice(2))
    // Не обрабатываем возвращаемое значение, т.к. функция runTests сама вызывает process.exit
  } catch (error) {
    logger.error('🔥 Критическая ошибка при запуске тестов:', error)
    logger.error('🔥 Critical error running tests:', error)
    process.exit(1)
  }
}

// Запуск тестов, если файл запущен напрямую
if (require.main === module) {
  start()
}
