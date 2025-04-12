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
 *
 * Использование:
 *   npm run test:all - запуск всех тестов
 *   npm run test:discover - автоматическое обнаружение и запуск тестов
 *   npm run test:translations - запуск тестов переводов
 *   npm run test:api - запуск тестов API
 */

import { config } from 'dotenv'
import path from 'path'
import { logger } from '@/utils/logger'
import { TestCategory } from './core/categories'
import { runTests } from './core/runTests'
import { runBalanceTests } from './tests/payment/balance.test'
import { runPaymentNotificationTests } from './tests/payment/paymentNotification.test'
import { runNeuroPhotoTests } from './tests/neuro/runNeuroPhotoTests'

// Импортируем тесты API
import { runApiTests, runApiMonitoring } from './tests/api'

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

Примеры:
  ts-node -r tsconfig-paths/register src/test-utils --category=translations
  ts-node -r tsconfig-paths/register src/test-utils --category=database --verbose
  ts-node -r tsconfig-paths/register src/test-utils --discover --test-dir=src/test-utils/tests
  ts-node -r tsconfig-paths/register src/test-utils --json --output=test-results.json
  ts-node -r tsconfig-paths/register src/test-utils --category=neuro --verbose
  ts-node -r tsconfig-paths/register src/test-utils --category=api --verbose
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

// Экспортируем тесты нейрофункций
export const neuroTests = {
  runNeuroPhotoTests,
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
}

// Экспортируем функции тестов Inngest напрямую
export {
  runInngestDirectTest,
  runInngestSDKTest,
  runInngestFunctionRegistrationTest,
  runInngestFullTest,
}

// Экспортируем функции тестов нейрофункций напрямую
export { runNeuroPhotoTests }

// Экспортируем API тесты напрямую
export { runApiTests, runApiMonitoring }

/**
 * Запуск тестов
 */
async function start() {
  // Проверяем, нужно ли вывести справку
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp()
    process.exit(0)
  }

  logger.info('📊 Запуск тестов проекта')
  logger.info('📊 Running project tests')

  try {
    const exitCode = await runTests(process.argv.slice(2))
    process.exit(exitCode)
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
