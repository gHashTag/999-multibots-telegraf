#!/usr/bin/env node
import { config } from 'dotenv'
import path from 'path'
import { TestRunner } from './TestRunner'
import { TestCategory, isInCategory } from './categories'
import { runTranslationTests } from '../tests/translations'
import { TestResult, RunnerOptions } from './types'
import { logger } from '@/utils/logger'
import { TestDiscovery } from './TestDiscovery'
import { TestReporter } from './TestReporter'
import fs from 'fs'
import { InngestFunctionTester } from '../testers/InngestFunctionTester'
import { runPaymentProcessorTests } from '../tests/payment/paymentProcessorTest'
import { runRobokassaFormTests } from '../tests/payment/robokassaFormValidator.test'

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

/**
 * Разбор аргументов командной строки
 */
function parseArgs(args: string[]): RunnerOptions {
  // значения по умолчанию
  const result: RunnerOptions = {
    verbose: false,
    only: [],
    skip: [],
    category: TestCategory.All,
    parallel: 4,
    outputFormat: 'text',
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
      result.category = arg.split('=')[1] as TestCategory
    } else if (arg.startsWith('--parallel=')) {
      result.parallel = parseInt(arg.split('=')[1], 10)
    } else if (arg === '--json') {
      result.outputFormat = 'json'
    } else if (arg === '--html') {
      result.outputFormat = 'html'
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

Примеры:
  ts-node -r tsconfig-paths/register src/test-utils --category=translations
  ts-node -r tsconfig-paths/register src/test-utils --category=database --verbose
  ts-node -r tsconfig-paths/register src/test-utils --discover --test-dir=src/test-utils/tests
  ts-node -r tsconfig-paths/register src/test-utils --json --output=test-results.json
  ts-node -r tsconfig-paths/register src/test-utils --category=payment-processor
  `

  console.log(message)
}

/**
 * Тест для функции обработки платежей (пополнение)
 * @deprecated Используйте тесты из src/test-utils/tests/payment/paymentProcessorTest.ts
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function testPaymentProcessorIncome(): Promise<TestResult> {
  logger.info('🧪 Тест функции обработки платежей (пополнение)')
  logger.info('🧪 Testing payment processor function (income)')

  const tester = new InngestFunctionTester({ verbose: true })

  try {
    const result = await tester.testPaymentProcessorIncome()

    return {
      name: 'Тест обработки платежей (пополнение)',
      category: TestCategory.PaymentProcessor,
      success: result.success,
      message: result.message || 'Тест успешно выполнен',
      details: result.data,
      error: result.error ? String(result.error) : undefined,
    }
  } catch (error) {
    logger.error('❌ Ошибка при тестировании обработки платежей (пополнение)', {
      description: 'Error during payment processor test (income)',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      name: 'Тест обработки платежей (пополнение)',
      category: TestCategory.PaymentProcessor,
      success: false,
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Тест для функции обработки платежей (списание)
 * @deprecated Используйте тесты из src/test-utils/tests/payment/paymentProcessorTest.ts
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function testPaymentProcessorExpense(): Promise<TestResult> {
  logger.info('🧪 Тест функции обработки платежей (списание)')
  logger.info('🧪 Testing payment processor function (expense)')

  const tester = new InngestFunctionTester({ verbose: true })

  try {
    const result = await tester.testPaymentProcessorExpense()

    return {
      name: 'Тест обработки платежей (списание)',
      category: TestCategory.PaymentProcessor,
      success: result.success,
      message: result.message || 'Тест успешно выполнен',
      details: result.data,
      error: result.error ? String(result.error) : undefined,
    }
  } catch (error) {
    logger.error('❌ Ошибка при тестировании обработки платежей (списание)', {
      description: 'Error during payment processor test (expense)',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      name: 'Тест обработки платежей (списание)',
      category: TestCategory.PaymentProcessor,
      success: false,
      message: 'Ошибка при выполнении теста',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Основная функция для запуска тестов
 */
export async function runTests(args = process.argv.slice(2)): Promise<number> {
  // Парсим аргументы командной строки
  const options = parseArgs(args)

  // Выводим справку, если запрошена
  if (options.help) {
    printHelp()
    return 0
  }

  // Инициализируем репортер
  const reporter = new TestReporter(options.outputFormat, options.outputFile)

  // Запоминаем время начала тестов
  const startTime = Date.now()
  reporter.setStartTime(startTime)

  // Создаем экземпляр TestRunner
  const runner = new TestRunner({
    verbose: options.verbose,
    only: options.only || [],
    skip: options.skip || [],
  })

  // Инициализируем TestRunner
  await runner.init()

  try {
    logger.info('🚀 Запуск тестов', {
      description: 'Starting tests',
      category: options.category,
      verbose: options.verbose,
    })

    // Автоматическое обнаружение тестов
    if (options.discover) {
      logger.info('🔍 Автоматическое обнаружение тестов', {
        description: 'Auto-discovering tests',
        testDir: options.testDir,
      })

      const discovery = new TestDiscovery({
        testDir: options.testDir,
        verbose: options.verbose,
      })

      const discoveredTests = await discovery.discoverTests()
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

      runner.addTests(filteredTests)
    } else {
      // Запускаем тесты, относящиеся к нужной категории
      logger.info('📦 Подготовка тестов из категории', {
        description: 'Preparing tests from category',
        category: options.category,
      })

      // Проверяем, нужно ли запускать тесты переводов
      const shouldRunTranslationTests = isInCategory(
        TestCategory.Translations,
        options.category
      )

      // Проверяем, нужно ли запускать тесты платежной системы
      const shouldRunPaymentProcessorTests = isInCategory(
        TestCategory.PaymentProcessor,
        options.category
      )

      // Проверяем, нужно ли запускать тесты платежной системы
      const shouldRunPaymentTests = isInCategory(
        TestCategory.Payment,
        options.category
      )

      // Проверяем, нужно ли запускать тесты валидации URL Robokassa
      const shouldRunRobokassaFormTests = isInCategory(
        TestCategory.Payment,
        options.category
      ) || options.category === 'robokassa'

      // Запускаем тесты переводов, если выбрана соответствующая категория
      if (shouldRunTranslationTests) {
        logger.info('🌐 Загрузка тестов переводов...')
        logger.info('🌐 Loading translation tests...')

        try {
          // Запускаем тесты переводов
          const translationResults = runTranslationTests()

          // Обрабатываем результаты
          if (Array.isArray(translationResults)) {
            logger.info(
              `✅ Добавлено тестов переводов: ${translationResults.length}`
            )
            logger.info(
              `✅ Added translation tests: ${translationResults.length}`
            )

            // Добавляем каждый тест в TestRunner
            for (const result of translationResults) {
              runner.addTests([
                {
                  name: result.name || 'Translation Test',
                  category: TestCategory.Translations,
                  description: result.message || 'Translation validation',
                  run: async () => {
                    if (!result.success) {
                      throw new Error(result.message || 'Translation test failed')
                    }
                    return result
                  },
                },
              ])
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          logger.error(`❌ Ошибка при запуске тестов переводов: ${errorMessage}`)
          logger.error(`❌ Error running translation tests: ${errorMessage}`)

          // Добавляем ошибку как тест
          runner.addTests([
            {
              name: 'Translation Tests',
              category: TestCategory.Translations,
              description: 'Running translation tests',
              run: async () => {
                throw new Error(
                  `Failed to run translation tests: ${errorMessage}`
                )
              },
            },
          ])
        }
      }

      // Запускаем тесты платежного процессора, если выбрана соответствующая категория
      if (shouldRunPaymentProcessorTests) {
        logger.info('💰 Загрузка тестов платежного процессора...')
        logger.info('💰 Loading payment processor tests...')

        try {
          // Запускаем тесты платежного процессора
          const paymentResults = await runPaymentProcessorTests()

          // Добавляем тесты в runner
          runner.addTests([
            {
              name: 'Тест функции пополнения баланса',
              category: TestCategory.PaymentProcessor,
              description:
                'Проверка корректности работы функции пополнения баланса',
              run: async () => {
                const result = paymentResults[0]
                return {
                  success: result.success,
                  message: result.message || '',
                  details: result.data,
                }
              },
            },
            {
              name: 'Тест функции списания средств',
              category: TestCategory.PaymentProcessor,
              description:
                'Проверка корректности работы функции списания средств',
              run: async () => {
                const result = paymentResults[1]
                return {
                  success: result.success,
                  message: result.message || '',
                  details: result.data,
                }
              },
            },
          ])

          logger.info(
            `✅ Добавлены тесты платежного процессора: ${paymentResults.length}`
          )
          logger.info(
            `✅ Added payment processor tests: ${paymentResults.length}`
          )
        } catch (error) {
          logger.error(
            '❌ Ошибка при загрузке тестов платежного процессора',
            error
          )
          logger.error('❌ Error loading payment processor tests', error)
        }
      }

      // Запускаем тесты Inngest функций, если выбрана соответствующая категория
      if (
        options.category === TestCategory.All ||
        options.category === TestCategory.Inngest ||
        options.category === TestCategory.NeuroPhoto ||
        options.category === TestCategory.NeuroPhotoV2
      ) {
        logger.info('🤖 Загрузка тестов Inngest функций...')
        logger.info('🤖 Loading Inngest function tests...')

        try {
          // Импортируем динамически, чтобы избежать циклических зависимостей
          const { runInngestTests } = await import('../tests/inngest')

          // Запускаем тесты Inngest функций
          const results = await runInngestTests({ verbose: options.verbose })

          // Обрабатываем результаты
          if (Array.isArray(results)) {
            logger.info(`✅ Добавлено тестов Inngest функций: ${results.length}`)
            logger.info(`✅ Added Inngest function tests: ${results.length}`)

            // Преобразуем результаты в тесты для TestRunner
            for (const result of results) {
              runner.addTests([
                {
                  name: result.name || 'Inngest Function Test',
                  category: result.category || 'inngest',
                  description: result.message || 'Inngest function testing',
                  run: async () => {
                    if (!result.success) {
                      throw new Error(
                        result.message || 'Inngest function test failed'
                      )
                    }
                    return result
                  },
                },
              ])
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          logger.error(
            `❌ Ошибка при запуске тестов Inngest функций: ${errorMessage}`
          )
          logger.error(`❌ Error running Inngest function tests: ${errorMessage}`)

          // Добавляем ошибку как тест
          runner.addTests([
            {
              name: 'Inngest Function Tests',
              category: 'inngest',
              description: 'Running Inngest function tests',
              run: async () => {
                throw new Error(
                  `Failed to run Inngest function tests: ${errorMessage}`
                )
              },
            },
          ])
        }
      }

      // Запускаем тесты платежных функций, если выбрана соответствующая категория
      if (shouldRunPaymentTests) {
        logger.info('💰 Загрузка тестов платежных функций...')
        logger.info('💰 Loading payment function tests...')

        try {
          // Импортируем динамически, чтобы избежать циклических зависимостей
          const { runPaymentTests } = await import('../tests/payment')

          // Запускаем тесты платежных функций
          const result = await runPaymentTests({ verbose: options.verbose })

          // Обрабатываем результаты
          if (result && result.results && Array.isArray(result.results)) {
            const totalTests = result.results.reduce(
              (total: number, group: any) => {
                return (
                  total +
                  (Array.isArray(group.results) ? group.results.length : 0)
                )
              },
              0
            )

            logger.info(`✅ Добавлено тестов платежных функций: ${totalTests}`)
            logger.info(`✅ Added payment function tests: ${totalTests}`)

            // Преобразуем результаты в тесты для TestRunner
            for (const group of result.results) {
              if (Array.isArray(group.results)) {
                // Если у нас есть результаты для этой группы платежных тестов
                for (const test of group.results) {
                  runner.addTests([
                    {
                      name: test.name || `${group.name} Test`,
                      category: 'payment',
                      description: test.description || `Testing ${group.name}`,
                      run: async () => {
                        if (!test.success) {
                          throw new Error(
                            test.error || `${group.name} test failed`
                          )
                        }
                        return test
                      },
                    },
                  ])
                }
              } else {
                // Для группы без детальных результатов, добавляем общий тест
                runner.addTests([
                  {
                    name: group.name || 'Payment Test',
                    category: 'payment',
                    description: `Testing ${group.name}`,
                    run: async () => {
                      if (!group.success) {
                        throw new Error(group.error || 'Payment test failed')
                      }
                      return group
                    },
                  },
                ])
              }
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          logger.error(
            `❌ Ошибка при запуске тестов платежных функций: ${errorMessage}`
          )
          logger.error(`❌ Error running payment function tests: ${errorMessage}`)

          // Добавляем ошибку как тест
          runner.addTests([
            {
              name: 'Payment Function Tests',
              category: 'payment',
              description: 'Running payment function tests',
              run: async () => {
                throw new Error(
                  `Failed to run payment function tests: ${errorMessage}`
                )
              },
            },
          ])
        }
      }

      // Если нужно запустить тесты проверки URL формы Robokassa
      if (shouldRunRobokassaFormTests) {
        logger.info('🧪 Запуск тестов валидации URL формы Robokassa', {
          description: 'Running Robokassa form URL validation tests',
        })

        // Запускаем тесты Robokassa
        const results = await runRobokassaFormTests()

        // Преобразуем результаты в тесты для TestRunner
        if (results.results && Array.isArray(results.results)) {
          for (const test of results.results) {
            runner.addTests([
              {
                name: test.name || 'Тест URL Robokassa',
                category: 'payment',
                description: 'Проверка валидности URL формы Robokassa',
                run: async () => {
                  if (!test.success) {
                    throw new Error(test.error || 'Тест URL Robokassa не пройден')
                  }
                  return {
                    success: true,
                    name: test.name,
                    message: 'Тест URL Robokassa успешно пройден',
                    details: test
                  }
                },
              },
            ])
          }
        }
      }
    }

    // Проверяем, есть ли тесты для запуска
    if (runner.getTestCount() === 0) {
      logger.warn('⚠️ Нет тестов для запуска!')
      logger.warn('⚠️ No tests to run!')
      return 0
    }

    // Запускаем тесты
    const results = await runner.runTests()

    // Запоминаем время окончания тестов
    const endTime = Date.now()
    reporter.setEndTime(endTime)

    // Добавляем результаты в репортер
    reporter.addResults(results)

    // Генерируем отчет
    if (options.outputFormat !== 'text' || options.outputFile) {
      const report = await reporter.generateReport()

      // Если указан файл, сохраняем отчет
      if (options.outputFile) {
        await reporter.saveReport(report)
      } else {
        // Иначе выводим в консоль
        console.log(report)
      }
    }

    // Подсчитываем результаты
    const successCount = results.filter(r => r.success).length
    const failCount = results.length - successCount

    // Завершаем с соответствующим кодом
    return failCount > 0 ? 1 : 0
  } finally {
    // Очищаем ресурсы
    await runner.cleanup()
  }
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  runTests()
    .then(exitCode => {
      process.exit(exitCode)
    })
    .catch(error => {
      logger.error('🔥 Критическая ошибка при запуске тестов:', error)
      logger.error('🔥 Critical error running tests:', error)
      process.exit(1)
    })
}
