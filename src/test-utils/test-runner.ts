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

import { ReplicateWebhookTester } from './webhook-tests'
import { DatabaseTester } from './database-tests'
import { logger } from '@/utils/logger'
import { TEST_CONFIG } from './test-config'
import fs from 'fs'
import path from 'path'

// Типы доступных тестов
type TestType = 'webhook' | 'database' | 'all'

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
}

/**
 * Форматирует результаты тестов для вывода в консоль
 */
function formatResults(results, testType) {
  console.log(
    `\n${colors.bright}${colors.blue}=== Результаты тестов ${testType} ===${colors.reset}\n`
  )

  const successful = results.filter(r => r.success).length
  const total = results.length

  console.log(
    `${colors.bright}Выполнено: ${total} | Успешно: ${
      successful === total ? colors.green : colors.yellow
    }${successful}${colors.reset}/${total} | Ошибок: ${
      total - successful > 0 ? colors.red : colors.green
    }${total - successful}${colors.reset}\n`
  )

  results.forEach((result, index) => {
    const statusColor = result.success ? colors.green : colors.red
    const status = result.success ? '✅ УСПЕХ' : '❌ ОШИБКА'
    const duration = result.duration ? `(${result.duration}мс)` : ''

    console.log(
      `${index + 1}. ${statusColor}${status}${colors.reset} ${colors.bright}${
        result.testName
      }${colors.reset} ${colors.yellow}${duration}${colors.reset}`
    )
    console.log(`   ${result.message}`)

    if (!result.success && result.error) {
      console.log(`   ${colors.red}Ошибка: ${result.error}${colors.reset}`)
    }

    console.log('')
  })

  // Если настроено сохранение результатов, сохраняем их в файл
  if (TEST_CONFIG.options.saveResults) {
    saveResults(results, testType)
  }

  return { successful, total }
}

/**
 * Сохраняет результаты тестов в файл
 */
function saveResults(results, testType) {
  try {
    const resultsDir = TEST_CONFIG.options.resultsPath

    // Создаем директорию, если её нет
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-')
    const filename = `${testType}-tests-${timestamp}.json`
    const filePath = path.join(resultsDir, filename)

    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          timestamp,
          testType,
          results,
          summary: {
            total: results.length,
            successful: results.filter(r => r.success).length,
          },
        },
        null,
        2
      )
    )

    logger.info({
      message: '💾 Результаты тестов сохранены',
      description: 'Test results saved',
      filePath,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при сохранении результатов',
      description: 'Error saving test results',
      error: error.message,
    })
  }
}

/**
 * Выводит справку по использованию скрипта
 */
function printHelp() {
  console.log(`
${colors.bright}${colors.blue}СКРИПТ ЗАПУСКА ТЕСТОВ${colors.reset}

Используйте: ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts [тип-тестов]${colors.reset}

${colors.bright}Доступные типы тестов:${colors.reset}
  ${colors.cyan}webhook${colors.reset}    - Тесты вебхуков Replicate
  ${colors.cyan}database${colors.reset}   - Тесты базы данных
  ${colors.cyan}all${colors.reset}        - Все тесты

${colors.bright}Примеры:${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts webhook${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts all${colors.reset}
  `)
}

/**
 * Главная функция запуска тестов
 */
async function main() {
  const args = process.argv.slice(2)
  const testType = args[0]?.toLowerCase() || 'all'

  console.log(
    `\n${colors.bright}${colors.blue}🧪 ЗАПУСК ТЕСТОВ${colors.reset}\n`
  )
  console.log(`Тип тестов: ${colors.cyan}${testType}${colors.reset}`)
  console.log(
    `URL API: ${colors.cyan}${TEST_CONFIG.server.apiUrl}${colors.reset}`
  )
  console.log(
    `Путь вебхука: ${colors.cyan}${TEST_CONFIG.server.webhookPath}${colors.reset}\n`
  )

  try {
    // Проверяем, какие тесты запускать
    if (testType === 'webhook' || testType === 'all') {
      logger.info({
        message: '🧪 Запуск тестов вебхуков',
        description: 'Starting webhook tests',
      })

      const webhookTester = new ReplicateWebhookTester()
      const webhookResults = await webhookTester.runAllTests()
      formatResults(webhookResults, 'вебхуков')
    }

    if (testType === 'database' || testType === 'all') {
      logger.info({
        message: '🧪 Запуск тестов базы данных',
        description: 'Starting database tests',
      })

      const dbTester = new DatabaseTester()
      const dbResults = await dbTester.runAllTests()
      formatResults(dbResults, 'базы данных')
    }

    if (!['webhook', 'database', 'all'].includes(testType)) {
      console.log(
        `${colors.red}Неизвестный тип тестов: ${testType}${colors.reset}\n`
      )
      printHelp()
      process.exit(1)
    }

    console.log(
      `\n${colors.bright}${colors.green}🏁 Все тесты завершены${colors.reset}\n`
    )
  } catch (error) {
    console.error(
      `\n${colors.red}❌ Критическая ошибка: ${error.message}${colors.reset}\n`
    )
    logger.error({
      message: '❌ Критическая ошибка при выполнении тестов',
      description: 'Critical error during tests',
      error: error.message,
      stack: error.stack,
    })

    process.exit(1)
  }
}

// Запускаем тесты
main()
