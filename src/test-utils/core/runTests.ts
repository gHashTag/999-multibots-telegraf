#!/usr/bin/env node
import { config } from 'dotenv'
import path from 'path'
import { TestRunner } from './TestRunner'
import { TestResult } from '../types'
import { logger } from '@/utils/logger'
import { runSystemTests } from '../tests/system'
import { runAgentRouterTests } from '../tests/system/agentRouterTest'
import { TestCategory } from './categories'
import fs from 'fs'

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

// Условный импорт для runAgentTests
let runAgentTests: () => Promise<TestResult[]>
const agentTestPath = path.resolve(__dirname, '../tests/agent/index.ts')

try {
  if (fs.existsSync(agentTestPath)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const agentTestModule = require('../tests/agent/index')
    runAgentTests = agentTestModule.runAgentTests
  }
} catch (error) {
  logger.warn(
    `🚨 Не удалось загрузить тесты агентов: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`
  )
}

// Условный импорт для runTasksTests
let runTasksTests: () => Promise<TestResult[]>
const tasksTestPath = path.resolve(__dirname, '../tests/tasks/index.ts')

try {
  if (fs.existsSync(tasksTestPath)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tasksTestModule = require('../tests/tasks/index')
    runTasksTests = tasksTestModule.runTasksTests
  }
} catch (error) {
  logger.warn(
    `🚨 Не удалось загрузить тесты задач: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`
  )
}

/**
 * Парсинг категорий тестов из аргументов командной строки
 */
function parseCategories(args: string[]): string[] {
  const categories: string[] = []

  for (const arg of args) {
    // Проверяем, является ли аргумент категорией
    const categoryMatch = /^--category=(.+)$/.exec(arg)
    if (categoryMatch && categoryMatch[1]) {
      categories.push(...categoryMatch[1].split(','))
    }
  }

  return categories
}

/**
 * Парсинг опций тестирования из аргументов командной строки
 */
function parseOptions(args: string[]): {
  verbose: boolean
  output?: string
  testDir?: string
  only?: string[]
  skip?: string[]
} {
  const options: {
    verbose: boolean
    output?: string
    testDir?: string
    only?: string[]
    skip?: string[]
  } = {
    verbose: false,
  }

  for (const arg of args) {
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true
    } else if (arg.startsWith('--output=')) {
      options.output = arg.substring('--output='.length)
    } else if (arg.startsWith('--test-dir=')) {
      options.testDir = arg.substring('--test-dir='.length)
    } else if (arg.startsWith('--only=')) {
      options.only = arg.substring('--only='.length).split(',')
    } else if (arg.startsWith('--skip=')) {
      options.skip = arg.substring('--skip='.length).split(',')
    }
  }

  return options
}

/**
 * Запуск тестов из командной строки
 */
export async function runTests(
  args: string[] = process.argv.slice(2)
): Promise<void> {
  const categories = parseCategories(args)
  const options = parseOptions(args)

  logger.info(
    `🚀 Запуск тестов с категориями: ${categories.join(', ') || 'все'}`
  )
  logger.info(`📋 Опции: ${JSON.stringify(options)}`)

  const testRunner = new TestRunner({
    verbose: options.verbose,
    only: options.only,
    skip: options.skip,
  })

  await testRunner.init()

  // Регистрация тестов по категориям
  const registeredTests: string[] = []

  // Если не указаны категории или указана категория System
  if (categories.length === 0 || categories.includes(TestCategory.System)) {
    logger.info(` Регистрация тестов категории "${TestCategory.System}"`)

    const systemTests = await runSystemTests()
    testRunner.addTests(
      systemTests.map(result => ({
        name: result.name,
        category: TestCategory.System,
        description: result.message || 'Системный тест',
        run: async (): Promise<void> => {
                    if (!result.success) {
            throw new Error(result.message || 'Тест не пройден')
          }
        },
      }))
    )

    registeredTests.push(TestCategory.System)
  }

  // Если не указаны категории или указана категория AgentRouter
  if (
    categories.length === 0 ||
    categories.includes(TestCategory.AgentRouter)
  ) {
    logger.info(`📋 Регистрация тестов категории "${TestCategory.AgentRouter}"`)

    const agentRouterTests = await runAgentRouterTests()
    testRunner.addTests(
      agentRouterTests.map(result => ({
        name: result.name,
        category: TestCategory.AgentRouter,
        description: result.message || 'Тест маршрутизатора агентов',
        run: async (): Promise<void> => {
                    if (!result.success) {
            throw new Error(result.message || 'Тест не пройден')
          }
        },
      }))
    )

    registeredTests.push(TestCategory.AgentRouter)
  }

  // Если не указаны категории или указана категория Agents и функция runAgentTests доступна
  if (
    (categories.length === 0 || categories.includes(TestCategory.Agents)) &&
    runAgentTests
  ) {
    logger.info(`📋 Регистрация тестов категории "${TestCategory.Agents}"`)

    const agentTests = await runAgentTests()
    testRunner.addTests(
      agentTests.map(result => ({
        name: result.name,
        category: TestCategory.Agents,
        description: result.message || 'Тест специализированных агентов',
        run: async (): Promise<void> => {
          if (!result.success) {
            throw new Error(result.message || 'Тест не пройден')
          }
        },
      }))
    )

    registeredTests.push(TestCategory.Agents)
  }

  // Если не указаны категории или указана категория Tasks и функция runTasksTests доступна
  if (
    (categories.length === 0 || categories.includes(TestCategory.Tasks)) &&
    runTasksTests
  ) {
    logger.info(`📋 Регистрация тестов категории "${TestCategory.Tasks}"`)

    const tasksTests = await runTasksTests()
    testRunner.addTests(
      tasksTests.map(result => ({
        name: result.name,
        category: TestCategory.Tasks,
        description: result.message || 'Тест модуля задач',
        run: async (): Promise<void> => {
                    if (!result.success) {
            throw new Error(result.message || 'Тест не пройден')
          }
        },
      }))
    )

    registeredTests.push(TestCategory.Tasks)
  }

  if (registeredTests.length === 0) {
    logger.warn('⚠️ Не удалось зарегистрировать ни одного теста')
    return
  }

  logger.info(`📊 Зарегистрировано тестов: ${testRunner.getTestCount()}`)
  logger.info(`🚀 Запуск тестов категорий: ${registeredTests.join(', ')}`)

  const results = await testRunner.runTestsInParallel()

  // Получаем количество успешных и неуспешных тестов
  const successfulTests = results.filter(result => result.success).length
  const failedTests = results.length - successfulTests

  if (failedTests > 0) {
    logger.error(`❌ Не пройдено тестов: ${failedTests}/${results.length}`)
    process.exit(1)
      } else {
    logger.info(
      `✅ Все тесты успешно пройдены: ${successfulTests}/${results.length}`
    )
    process.exit(0)
  }

  await testRunner.cleanup()
}

// Запускаем напрямую, если файл запущен как скрипт
if (require.main === module) {
  runTests()
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      logger.error('🔥 Неперехваченная ошибка:', error)
      process.exit(1)
    })
}
