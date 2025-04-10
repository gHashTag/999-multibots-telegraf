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

import {
  ReplicateWebhookTester,
  BFLWebhookTester,
  NeurophotoWebhookTester,
} from '../tests/webhooks/webhook.test'
import { DatabaseTester } from '../tests/database/database-tests.test'
import { testSpeechGeneration } from '../tests/audio/audio-tests.test'
import { TestResult } from '../types'
import { runPaymentTests } from '../tests/payment/paymentProcessor.test'
import { logger } from '@/utils/logger'

// Цвета для вывода в консоль
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

/**
 * Форматирует результаты тестов для вывода в консоль
 */
function formatResults(results: TestResult[]): void {
  const successful = results.filter(r => r.passed || r.success).length
  const total = results.length
  const successRate = ((successful / total) * 100).toFixed(1)

  console.log('\n' + colors.bright + '📊 Test Results Summary:' + colors.reset)
  console.log(
    colors.dim + '----------------------------------------' + colors.reset
  )
  console.log(`Total Tests: ${colors.bright}${total}${colors.reset}`)
  console.log(`Successful: ${colors.bright}${successful}${colors.reset}`)
  console.log(`Success Rate: ${colors.bright}${successRate}%${colors.reset}`)
  console.log(
    colors.dim + '----------------------------------------' + colors.reset
  )

  results.forEach(result => {
    const status =
      result.passed || result.success ? colors.green + '✅' : colors.red + '❌'
    const name = result.name || result.testName || 'Unknown Test'
    console.log(`${status} ${colors.bright}${name}${colors.reset}`)
    if (result.duration) {
      console.log(
        colors.dim + `  Duration: ${result.duration}ms` + colors.reset
      )
    }
    if (result.error) {
      console.log(colors.red + `  Error: ${result.error}` + colors.reset)
    }
    if (result.details) {
      console.log(colors.dim + '  Details:' + colors.reset)
      if (Array.isArray(result.details)) {
        result.details.forEach(detail => {
          console.log(colors.dim + `    - ${detail}` + colors.reset)
        })
      } else {
        console.log(colors.dim + `    - ${result.details}` + colors.reset)
      }
    }
  })
}

/**
 * Выводит справку по использованию скрипта
 */
function printHelp() {
  console.log(`
${colors.bright}${colors.blue}СКРИПТ ЗАПУСКА ТЕСТОВ${colors.reset}

Используйте: ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts [тип-тестов] [параметры]${colors.reset}

${colors.bright}Доступные типы тестов:${colors.reset}
  ${colors.cyan}webhook${colors.reset}    - Тесты вебхуков Replicate
  ${colors.cyan}bfl-webhook${colors.reset} - Тесты вебхуков BFL
  ${colors.cyan}neurophoto-webhook${colors.reset} - Тесты вебхуков нейрофото
  ${colors.cyan}database${colors.reset}   - Тесты базы данных
  ${colors.cyan}inngest${colors.reset}    - Тесты Inngest функций
  ${colors.cyan}neuro${colors.reset}      - Тесты генерации изображений
  ${colors.cyan}neurophoto-v2${colors.reset} - Тесты генерации нейрофото V2
  ${colors.cyan}function${colors.reset}   - Тесты конкретных Inngest функций (требуется указать имя функции)
  ${colors.cyan}voice-avatar${colors.reset} - Тесты генерации голосового аватара
  ${colors.cyan}text-to-speech${colors.reset} - Тесты преобразования текста в речь
  ${colors.cyan}all${colors.reset}        - Все тесты

${colors.bright}Параметры:${colors.reset}
  ${colors.cyan}--dry-run${colors.reset}        - Запуск без проверки базы данных (только для некоторых тестов)
  ${colors.cyan}--debug-endpoint${colors.reset}  - Использовать отладочный эндпоинт (для нейрофото)

${colors.bright}Примеры:${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts webhook${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts bfl-webhook${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-webhook${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-webhook --dry-run${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-webhook --debug-endpoint${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-webhook --dry-run --debug-endpoint${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts database${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts inngest${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neuro${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-v2${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts function hello-world${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts text-to-speech${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts all${colors.reset}

${colors.bright}Доступные Inngest функции для тестирования:${colors.reset}
  ${colors.cyan}hello-world${colors.reset}       - Простая тестовая функция
  ${colors.cyan}broadcast${colors.reset}         - Функция массовой рассылки
  ${colors.cyan}payment${colors.reset}           - Функция обработки платежей
  ${colors.cyan}model-training${colors.reset}    - Функция тренировки моделей
  ${colors.cyan}model-training-v2${colors.reset} - Функция тренировки моделей v2
  ${colors.cyan}neuro${colors.reset}             - Функция генерации изображений
  ${colors.cyan}neurophoto-v2${colors.reset}     - Функция генерации нейрофото V2
  ${colors.cyan}voice-avatar${colors.reset}       - Функция генерации голосового аватара
  ${colors.cyan}text-to-speech${colors.reset}    - Функция преобразования текста в речь
  `)
}

/**
 * Получает доступные типы тестов
 */
export function getTestTypesAvailable(): string[] {
  return Object.keys(testTypes)
}

/**
 * Запускает конкретный тест по типу
 */
export async function runTest(type: string, options?: any): Promise<any> {
  if (testTypes[type] && typeof testTypes[type] === 'function') {
    return await testTypes[type](options)
  }
  throw new Error(`Тип теста "${type}" не найден`)
}

/**
 * Основная функция запуска тестов
 */
export async function main(args: string[] = []): Promise<boolean> {
  const cliArgs = args.length ? args : process.argv.slice(2)
  const testType = cliArgs[0] || 'all'

  if (testType === '--help' || testType === '-h') {
    printHelp()
    return false
  }

  try {
    let results: TestResult[] = []

    switch (testType) {
      case 'webhook':
        results = await runWebhookTests()
        break
      case 'database':
        results = await runDatabaseTests()
        break
      case 'inngest':
        results = await runInngestTests()
        break
      case 'speech':
        results = [await runSpeechGenerationTest()]
        break
      case 'all':
        results = [
          ...(await runWebhookTests()),
          ...(await runDatabaseTests()),
          ...(await runInngestTests()),
          await runSpeechGenerationTest(),
        ]
        break
      default:
        console.error(
          `${colors.red}Неизвестный тип теста: ${testType}${colors.reset}`
        )
        printHelp()
        return false
    }

    formatResults(results)

    const failedTests = results.filter(r => !r.passed)
    if (failedTests.length > 0) {
      return false
    }
    return true
  } catch (error) {
    console.error(
      `${colors.red}Ошибка при выполнении тестов: ${
        error instanceof Error ? error.message : String(error)
      }${colors.reset}`
    )
    return false
  }
}

/**
 * Обеспечиваем явный экспорт функции main для внешних модулей
 */
module.exports = {
  main,
  getTestTypesAvailable,
  runTest
};

// Если файл запущен напрямую, а не импортирован
if (require.main === module) {
  main().catch(error => {
    console.error(`Critical error: ${error.message}`)
    process.exit(1)
  })
}

async function runSpeechGenerationTest(): Promise<TestResult> {
  try {
    const result = await testSpeechGeneration()
    return {
      name: 'Тест генерации речи',
      testName: 'Speech Generation Test',
      passed: result.passed,
      success: result.passed === true,
      error: result.error,
      details: result.details || {},
      duration: 0,
      message: result.error || 'Test completed',
    }
  } catch (error) {
    return {
      name: 'Тест генерации речи',
      testName: 'Speech Generation Test',
      passed: false,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: {},
      duration: 0,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runWebhookTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const replicateTester = new ReplicateWebhookTester()
  const bflTester = new BFLWebhookTester()
  const neurophotoTester = new NeurophotoWebhookTester()

  try {
    // Тесты Replicate
    const replicateResults = await replicateTester.runAllTests()
    results.push(...replicateResults)

    // Тесты BFL
    const bflResults = await bflTester.runAllTests()
    results.push(...bflResults)

    // Тесты Neurophoto
    const neurophotoResults = await neurophotoTester.runAllTests()
    results.push(...neurophotoResults)

    return results
  } catch (error) {
    return [
      {
        name: 'Тесты вебхуков',
        testName: 'Webhook Tests',
        passed: false,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: {},
        duration: 0,
        message: error instanceof Error ? error.message : String(error),
      },
    ]
  }
}

async function runDatabaseTests(): Promise<TestResult[]> {
  try {
    const databaseTester = new DatabaseTester()
    const results = await databaseTester.runAllTests()
    return results
  } catch (error) {
    return [
      {
        name: 'Тесты базы данных',
        testName: 'Database Tests',
        passed: false,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: {},
        duration: 0,
        message: error instanceof Error ? error.message : String(error),
      },
    ]
  }
}

async function runInngestTests(): Promise<TestResult[]> {
  try {
    const results = await runPaymentTests()
    return results
  } catch (error) {
    return [
      {
        name: 'Тесты Inngest',
        testName: 'Inngest Tests',
        passed: false,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: {},
        duration: 0,
        message: error instanceof Error ? error.message : String(error),
      },
    ]
  }
}

export async function runAllTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск всех тестов', {
    description: 'Starting all tests',
  })

  const results: TestResult[] = []

  // Запускаем тесты платежной системы
  const paymentResults = await runPaymentTests()
  results.push(...paymentResults)

  // Здесь можно добавить другие тесты...

  const passedTests = results.filter(r => r.passed).length
  const totalTests = results.length

  logger.info('📊 Общие результаты тестирования', {
    description: 'Overall test results',
    passedTests,
    totalTests,
    successRate: `${((passedTests / totalTests) * 100).toFixed(2)}%`,
  })

  return results
}
