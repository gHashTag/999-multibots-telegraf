#!/usr/bin/env node
/**
 * Вспомогательный скрипт для тестирования всех Inngest функций
 * Запускает тесты для каждой функции по очереди
 *
 * Использование:
 *   ts-node -r tsconfig-paths/register src/test-utils/test-all-inngest.ts
 */

import { InngestTester } from './inngest-tests'
import { logger } from '@/utils/logger'
import { TEST_CONFIG } from './test-config'

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

// Список всех функций для тестирования
const functionNames = [
  'hello-world',
  'broadcast',
  'payment',
  'model-training',
  'model-training-v2',
  'neuro',
]

/**
 * Интерфейс для результатов форматирования
 */
interface FormattedResults {
  successful: number
  total: number
}

/**
 * Интерфейс для статистики по функции
 */
interface FunctionStats {
  total: number
  successful: number
  failed: number
}

/**
 * Интерфейс для общей статистики
 */
interface TestSummary {
  total: number
  successful: number
  failed: number
  functions: Record<string, FunctionStats>
}

/**
 * Форматирует результаты тестов для вывода в консоль
 */
function formatResults(results, functionName): FormattedResults {
  console.log(
    `\n${colors.bright}${colors.blue}=== Результаты тестов функции ${functionName} ===${colors.reset}\n`
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

  return { successful, total }
}

/**
 * Главная функция запуска тестов
 */
async function main() {
  console.log(
    `\n${colors.bright}${colors.blue}🧪 ЗАПУСК ТЕСТОВ ВСЕХ INNGEST ФУНКЦИЙ${colors.reset}\n`
  )
  console.log(
    `URL Inngest Dev Server: ${colors.cyan}${
      process.env.INNGEST_DEV_URL || 'http://localhost:8288'
    }${colors.reset}\n`
  )

  const inngestTester = new InngestTester()
  const allResults = []
  const summary: TestSummary = {
    total: 0,
    successful: 0,
    failed: 0,
    functions: {},
  }

  try {
    // Запускаем тесты для каждой функции по очереди
    for (const functionName of functionNames) {
      console.log(
        `\n${colors.bright}${colors.magenta}⏳ Тестирование функции: ${functionName}${colors.reset}\n`
      )

      const results = await inngestTester.runSpecificFunctionTests(functionName)
      const stats = formatResults(results, functionName)

      allResults.push(...results)
      summary.total += stats.total
      summary.successful += stats.successful
      summary.failed += stats.total - stats.successful
      summary.functions[functionName] = {
        total: stats.total,
        successful: stats.successful,
        failed: stats.total - stats.successful,
      }

      // Пауза между тестами для лучшей читаемости
      if (functionName !== functionNames[functionNames.length - 1]) {
        console.log(
          `${colors.dim}-----------------------------------------------------------${colors.reset}`
        )
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    // Выводим общую статистику
    console.log(
      `\n${colors.bright}${colors.blue}=== ОБЩАЯ СТАТИСТИКА ПО ВСЕМ ФУНКЦИЯМ ===${colors.reset}\n`
    )
    console.log(
      `${colors.bright}Всего тестов: ${summary.total} | Успешно: ${
        summary.successful === summary.total ? colors.green : colors.yellow
      }${summary.successful}${colors.reset} | Ошибок: ${
        summary.failed > 0 ? colors.red : colors.green
      }${summary.failed}${colors.reset}\n`
    )

    console.log(`${colors.bright}Результаты по функциям:${colors.reset}`)
    for (const [name, stats] of Object.entries(summary.functions)) {
      const successRate = Math.round((stats.successful / stats.total) * 100)
      const statusColor =
        stats.failed === 0
          ? colors.green
          : stats.failed < stats.total / 2
          ? colors.yellow
          : colors.red

      console.log(
        `  ${statusColor}${name}${colors.reset}: ${stats.successful}/${stats.total} (${successRate}%)`
      )
    }

    // Если настроено сохранение результатов, сохраняем их в файл
    if (TEST_CONFIG.options.saveResults) {
      const fs = require('fs')
      const path = require('path')
      const resultsDir = TEST_CONFIG.options.resultsPath

      // Создаем директорию, если её нет
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/:/g, '-')
      const filename = `all-inngest-functions-${timestamp}.json`
      const filePath = path.join(resultsDir, filename)

      fs.writeFileSync(
        filePath,
        JSON.stringify(
          {
            timestamp,
            summary,
            results: allResults,
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

      console.log(
        `\n${colors.dim}Результаты сохранены в: ${filePath}${colors.reset}`
      )
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
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    process.exit(1)
  }
}

// Запускаем тесты
main()
