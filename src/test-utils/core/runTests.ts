#!/usr/bin/env node
import { config } from 'dotenv'
import path from 'path'
import { TestRunner } from './TestRunner'
import { TestCategory, isInCategory } from './categories'
import { runTranslationTests } from '../tests/translations'
import { TestResult, RunnerOptions, TestCase } from './types'
import { logger } from '@/utils/logger'
import { TestDiscovery } from './TestDiscovery'
import { TestReporter } from './TestReporter'
import fs from 'fs'
import { InngestFunctionTester } from '../testers/InngestFunctionTester'
import { runPaymentProcessorTests } from '../tests/payment/paymentProcessorTest'
import { runRobokassaFormTests } from '../tests/payment/robokassaFormValidator.test'
import { runCheckFullAccessTests } from '../tests/handlers/checkFullAccess.test'

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
        testDir: options.testDir ?? 'src',
      })

      // Используем initializeTests для получения наборов тестов
      const testSuites = await TestDiscovery.initializeTests(
        options.testDir ?? 'src'
      )
      logger.info(
        `🔍 Обнаружено ${testSuites.length} наборов тестов с ${testSuites.reduce((sum, suite) => sum + suite.tests.length, 0)} тестами`,
        {
          description: 'Discovered tests',
          count: testSuites.length,
        }
      )

      // Преобразуем TestCase в формат Test для TestRunner
      const discoveredTests = testSuites.flatMap(suite =>
        suite.tests.map(testCase => ({
          name: `${suite.name} - ${testCase.name}`,
          category: testCase.category || suite.category || TestCategory.All,
          description: testCase.description || suite.description || '',
          run: testCase.test,
        }))
      )

      // Фильтруем тесты по категории
      const filteredTests = discoveredTests.filter(
        test =>
          options.category === TestCategory.All ||
          isInCategory(test.category, options.category ?? TestCategory.All)
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
        options.category ?? TestCategory.All
      )

      // Проверяем, нужно ли запускать тесты платежной системы
      const shouldRunPaymentProcessorTests = isInCategory(
        TestCategory.PaymentProcessor,
        options.category ?? TestCategory.All
      )

      // Проверяем, нужно ли запускать тесты платежной системы
      const shouldRunPaymentTests = isInCategory(
        TestCategory.Payment,
        options.category ?? TestCategory.All
      )

      // Проверяем, нужно ли запускать тесты валидации URL Robokassa
      const shouldRunRobokassaFormTests = isInCategory(
        TestCategory.Payment,
        options.category ?? TestCategory.All
      ) || options.category === 'robokassa'

      // Добавляем проверку для новой категории Supabase
      const shouldRunDatabaseTests = isInCategory(TestCategory.Database, options.category ?? TestCategory.All)

      // Добавляем проверку для категории Api (для checkFullAccess)
      const shouldRunApiTests = isInCategory(TestCategory.Api, options.category ?? TestCategory.All)

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

          // Добавляем каждый результат как отдельный тест
          for (const result of paymentResults) {
            if (!result.name) {
              logger.warn('Тест платежного процессора не имеет имени', result)
              continue
            }
            runner.addTests([
              {
                name: result.name, // Используем имя из результата подтеста
                category: TestCategory.PaymentProcessor,
                description: result.message || '', // Используем сообщение из результата
                run: async () => {
                  // Просто возвращаем результат, т.к. тест уже выполнен
                  if (!result.success) {
                    throw new Error(result.message || 'Тест платежного процессора провален')
                  }
                  return {
                    success: result.success,
                    message: result.message || '',
                    details: result.details, // Используем детали из результата
                  }
                },
              },
            ])
          }

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
          const paymentRunResult = await runPaymentTests({ verbose: options.verbose })

          // Обрабатываем результаты
          if (paymentRunResult && Array.isArray(paymentRunResult.results)) {
            let totalTests = 0
            // Проходим по группам тестов (массивам TestResult[])
            for (const testGroup of paymentRunResult.results) {
              if (Array.isArray(testGroup)) {
                totalTests += testGroup.length
                // Проходим по результатам тестов в группе
                for (const testResult of testGroup) {
                  if (testResult && testResult.name) {
                    runner.addTests([
                      {
                        name: testResult.name,
                        category: TestCategory.Payment,
                        description: testResult.message || '',
                        run: async () => {
                          if (!testResult.success) {
                            // Safely determine the error message
                            let errorMessage = testResult.message || 'Payment test failed';
                            if ('error' in testResult && testResult.error) {
                              const errorObj = testResult.error;
                              errorMessage = errorObj instanceof Error ? errorObj.message : String(errorObj);
                            }
                            throw new Error(errorMessage);
                          }
                          return testResult
                        },
                      },
                    ])
                  }
                }
              }
            }

            logger.info(`✅ Добавлено тестов платежных функций: ${totalTests}`)
            logger.info(`✅ Added payment function tests: ${totalTests}`)
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
        const robokassaRunResult = await runRobokassaFormTests()

        // Преобразуем результаты в тесты для TestRunner
        if (robokassaRunResult && Array.isArray(robokassaRunResult.results)) {
          for (const testResult of robokassaRunResult.results) {
            if (testResult && testResult.name) {
              runner.addTests([
                {
                  name: testResult.name || 'Тест URL Robokassa',
                  category: TestCategory.Payment,
                  description: 'Проверка валидности URL формы Robokassa',
                  run: async () => {
                    if (!testResult.success) {
                      // Safely determine the error message
                      let errorMessage = testResult.message || 'Тест URL Robokassa не пройден';
                      if ('error' in testResult && testResult.error) {
                        const errorObj = testResult.error;
                        errorMessage = errorObj instanceof Error ? errorObj.message : String(errorObj);
                      }
                      throw new Error(errorMessage);
                    }
                    return {
                      success: true,
                      name: testResult.name,
                      message: 'Тест URL Robokassa успешно пройден',
                      details: testResult,
                    }
                  },
                },
              ])
            }
          }
           logger.info(`✅ Добавлено тестов Robokassa: ${robokassaRunResult.results.length}`)
           logger.info(`✅ Added Robokassa tests: ${robokassaRunResult.results.length}`)
        }
      }

      // Запускаем тесты Api
      if (shouldRunApiTests) {
          logger.info('📦 Загрузка тестов API/Handlers...');
          try {
              const handlerResults = await runCheckFullAccessTests(options);
              for (const result of handlerResults) {
                  // Проверяем наличие result.name перед добавлением
                  if (result && result.name) {
                      runner.addTests([
                          {
                              name: result.name,
                              category: TestCategory.Api, // Используем Api как категорию
                              description: result.message || '',
                              run: async () => { 
                                  if (!result.success) {
                                      const error = result.error || result.message || 'Handler test failed';
                                      throw new Error(error instanceof Error ? error.message : String(error));
                                  }
                                  return result;
                              }
                          }
                      ]);
                  } else {
                      logger.warn('Результат теста обработчика без имени:', result);
                  }
              }
              logger.info(`✅ Добавлено тестов API/Handlers: ${handlerResults.length}`);
          } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logger.error(`❌ Ошибка при запуске тестов API/Handlers: ${errorMessage}`);
              runner.addTests([
                  {
                      name: 'API/Handler Tests',
                      category: TestCategory.Api,
                      description: 'Running API/Handler tests',
                      run: async () => { throw new Error(`Failed to run API/Handler tests: ${errorMessage}`) }
                  }
              ]);
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
    logger.info('🧹 Test resources cleanup finished.');
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
