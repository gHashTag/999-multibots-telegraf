#!/usr/bin/env node
import { config } from 'dotenv'
import path from 'path'
import { TestRunner } from './TestRunner'
import { TestCategory, isInCategory } from './categories'
import { TestResult, RunnerOptions } from './types'
import { logger } from '@/utils/logger'
import { TestDiscovery } from './TestDiscovery'
import { TestReporter } from './TestReporter'
import fs from 'fs'

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
    const nextArg = args[i + 1]

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
  --category=XXX      Категория тестов для запуска (например, database, webhook, inngest)
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
  database            Тесты базы данных
  webhook             Тесты вебхуков
  inngest             Тесты Inngest функций
  payment             Тесты платежных функций

Примеры:
  ts-node -r tsconfig-paths/register src/test-utils --category=database
  ts-node -r tsconfig-paths/register src/test-utils --category=inngest --verbose
  ts-node -r tsconfig-paths/register src/test-utils --discover --test-dir=src/test-utils/tests
  ts-node -r tsconfig-paths/register src/test-utils --json --output=test-results.json
  `

  console.log(message)
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
  const reporter = new TestReporter(
    options.outputFormat,
    options.outputFile
  )

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
    // Определяем категорию тестов для запуска
    const category = options.category as TestCategory

    // Если используется автоматическое обнаружение тестов
    if (options.discover) {
      logger.info('🔍 Автоматическое обнаружение тестов...')
      logger.info('🔍 Automatic test discovery...')

      const testDir = options.testDir || path.resolve('src/test-utils/tests')
      
      // Проверяем, существует ли директория
      if (!fs.existsSync(testDir)) {
        logger.error(`❌ Директория ${testDir} не существует`)
        logger.error(`❌ Directory ${testDir} does not exist`)
        return 1
      }

      // Инициализируем тесты
      const suites = await TestDiscovery.initializeTests(testDir)

      // Добавляем тесты в раннер
      for (const suite of suites) {
        // Проверяем, подходит ли категория
        if (category === TestCategory.All || isInCategory(suite.category || '', category)) {
          logger.info(`📦 Добавление тестового набора: ${suite.name}`)
          
          // Запускаем beforeAll хуки
          if (suite.beforeAll) {
            await suite.beforeAll()
          }

          // Добавляем тесты в раннер
          const testsToAdd = suite.tests.filter(test => {
            // Фильтрация по тегам
            if (options.tags && options.tags.length > 0) {
              return test.tags && test.tags.some(tag => options.tags!.includes(tag))
            }
            return true
          })

          if (testsToAdd.length > 0) {
            runner.addTests(testsToAdd.map(test => ({
              name: test.name,
              category: test.category || suite.category || 'unknown',
              description: test.description || '',
              run: test.test
            })))
          }
        }
      }
    }

    // Запускаем тесты Inngest функций, если выбрана соответствующая категория
    if (category === TestCategory.All || category === TestCategory.Inngest || 
        category === TestCategory.NeuroPhoto || category === TestCategory.NeuroPhotoV2) {
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
            runner.addTests([{
              name: result.name || 'Inngest Function Test',
              category: result.category || 'inngest',
              description: result.message || 'Inngest function testing',
              run: async () => {
                if (!result.success) {
                  throw new Error(result.message || 'Inngest function test failed')
                }
                return result
              }
            }])
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error(`❌ Ошибка при запуске тестов Inngest функций: ${errorMessage}`)
        logger.error(`❌ Error running Inngest function tests: ${errorMessage}`)
        
        // Добавляем ошибку как тест
        runner.addTests([{
          name: 'Inngest Function Tests',
          category: 'inngest',
          description: 'Running Inngest function tests',
          run: async () => {
            throw new Error(`Failed to run Inngest function tests: ${errorMessage}`)
          }
        }])
      }
    }

    // Запускаем тесты платежных функций, если выбрана соответствующая категория
    if (category === TestCategory.All || category === TestCategory.Payment) {
      logger.info('💰 Загрузка тестов платежных функций...')
      logger.info('💰 Loading payment function tests...')
      
      try {
        // Импортируем динамически, чтобы избежать циклических зависимостей
        const { runPaymentTests } = await import('../tests/payment')
        
        // Запускаем тесты платежных функций
        const result = await runPaymentTests({ verbose: options.verbose })
        
        // Обрабатываем результаты
        if (result && result.results && Array.isArray(result.results)) {
          const totalTests = result.results.reduce((total: number, group: any) => {
            return total + (Array.isArray(group.results) ? group.results.length : 0)
          }, 0)
          
          logger.info(`✅ Добавлено тестов платежных функций: ${totalTests}`)
          logger.info(`✅ Added payment function tests: ${totalTests}`)
          
          // Преобразуем результаты в тесты для TestRunner
          for (const group of result.results) {
            if (Array.isArray(group.results)) {
              // Если у нас есть результаты для этой группы платежных тестов
              for (const test of group.results) {
                runner.addTests([{
                  name: test.name || `${group.name} Test`,
                  category: 'payment',
                  description: test.description || `Testing ${group.name}`,
                  run: async () => {
                    if (!test.success) {
                      throw new Error(test.error || `${group.name} test failed`)
                    }
                    return test
                  }
                }])
              }
            } else {
              // Для группы без детальных результатов, добавляем общий тест
              runner.addTests([{
                name: group.name || 'Payment Test',
                category: 'payment',
                description: `Testing ${group.name}`,
                run: async () => {
                  if (!group.success) {
                    throw new Error(group.error || 'Payment test failed')
                  }
                  return group
                }
              }])
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error(`❌ Ошибка при запуске тестов платежных функций: ${errorMessage}`)
        logger.error(`❌ Error running payment function tests: ${errorMessage}`)
        
        // Добавляем ошибку как тест
        runner.addTests([{
          name: 'Payment Function Tests',
          category: 'payment',
          description: 'Running payment function tests',
          run: async () => {
            throw new Error(`Failed to run payment function tests: ${errorMessage}`)
          }
        }])
      }
    }

    // Проверяем, есть ли тесты для запуска
    if (runner.getTestCount() === 0) {
      logger.warn('⚠️ Нет тестов для запуска!')
      logger.warn('⚠️ No tests to run!')
      return 0
    }

    // Запускаем тесты
    const results = options.parallel && options.parallel > 1
      ? await runner.runTestsInParallel(options.parallel)
      : await runner.runTests()
    
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
  runTests().then(exitCode => {
    process.exit(exitCode)
  }).catch(error => {
    logger.error('🔥 Критическая ошибка при запуске тестов:', error)
    logger.error('🔥 Critical error running tests:', error)
    process.exit(1)
  })
} 