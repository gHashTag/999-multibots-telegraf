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
 * - tests/scenes - Тесты телеграм-сцен
 *
 * Использование:
 *   npm run test:all - запуск всех тестов
 *   npm run test:discover - автоматическое обнаружение и запуск тестов
 *   npm run test:translations - запуск тестов переводов
 *   npm run test:scenes - запуск тестов телеграм-сцен
 */

import { config } from 'dotenv'
import path from 'path'
import { logger } from '@/utils/logger'
import { TestCategory } from './core/categories'
import { runTests } from './core/runTests'
import { runBalanceTests } from './tests/payment/balance.test'
import { runPaymentNotificationTests } from './tests/payment/paymentNotification.test'

// Условный импорт runScenesTests для предотвращения ошибки
let runScenesTests: any = null;
try {
  const scenesTestModule = require('./runScenesTests');
  runScenesTests = scenesTestModule.runScenesTests;
} catch (error) {
  console.warn('❌ Предупреждение: Не удалось загрузить модуль сцен. Тесты сцен будут пропущены.');
  console.warn('Детали ошибки:', error);
}

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

/**
 * Выводим справку по использованию
 */
function printHelp() {
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
  translations                 : Тесты переводов
  database                     : Тесты базы данных
  webhook                      : Тесты вебхуков
  inngest                      : Тесты Inngest функций
  scenes                       : Тесты телеграм-сцен

Примеры:
  ts-node -r tsconfig-paths/register src/test-utils --category=translations
  ts-node -r tsconfig-paths/register src/test-utils --category=database --verbose
  ts-node -r tsconfig-paths/register src/test-utils --discover --test-dir=src/test-utils/tests
  ts-node -r tsconfig-paths/register src/test-utils --json --output=test-results.json
  ts-node -r tsconfig-paths/register src/test-utils --category=scenes
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

export const paymentTests = {
  runBalanceTests,
  runPaymentNotificationTests,
}

export const telegramTests = {
  runScenesTests: runScenesTests || (() => Promise.resolve([])),
}

/**
 * Запуск тестов
 */
async function start() {
  logger.info('📊 Запуск тестов проекта')
  logger.info('📊 Running project tests')

  try {
    // Проверяем окружение
    console.log('Environment check:', { nodeEnv: process.env.NODE_ENV });
    
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
