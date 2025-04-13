#!/usr/bin/env node
import { config } from 'dotenv'
import path from 'path'
import { TestRunner } from './TestRunner'
import { TestCategory, isInCategory } from './categories'
import { logger } from '@/utils/logger'
import { runSystemTests } from '../tests/system'
import { runAgentRouterTests } from '../tests/system/agentRouterTest'
import { TestResult } from '../types'

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

/**
 * Разбор категории тестов
 */
function parseCategory(category?: string): TestCategory {
  if (!category) return TestCategory.All

  // Проверяем, есть ли такая категория в enum
  if (Object.values(TestCategory).includes(category as TestCategory)) {
    return category as TestCategory
  }

  // Обрабатываем специальные случаи
  switch (category.toLowerCase()) {
    case 'all':
      return TestCategory.All
    case 'translations':
      return TestCategory.Translations
    case 'database':
      return TestCategory.Database
    case 'webhook':
      return TestCategory.Webhook
    case 'inngest':
      return TestCategory.Inngest
    case 'payment':
      return TestCategory.Payment
    case 'payment-processor':
      return TestCategory.PaymentProcessor
    case 'api':
      return TestCategory.Api
    case 'system':
      return TestCategory.System
    case 'agent-router':
      return TestCategory.AgentRouter
    default:
      return TestCategory.All
  }
}

/**
 * Разбор аргументов командной строки
 */
function parseArgs(args: string[]) {
  // значения по умолчанию
  const result = {
    verbose: false,
    only: [] as string[],
    skip: [] as string[],
    category: TestCategory.All,
    parallel: 4,
    json: false,
    html: false,
    outputFile: undefined as string | undefined,
    discover: false,
    testDir: undefined as string | undefined,
    timeout: 30000,
    tags: [] as string[],
    help: false,
  }

  // Парсим аргументы командной строки
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--verbose' || arg === '-v') {
      result.verbose = true
    } else if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg.startsWith('--only=')) {
      result.only = [arg.split('=')[1]]
    } else if (arg.startsWith('--skip=')) {
      result.skip = [arg.split('=')[1]]
    } else if (arg.startsWith('--category=')) {
      result.category = parseCategory(arg.split('=')[1])
    } else if (arg.startsWith('--parallel=')) {
      result.parallel = parseInt(arg.split('=')[1], 10)
    } else if (arg === '--json') {
      result.json = true
    } else if (arg === '--html') {
      result.html = true
    } else if (arg.startsWith('--output=')) {
      result.outputFile = arg.split('=')[1]
    } else if (arg.startsWith('--tags=')) {
      result.tags = arg.split('=')[1].split(',')
    } else if (arg === '--discover') {
      result.discover = true
    } else if (arg.startsWith('--test-dir=')) {
      result.testDir = arg.split('=')[1]
    }
  }

  return result
}

/**
 * Основная функция для запуска тестов
 */
export async function runTests(args: string[]) {
  const testRunner = new TestRunner({
    filter: args,
    parallel: false,
    timeout: 30000,
  })

  // Регистрируем системные тесты
  testRunner.addTest({
    name: 'Тесты маршрутизатора агентов',
    category: TestCategory.AgentRouter,
    run: async () => {
      const results = await runSystemTests()

      // Проверяем, все ли тесты прошли успешно
      const allSuccess = results.every(result => result.success)

      if (allSuccess) {
        return {
          success: true,
          message: 'Все системные тесты успешно пройдены',
          name: 'Системные тесты',
        }
      } else {
        const failedTests = results.filter(result => !result.success)
        const failMessages = failedTests
          .map(test => `${test.name}: ${test.message}`)
          .join(', ')

        return {
          success: false,
          message: `Системные тесты завершились с ошибками: ${failMessages}`,
          name: 'Системные тесты',
        }
      }
    },
  })

  await testRunner.run()
}

// Запускаем напрямую, если файл запущен как скрипт
if (require.main === module) {
  runTests(process.argv.slice(2))
    .then(exitCode => {
      process.exit(exitCode)
    })
    .catch(error => {
      logger.error('🔥 Неперехваченная ошибка:', error)
      process.exit(1)
    })
}
