import { TestResult } from './types'
import { logger } from '@/utils/logger'

interface TestCase {
  name: string
  input: any
}

interface ExpectedCalls {
  inngest?: Array<{
    name: string
    data: any
  }>
  supabase?: Array<{
    function: string
    args: any[]
  }>
}

interface RunTestCaseParams {
  testCase: TestCase
  handler: string
  expectedCalls?: ExpectedCalls
  expectedMessages?: Array<(message: string) => boolean>
  expectedLogs?: Array<{
    level: string
    message: string | ((message: string) => boolean)
  }>
}

interface TestOptions {
  only?: string[]
  skip?: string[]
  verbose?: boolean
  noExit?: boolean
}

interface Test {
  name: string
  category: string
  description: string
  run: () => Promise<any>
}

export class TestRunner {
  private handlers: Map<string, Function> = new Map()
  private tests: Test[] = []
  private options: TestOptions

  constructor(options: TestOptions = {}) {
    this.options = {
      only: [],
      skip: [],
      verbose: false,
      noExit: false,
      ...options
    }
  }

  async init() {
    logger.info('🚀 Initializing test runner')
    // Здесь можно добавить инициализацию, например подключение к базе данных
  }

  async cleanup() {
    logger.info('🧹 Cleaning up test runner')
    // Здесь можно добавить очистку ресурсов
  }

  registerHandler(name: string, handler: Function) {
    this.handlers.set(name, handler)
  }

  addTests(testsToAdd: Test[]) {
    this.tests.push(...testsToAdd)
  }

  getTestCount(): number {
    return this.tests.length
  }

  /**
   * Запускает тесты параллельно с указанным уровнем параллелизма
   */
  async runTestsInParallel(concurrency = 4): Promise<TestResult[]> {
    const results: TestResult[] = []
    const { only, skip, verbose } = this.options
    
    logger.info(`🚀 Running ${this.tests.length} tests with concurrency ${concurrency}`)
    
    // Фильтруем тесты, которые нужно запустить
    const testsToRun = this.tests.filter(test => {
      if (only && only.length > 0) {
        return only.some(pattern => 
          test.name.includes(pattern) || 
          test.category.includes(pattern)
        )
      }
      
      if (skip && skip.length > 0) {
        return !skip.some(pattern => 
          test.name.includes(pattern) || 
          test.category.includes(pattern)
        )
      }
      
      return true
    })
    
    logger.info(`🧪 Selected ${testsToRun.length} tests to run`)
    
    // Группируем тесты по категориям для удобства отчетности
    const groupedTests = this.groupTestsByCategory(testsToRun)
    
    // Создаем плоский список тестов для выполнения
    const allTests = Object.values(groupedTests).flat()
    
    // Разбиваем тесты на группы для параллельного выполнения
    const chunks = this.chunkTests(allTests, concurrency)
    
    // Запускаем каждую группу последовательно, но тесты внутри группы - параллельно
    for (const [chunkIndex, chunk] of chunks.entries()) {
      logger.info(`⏳ Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} tests)`)
      
      // Запускаем параллельно тесты в текущей группе
      const chunkResults = await Promise.all(
        chunk.map(async test => {
          let startTime = Date.now()
          
          try {
            if (verbose) {
              logger.info({
                message: `📋 Starting test: ${test.name}`,
                category: test.category,
                description: test.description
              })
            } else {
              logger.info(`🔍 Running test: ${test.name}`)
            }
            
            await test.run()
            
            const duration = Date.now() - startTime
            const result: TestResult = {
              name: test.name,
              testName: test.name,
              passed: true,
              success: true,
              duration,
              message: '✅ Test passed successfully',
              details: {
                category: test.category,
                description: test.description
              }
            }
            
            if (verbose) {
              logger.info(`✅ Test ${test.name} completed in ${duration}ms`)
            }
            
            return result
          } catch (error) {
            const duration = Date.now() - startTime
            const errorMessage = error instanceof Error ? error.message : String(error)
            
            logger.error(`❌ Test ${test.name} failed: ${errorMessage}`)
            
            return {
              name: test.name,
              testName: test.name,
              passed: false,
              success: false,
              error: errorMessage,
              duration,
              message: `❌ Test failed: ${errorMessage}`,
              details: {
                category: test.category,
                description: test.description,
                error: errorMessage
              }
            }
          }
        })
      )
      
      results.push(...chunkResults)
    }
    
    // Выводим итоги
    this.printResults(results)
    
    return results
  }

  /**
   * Группирует тесты по категориям
   */
  private groupTestsByCategory(tests: Test[]): Record<string, Test[]> {
    const grouped: Record<string, Test[]> = {}
    
    for (const test of tests) {
      if (!grouped[test.category]) {
        grouped[test.category] = []
      }
      grouped[test.category].push(test)
    }
    
    return grouped
  }
  
  /**
   * Разбивает массив тестов на группы для параллельного запуска
   */
  private chunkTests(tests: Test[], size: number): Test[][] {
    const chunks: Test[][] = []
    for (let i = 0; i < tests.length; i += size) {
      chunks.push(tests.slice(i, i + size))
    }
    return chunks
  }
  
  /**
   * Выводит результаты тестирования в консоль
   */
  private printResults(results: TestResult[]): void {
    const successful = results.filter(r => r.passed).length
    const failed = results.length - successful
    
    // Группируем ошибки по категориям для удобного просмотра
    const failedByCategory: Record<string, TestResult[]> = {}
    
    for (const result of results.filter(r => !r.passed)) {
      const category = result.details?.category || 'Unknown'
      if (!failedByCategory[category]) {
        failedByCategory[category] = []
      }
      failedByCategory[category].push(result)
    }
    
    logger.info(`
📊 Tests completed:
  ✅ Passed: ${successful}
  ❌ Failed: ${failed}
  🕒 Total: ${results.length}
    `)
    
    // Выводим детали ошибок, если они есть
    if (failed > 0) {
      logger.error('❌ Failed tests details:')
      
      for (const [category, tests] of Object.entries(failedByCategory)) {
        logger.error(`  Category: ${category} (${tests.length} failed)`)
        
        for (const test of tests) {
          logger.error(`    - ${test.name}: ${test.error}`)
        }
      }
    }
  }

  async runTests(): Promise<TestResult[]> {
    const results: TestResult[] = []
    const { only, skip, verbose } = this.options
    
    logger.info(`🚀 Running ${this.tests.length} tests`)
    
    // Фильтруем тесты, которые нужно запустить
    const testsToRun = this.tests.filter(test => {
      if (only && only.length > 0) {
        return only.some(pattern => 
          test.name.includes(pattern) || 
          test.category.includes(pattern)
        )
      }
      
      if (skip && skip.length > 0) {
        return !skip.some(pattern => 
          test.name.includes(pattern) || 
          test.category.includes(pattern)
        )
      }
      
      return true
    })
    
    logger.info(`🧪 Selected ${testsToRun.length} tests to run`)
    
    // Запускаем тесты
    for (const test of testsToRun) {
      let startTime = Date.now()
      
      try {
        if (verbose) {
          logger.info(`📋 Test: ${test.name}`)
          logger.info(`📝 Category: ${test.category}`)
          logger.info(`ℹ️ Description: ${test.description}`)
        } else {
          logger.info(`🔍 Running test: ${test.name}`)
        }
        
        await test.run()
        
        const duration = Date.now() - startTime
        const result: TestResult = {
          name: test.name,
          testName: test.name,
          passed: true,
          success: true,
          duration,
          message: '✅ Test passed successfully',
          details: {
            category: test.category,
            description: test.description
          }
        }
        
        results.push(result)
        
        if (verbose) {
          logger.info(`✅ Test ${test.name} completed in ${duration}ms`)
        }
      } catch (error) {
        const duration = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        logger.error(`❌ Test ${test.name} failed: ${errorMessage}`)
        
        const result: TestResult = {
          name: test.name,
          testName: test.name,
          passed: false,
          success: false,
          error: errorMessage,
          duration,
          message: `❌ Test failed: ${errorMessage}`,
          details: {
            category: test.category,
            description: test.description,
            error: errorMessage
          }
        }
        
        results.push(result)
      }
    }
    
    // Выводим итоги
    const successful = results.filter(r => r.passed).length
    const failed = results.length - successful
    
    logger.info(`
📊 Tests completed:
  ✅ Passed: ${successful}
  ❌ Failed: ${failed}
  🕒 Total: ${results.length}
    `)
    
    // Возвращаем результаты
    return results
  }

  async runTestCase({
    testCase,
    handler,
    expectedCalls = {},
    expectedMessages = [],
    expectedLogs = [],
  }: RunTestCaseParams): Promise<TestResult> {
    const startTime = Date.now()

    try {
      logger.info(`🎯 Running test case: ${testCase.name}`)

      const handlerFn = this.handlers.get(handler)
      if (!handlerFn) {
        throw new Error(`Handler ${handler} not found`)
      }

      // Выполняем обработчик
      await handlerFn(testCase.input)

      // Проверяем ожидаемые вызовы Inngest
      if (expectedCalls.inngest) {
        // TODO: Добавить проверку вызовов Inngest
      }

      // Проверяем ожидаемые вызовы Supabase
      if (expectedCalls.supabase) {
        // TODO: Добавить проверку вызовов Supabase
      }

      // Проверяем ожидаемые сообщения
      // TODO: Добавить проверку сообщений

      // Проверяем ожидаемые логи
      // TODO: Добавить проверку логов

      const duration = Date.now() - startTime

      return {
        name: testCase.name,
        testName: testCase.name,
        passed: true,
        success: true,
        duration,
        message: '✅ Test passed successfully',
        details: {
          handler,
          expectedCalls,
          expectedMessages,
          expectedLogs,
        },
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      logger.error(`❌ Test case failed: ${testCase.name}`, {
        error: errorMessage,
      })

      return {
        name: testCase.name,
        testName: testCase.name,
        passed: false,
        success: false,
        error: errorMessage,
        duration,
        message: `❌ Test failed: ${errorMessage}`,
        details: {
          handler,
          expectedCalls,
          expectedMessages,
          expectedLogs,
          error: errorMessage,
        },
      }
    }
  }

  /**
   * Устанавливает опции для запуска тестов
   */
  setOptions(options: Partial<TestOptions>): void {
    this.options = {
      ...this.options,
      ...options
    }
  }
  
  /**
   * Включает подробный режим вывода
   */
  setVerbose(verbose: boolean): void {
    this.options.verbose = verbose
  }
  
  /**
   * Устанавливает фильтр "только" для тестов
   */
  setOnly(only: string[]): void {
    this.options.only = only
  }
  
  /**
   * Устанавливает фильтр "пропустить" для тестов
   */
  setSkip(skip: string[]): void {
    this.options.skip = skip
  }
  
  /**
   * Получает текущие опции запуска тестов
   */
  getOptions(): TestOptions {
    return { ...this.options }
  }
}
