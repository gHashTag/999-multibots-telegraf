import fs from 'fs'
import path from 'path'
import { TEST_REGISTRY, TestCase, TestSuite, TestResult } from './types'
import { logger } from '@/utils/logger'

// Registry for functional tests found
interface FunctionalTestInfo {
  name: string
  category?: string
  testFn: () => Promise<TestResult>
  filePath: string
}
const FUNCTIONAL_TEST_REGISTRY: FunctionalTestInfo[] = []

/**
 * Класс для автоматического обнаружения тестов
 */
export class TestDiscovery {
  /**
   * Шаблоны для поиска тестовых файлов
   */
  private static readonly TEST_FILE_PATTERNS = [
    '.test.ts',
    '.spec.ts',
    'Test.ts',
    'Tests.ts',
  ]

  /**
   * Исключенные директории
   */
  private static readonly EXCLUDED_DIRS = ['node_modules', 'dist', '.git']

  /**
   * Загружает все тестовые файлы из указанной директории
   *
   * @param baseDir Базовая директория для поиска
   * @param recursive Искать в поддиректориях
   * @returns Массив путей к найденным тестовым файлам
   */
  static async discoverTestFiles(
    baseDir: string,
    recursive: boolean = true
  ): Promise<string[]> {
    logger.info(`🔍 Discovering test files in ${baseDir}`)

    if (!fs.existsSync(baseDir)) {
      logger.error(`❌ Directory ${baseDir} does not exist`)
      return []
    }

    const files: string[] = []
    await this.scanDirectory(baseDir, files, recursive)

    logger.info(`✅ Found ${files.length} test files`)
    return files
  }

  /**
   * Рекурсивно сканирует директорию в поиске тестовых файлов
   */
  private static async scanDirectory(
    dir: string,
    files: string[],
    recursive: boolean
  ): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (recursive && !this.EXCLUDED_DIRS.includes(entry.name)) {
          await this.scanDirectory(fullPath, files, recursive)
        }
      } else if (entry.isFile() && this.isTestFile(entry.name)) {
        files.push(fullPath)
      }
    }
  }

  /**
   * Проверяет, является ли файл тестовым
   */
  private static isTestFile(fileName: string): boolean {
    return this.TEST_FILE_PATTERNS.some(pattern => fileName.endsWith(pattern))
  }

  /**
   * Загружает все тестовые файлы и регистрирует тесты (декораторы + функциональные)
   *
   * @param files Массив путей к тестовым файлам
   */
  static async loadTestFiles(files: string[]): Promise<void> {
    logger.info(`📂 Loading ${files.length} test files and discovering tests`)
    FUNCTIONAL_TEST_REGISTRY.length = 0 // Clear previous functional tests

    for (const file of files) {
      try {
        logger.debug(`🔄 Loading test file: ${file}`)
        const module = await import(file)

        // Look for functional tests in the loaded module
        for (const exportName in module) {
          const exportedItem = module[exportName]
          // Check if it's a function and has a .meta property or follows test* naming
          if (
            typeof exportedItem === 'function' &&
            (exportName.startsWith('test') ||
              (exportedItem.meta && typeof exportedItem.meta === 'object'))
          ) {
            // Basic check to avoid registering the runner function itself
            if (exportName.startsWith('run') && exportName.endsWith('Tests')) {
              continue
            }

            const meta = exportedItem.meta || {}
            const testInfo: FunctionalTestInfo = {
              name: exportName, // Use function name as test name
              category: meta.category,
              testFn: exportedItem as () => Promise<TestResult>,
              filePath: file,
            }
            FUNCTIONAL_TEST_REGISTRY.push(testInfo)
            logger.debug(
              `  -> Discovered functional test: ${testInfo.name} in ${path.basename(file)}`
            )
          }
        }
      } catch (error) {
        logger.error(`❌ Error loading test file ${file}:`, error)
      }
    }
    logger.info(
      `✅ Found ${FUNCTIONAL_TEST_REGISTRY.length} functional tests during load.`
    )
  }

  /**
   * Преобразует найденные тесты (декораторы) в формат для TestRunner
   */
  static collectDecoratorTestSuites(): TestSuite[] {
    const suites: TestSuite[] = []
    logger.info(
      `Collecting ${TEST_REGISTRY.suites.size} suites from decorator registry.`
    )

    // Перебираем все зарегистрированные наборы тестов (декораторы)
    for (const [target, suiteMetadata] of TEST_REGISTRY.suites.entries()) {
      const tests = TEST_REGISTRY.tests.get(target) || []

      if (tests.length === 0) {
        logger.warn(`⚠️ Test suite ${suiteMetadata.name} has no tests`)
        continue
      }

      // Получаем хуки для набора тестов
      const beforeAllHooks = TEST_REGISTRY.beforeAll.get(target) || []
      const afterAllHooks = TEST_REGISTRY.afterAll.get(target) || []
      const beforeEachHooks = TEST_REGISTRY.beforeEach.get(target) || []
      const afterEachHooks = TEST_REGISTRY.afterEach.get(target) || []

      // Создаем экземпляр класса с тестами
      const instance = new target()

      // Создаем набор тестов
      const suite: TestSuite = {
        name: suiteMetadata.name,
        category: suiteMetadata.category,
        description: suiteMetadata.description,
        tests: [],

        // Добавляем хуки
        beforeAll:
          beforeAllHooks.length > 0
            ? async () => {
                for (const hook of beforeAllHooks) {
                  await instance[hook]()
                }
              }
            : undefined,

        afterAll:
          afterAllHooks.length > 0
            ? async () => {
                for (const hook of afterAllHooks) {
                  await instance[hook]()
                }
              }
            : undefined,

        beforeEach:
          beforeEachHooks.length > 0
            ? async () => {
                for (const hook of beforeEachHooks) {
                  await instance[hook]()
                }
              }
            : undefined,

        afterEach:
          afterEachHooks.length > 0
            ? async () => {
                for (const hook of afterEachHooks) {
                  await instance[hook]()
                }
              }
            : undefined,
      }

      // Добавляем тесты в набор
      for (const testMetadata of tests) {
        const testCase: TestCase = {
          name: testMetadata.name,
          category: testMetadata.category || suiteMetadata.category,
          description: testMetadata.description,
          tags: testMetadata.tags,
          timeout: testMetadata.timeout,
          skip: testMetadata.skip,
          only: testMetadata.only,
          test: async () => {
            // Запускаем beforeEach хуки
            if (suite.beforeEach) {
              await suite.beforeEach()
            }

            try {
              // Выполняем тест
              const result = await instance[testMetadata.propertyKey]()
              return result
            } finally {
              // Запускаем afterEach хуки
              if (suite.afterEach) {
                await suite.afterEach()
              }
            }
          },
        }

        suite.tests.push(testCase)
      }

      suites.push(suite)
    }
    logger.info(
      `Collected ${suites.length} suites with ${suites.reduce((sum, suite) => sum + suite.tests.length, 0)} decorator tests.`
    )
    return suites
  }

  /**
   * Преобразует найденные функциональные тесты в формат для TestRunner
   */
  static collectFunctionalTestSuites(): TestSuite[] {
    logger.info(
      `Collecting ${FUNCTIONAL_TEST_REGISTRY.length} functional tests.`
    )
    const suitesMap = new Map<string, TestSuite>()

    for (const testInfo of FUNCTIONAL_TEST_REGISTRY) {
      // Group by file path for now, can be refined (e.g., by category)
      const suiteKey = testInfo.filePath // Use file path as suite key
      const suiteName = path.relative(process.cwd(), testInfo.filePath) // Use relative path for suite name

      if (!suitesMap.has(suiteKey)) {
        suitesMap.set(suiteKey, {
          name: suiteName,
          category: testInfo.category || 'functional', // Use test category or default
          tests: [],
        })
      }

      const suite = suitesMap.get(suiteKey)!
      const testCase: TestCase = {
        name: testInfo.name,
        category: testInfo.category || suite.category, // Inherit category
        test: async () => {
          // NOTE: Functional tests currently don't have before/after hooks via this discovery
          // The setup is assumed to be called within the test function itself
          const result = await testInfo.testFn()
          // We might need to adapt the TestResult format or how TestRunner handles it
          return result // Assuming TestResult is compatible enough
        },
        // Add other properties like timeout, skip, only if available in meta
        // timeout: testInfo.meta?.timeout,
        // skip: testInfo.meta?.skip,
        // only: testInfo.meta?.only,
      }
      suite.tests.push(testCase)
    }
    const functionalSuites = Array.from(suitesMap.values())
    logger.info(
      `Collected ${functionalSuites.length} suites with ${functionalSuites.reduce((sum, suite) => sum + suite.tests.length, 0)} functional tests.`
    )
    return functionalSuites
  }

  /**
   * Инициализирует все тестовые наборы из указанной директории
   *
   * @param baseDir Базовая директория для поиска
   * @param recursive Искать в поддиректориях
   * @returns Массив найденных тестовых наборов (декораторы + функциональные)
   */
  static async initializeTests(
    baseDir: string,
    recursive: boolean = true
  ): Promise<TestSuite[]> {
    // Находим тестовые файлы
    const files = await this.discoverTestFiles(baseDir, recursive)

    // Загружаем все тестовые файлы и регистрируем оба типа тестов
    await this.loadTestFiles(files)

    // Собираем тесты из обоих источников
    const decoratorSuites = this.collectDecoratorTestSuites()
    const functionalSuites = this.collectFunctionalTestSuites()

    const allSuites = [...decoratorSuites, ...functionalSuites]

    logger.info(
      `✅ Initialized ${allSuites.length} total test suites with ${allSuites.reduce((sum, suite) => sum + suite.tests.length, 0)} total tests`
    )

    return allSuites
  }
}
