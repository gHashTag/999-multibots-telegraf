#!/usr/bin/env node
import { config } from 'dotenv'
import path from 'path'
import { TestRunner } from './TestRunner'
import { TestCategory, isInCategory } from './categories'
import { runTranslationTests } from '../tests/translations'
import { TestResult } from './types'
import { logger } from '@/utils/logger'
import { TestDiscovery } from './TestDiscovery'
import { TestReporter } from './TestReporter'
import { runPaymentProcessorTests } from '../tests/payment/paymentProcessorTest'
import { runSystemTests } from '../tests/system'
import { runAgentRouterTests } from '../tests/system/agentRouterTest'

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
 * Выводит справку по использованию
 */
function printHelp() {
  const message = `
Использование: ts-node -r tsconfig-paths/register src/test-utils [опции]

Опции:
  --help, -h          Показать эту справку
  --verbose, -v       Включить подробный вывод
  --category=XXX      Категория тестов для запуска (например, translations, database, webhook)
  --only=XXX          Запустить только тесты, содержащие указанную строку в названии
  --skip=XXX          Пропустить тесты, содержащие указанную строку в названии
  --parallel=N        Запустить тесты параллельно с указанным уровнем параллелизма (по умолчанию: 4)
  --json              Вывести результаты в формате JSON
  --html              Сгенерировать HTML-отчет
  --output=FILE       Сохранить результаты в файл
  --tags=TAG1,TAG2    Запустить только тесты с указанными тегами
  --discover          Автоматически обнаружить и запустить тесты
  --test-dir=DIR      Указать директорию для поиска тестов (для --discover)

Категории:
  all                 Все тесты
  translations        Тесты переводов
  database            Тесты базы данных
  webhook             Тесты вебхуков
  inngest             Тесты Inngest функций
  payment             Тесты платежных функций
  payment-processor   Тесты обработчика платежей
  api                 Тесты API эндпоинтов
  system              Системные тесты (агент, роутер, валидаторы)

Примеры:
  ts-node -r tsconfig-paths/register src/test-utils --category=translations
  ts-node -r tsconfig-paths/register src/test-utils --category=database --verbose
  ts-node -r tsconfig-paths/register src/test-utils --discover --test-dir=src/test-utils/tests
  ts-node -r tsconfig-paths/register src/test-utils --json --output=test-results.json
  ts-node -r tsconfig-paths/register src/test-utils --category=payment-processor
  ts-node -r tsconfig-paths/register src/test-utils --category=system
  `

  console.log(message)
}

/**
 * Тест для функции обработки платежей (пополнение)
 * @deprecated Используйте тесты из src/test-utils/tests/payment/paymentProcessorTest.ts
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function testPaymentProcessorIncome(): Promise<TestResult> {
  logger.info('🚀 Запуск теста пополнения баланса')

  // Генерируем случайный Telegram ID и проверяем пополнение баланса
  const telegramId = Math.floor(Math.random() * 10000000000).toString()
  const amount = 100
  const stars = 100

  try {
    // Проверка корректности обработки платежа
    const result = await runPaymentProcessorTests(telegramId, amount, stars)

    return {
      success: result.success,
      name: 'Тест пополнения баланса',
      message: result.message || 'Успешно',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка в тесте пополнения баланса:', error)
    return {
      success: false,
      name: 'Тест пополнения баланса',
      message: error.message || 'Неизвестная ошибка',
      error: error.stack,
    }
  }
}

/**
 * Тест для функции обработки платежей (списание)
 * @deprecated Используйте тесты из src/test-utils/tests/payment/paymentProcessorTest.ts
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function testPaymentProcessorExpense(): Promise<TestResult> {
  logger.info('🚀 Запуск теста списания средств')

  // Генерируем случайный Telegram ID и проверяем списание баланса
  const telegramId = Math.floor(Math.random() * 10000000000).toString()
  const amount = 50 // Сумма списания
  const stars = 50 // Количество списываемых звезд

  try {
    // Проверка корректности обработки платежа
    const result = await runPaymentProcessorTests(
      telegramId,
      amount,
      stars,
      'money_expense'
    )

    return {
      success: result.success,
      name: 'Тест списания средств',
      message: result.message || 'Успешно',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка в тесте списания средств:', error)
    return {
      success: false,
      name: 'Тест списания средств',
      message: error.message || 'Неизвестная ошибка',
      error: error.stack,
    }
  }
}

/**
 * Регистрирует системные тесты
 */
async function registerSystemTests(runner: TestRunner) {
  logger.info('🚀 Запуск системных тестов')
  logger.info('🚀 Running system tests')

  // Получаем результаты системных тестов
  try {
    const results = await runSystemTests()

    if (Array.isArray(results) && results.length > 0) {
      runner.addTests([
        {
          name: 'Системные тесты',
          category: TestCategory.System,
          description: 'Общие системные тесты проекта',
          run: async () => {
            const failed = results.filter(r => !r.success)

            if (failed.length > 0) {
              const errors = failed
                .map(f => `${f.name}: ${f.message}`)
                .join('\n')
              throw new Error(`Ошибки в системных тестах:\n${errors}`)
            }

            return {
              name: 'Системные тесты',
              category: TestCategory.System,
              success: true,
              message: `✅ Все системные тесты успешно пройдены (${results.length} тестов)`,
            }
          },
        },
      ])

      logger.info(`✅ Зарегистрировано ${results.length} системных тестов`)
      logger.info(`✅ Registered ${results.length} system tests`)
    } else {
      logger.warn('⚠️ Не найдено системных тестов для выполнения')
      logger.warn('⚠️ No system tests found to run')
    }

    // Регистрация тестов маршрутизатора агентов
    runner.addTests([
      {
        name: 'Тесты маршрутизатора агентов',
        category: TestCategory.AgentRouter,
        description: 'Тесты функциональности маршрутизатора агентов',
        run: async () => {
          console.log('🚀 Запуск тестов маршрутизатора агентов...')
          const results = await runAgentRouterTests()

          // Проверяем результаты
          const failedTests = results.filter(test => !test.success)

          if (failedTests.length > 0) {
            logger.error(
              '❌ Обнаружены ошибки в тестах маршрутизатора агентов:'
            )
            failedTests.forEach(test => {
              logger.error(`  ❌ ${test.name}: ${test.message}`)
            })
            return {
              success: false,
              message: `Ошибок в тестах маршрутизатора агентов: ${failedTests.length}`,
              name: 'Тесты маршрутизатора агентов',
            }
          }

          return {
            success: true,
            message: `Успешно выполнено тестов маршрутизатора агентов: ${results.filter(t => t.success).length}`,
            name: 'Тесты маршрутизатора агентов',
          }
        },
      },
    ])
  } catch (error) {
    logger.error('❌ Ошибка при регистрации системных тестов:', error)
    logger.error('❌ Error registering system tests:', error)

    // Добавляем тест с ошибкой, чтобы пользователь увидел проблему
    runner.addTests([
      {
        name: 'Ошибка в системных тестах',
        category: TestCategory.System,
        description: 'Тест для отображения ошибок в системных тестах',
        run: async () => ({
          success: false,
          name: 'Системные тесты',
          message: `Ошибка при запуске системных тестов: ${error instanceof Error ? error.message : String(error)}`,
        }),
      },
    ])
  }
}

/**
 * Основная функция для запуска тестов
 */
export async function runTests(args = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseArgs(args)
    const reporter = new TestReporter({
      verbose: options.verbose,
      json: options.json,
      html: options.html,
      output: options.outputFile,
    })

    // Инициализируем запуск тестов
    logger.info('📝 Инициализация тестов', {
      options,
      description: 'Initializing tests',
    })

    // Создаем экземпляр TestRunner
    const runner = new TestRunner({
      verbose: options.verbose,
      parallel: options.parallel,
      reporter,
      timeout: options.timeout,
      tags: options.tags,
      only: options.only,
      skip: options.skip,
    })

    await runner.init()

    // Если нужно обнаружить тесты автоматически
    if (options.discover) {
      logger.info('🔍 Автоматическое обнаружение тестов...')

      const discovery = new TestDiscovery()
      discovery.testDir = options.testDir || 'src/test-utils/tests'
      discovery.verbose = options.verbose || false

      const discoveredTests = await discovery.discover()
      logger.info(`🔍 Обнаружено ${discoveredTests.length} тестов`, {
        description: 'Discovered tests',
        count: discoveredTests.length,
      })

      // Фильтруем тесты по категории
      const filteredTests = discoveredTests.filter(
        test =>
          options.category === TestCategory.All ||
          test.category === options.category
      )

      logger.info(
        `📝 Отфильтровано ${filteredTests.length} тестов для категории ${options.category}`,
        {
          description: 'Filtered tests',
          count: filteredTests.length,
          category: options.category,
        }
      )

      // Добавляем отфильтрованные тесты
      runner.addTests(filteredTests)
    } else {
      // Определяем категорию тестов
      const category = parseCategory(options.category)

      // Проверяем, нужно ли запускать системные тесты
      const shouldRunSystemTests = isInCategory(
        TestCategory.System,
        category as TestCategory
      )
      if (shouldRunSystemTests) {
        await registerSystemTests(runner)
      }
    }

    // Запускаем тесты и получаем результаты
    logger.info('🚀 Запуск тестов...')
    const results = await runner.runAllTests()

    // Анализируем результаты
    const { passed, failed, total } = results
    logger.info(
      `📊 Результаты тестирования: успешно - ${passed}, не пройдено - ${failed}, всего - ${total}`,
      {
        description: 'Test results',
        passed,
        failed,
        total,
      }
    )

    // Завершаем работу
    await runner.cleanup()

    // Возвращаем статус выполнения
    return failed === 0 ? 0 : 1
  } catch (error) {
    logger.error('❌ Критическая ошибка при запуске тестов:', error)
    return 1
  }
}

// Запускаем напрямую, если файл запущен как скрипт
if (require.main === module) {
  runTests()
    .then(exitCode => {
      process.exit(exitCode)
    })
    .catch(error => {
      logger.error('🔥 Неперехваченная ошибка:', error)
      process.exit(1)
    })
}
