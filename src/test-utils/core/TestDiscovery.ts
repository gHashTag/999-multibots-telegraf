import fs from 'fs';
import path from 'path';
import { TEST_REGISTRY, TestCase, TestSuite } from './types';
import { logger } from '@/utils/logger';

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
    'Tests.ts'
  ];

  /**
   * Исключенные директории
   */
  private static readonly EXCLUDED_DIRS = [
    'node_modules',
    'dist',
    '.git'
  ];

  /**
   * Загружает все тестовые файлы из указанной директории
   * 
   * @param baseDir Базовая директория для поиска
   * @param recursive Искать в поддиректориях
   * @returns Массив путей к найденным тестовым файлам
   */
  static async discoverTestFiles(baseDir: string, recursive: boolean = true): Promise<string[]> {
    logger.info(`🔍 Discovering test files in ${baseDir}`);

    if (!fs.existsSync(baseDir)) {
      logger.error(`❌ Directory ${baseDir} does not exist`);
      return [];
    }

    const files: string[] = [];
    await this.scanDirectory(baseDir, files, recursive);
    
    logger.info(`✅ Found ${files.length} test files`);
    return files;
  }

  /**
   * Рекурсивно сканирует директорию в поиске тестовых файлов
   */
  private static async scanDirectory(dir: string, files: string[], recursive: boolean): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (recursive && !this.EXCLUDED_DIRS.includes(entry.name)) {
          await this.scanDirectory(fullPath, files, recursive);
        }
      } else if (entry.isFile() && this.isTestFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  /**
   * Проверяет, является ли файл тестовым
   */
  private static isTestFile(fileName: string): boolean {
    return this.TEST_FILE_PATTERNS.some(pattern => fileName.endsWith(pattern));
  }

  /**
   * Загружает все тестовые файлы
   * 
   * @param files Массив путей к тестовым файлам
   */
  static async loadTestFiles(files: string[]): Promise<void> {
    logger.info(`📂 Loading ${files.length} test files`);

    for (const file of files) {
      try {
        logger.debug(`🔄 Loading test file: ${file}`);
        await import(file);
      } catch (error) {
        logger.error(`❌ Error loading test file ${file}:`, error);
      }
    }
  }

  /**
   * Преобразует найденные тесты в формат для TestRunner
   */
  static collectTestSuites(): TestSuite[] {
    const suites: TestSuite[] = [];

    // Перебираем все зарегистрированные наборы тестов
    for (const [target, suiteMetadata] of TEST_REGISTRY.suites.entries()) {
      const tests = TEST_REGISTRY.tests.get(target) || [];
      
      if (tests.length === 0) {
        logger.warn(`⚠️ Test suite ${suiteMetadata.name} has no tests`);
        continue;
      }

      // Получаем хуки для набора тестов
      const beforeAllHooks = TEST_REGISTRY.beforeAll.get(target) || [];
      const afterAllHooks = TEST_REGISTRY.afterAll.get(target) || [];
      const beforeEachHooks = TEST_REGISTRY.beforeEach.get(target) || [];
      const afterEachHooks = TEST_REGISTRY.afterEach.get(target) || [];

      // Создаем экземпляр класса с тестами
      const instance = new target();

      // Создаем набор тестов
      const suite: TestSuite = {
        name: suiteMetadata.name,
        category: suiteMetadata.category,
        description: suiteMetadata.description,
        tests: [],
        
        // Добавляем хуки
        beforeAll: beforeAllHooks.length > 0 
          ? async () => {
              for (const hook of beforeAllHooks) {
                await instance[hook]();
              }
            }
          : undefined,
        
        afterAll: afterAllHooks.length > 0
          ? async () => {
              for (const hook of afterAllHooks) {
                await instance[hook]();
              }
            }
          : undefined,
        
        beforeEach: beforeEachHooks.length > 0
          ? async () => {
              for (const hook of beforeEachHooks) {
                await instance[hook]();
              }
            }
          : undefined,
        
        afterEach: afterEachHooks.length > 0
          ? async () => {
              for (const hook of afterEachHooks) {
                await instance[hook]();
              }
            }
          : undefined
      };

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
              await suite.beforeEach();
            }

            try {
              // Выполняем тест
              const result = await instance[testMetadata.propertyKey]();
              return result;
            } finally {
              // Запускаем afterEach хуки
              if (suite.afterEach) {
                await suite.afterEach();
              }
            }
          }
        };

        suite.tests.push(testCase);
      }

      suites.push(suite);
    }

    return suites;
  }

  /**
   * Инициализирует все тестовые наборы из указанной директории
   * 
   * @param baseDir Базовая директория для поиска
   * @param recursive Искать в поддиректориях
   * @returns Массив найденных тестовых наборов
   */
  static async initializeTests(baseDir: string, recursive: boolean = true): Promise<TestSuite[]> {
    // Находим тестовые файлы
    const files = await this.discoverTestFiles(baseDir, recursive);
    
    // Загружаем все тестовые файлы
    await this.loadTestFiles(files);
    
    // Преобразуем найденные тесты в наборы
    const suites = this.collectTestSuites();
    
    logger.info(`✅ Initialized ${suites.length} test suites with ${suites.reduce((sum, suite) => sum + suite.tests.length, 0)} tests`);
    
    return suites;
  }
} 