/**
 * Результат выполнения теста
 */
export interface TestResult {
  /** Уникальное имя теста */
  name: string
  /** Название теста (оригинальная система) */
  testName?: string
  /** Признак успешного прохождения теста */
  success: boolean
  /** Признак успешного прохождения (альтернативное имя) */
  passed?: boolean
  /** Сообщение о результате теста */
  message: string
  /** Детали выполнения теста */
  details?: any
  /** Ошибка, если тест не прошел */
  error?: string | Error
  /** Время выполнения теста в миллисекундах */
  duration?: number
  /** Категория теста */
  category?: string
  /** Метки для группировки и фильтрации */
  tags?: string[]
}

/**
 * Категории тестов
 */
export enum TestCategory {
  SCENE = 'scene',
  SERVICE = 'service',
  API = 'api',
  INTEGRATION = 'integration',
  UNIT = 'unit',
  E2E = 'e2e',
}

/**
 * Конфигурация для тестирования
 */
export interface TestConfig {
  /** Базовый URL API */
  apiUrl: string
  /** Токен доступа */
  token?: string
  /** Таймаут запросов в миллисекундах */
  timeout: number
  /** Включить подробный вывод */
  verbose: boolean
}

/**
 * Функция выполнения теста
 */
export type TestFunction = () => Promise<any>

/**
 * Параметры теста
 */
export interface TestCase {
  name: string
  category?: string
  description?: string
  tags?: string[]
  test: TestFunction
  timeout?: number
  skip?: boolean
  only?: boolean
}

/**
 * Набор тестов
 */
export interface TestSuite {
  name: string
  category?: string
  description?: string
  tests: TestCase[]
  beforeAll?: TestFunction
  afterAll?: TestFunction
  beforeEach?: TestFunction
  afterEach?: TestFunction
}

/**
 * Опции запуска тестов
 */
export interface RunnerOptions {
  verbose?: boolean
  only?: string[]
  skip?: string[]
  category?: string | string[]
  tags?: string[]
  timeout?: number
  parallel?: number
  outputFormat?: 'text' | 'json' | 'html'
  outputFile?: string
  help?: boolean
  discover?: boolean
  testDir?: string
}

/**
 * Метаданные для регистрации теста
 */
export interface TestMetadata {
  name: string
  category?: string
  description?: string
  tags?: string[]
  timeout?: number
  skip?: boolean
  only?: boolean
  target: Object
  propertyKey: string
}

/**
 * Метаданные для регистрации тестового набора
 */
export interface TestSuiteMetadata {
  name: string
  category?: string
  description?: string
  target: any
}

/**
 * Глобальное хранилище метаданных тестов
 */
export const TEST_REGISTRY: {
  suites: Map<any, TestSuiteMetadata>
  tests: Map<any, TestMetadata[]>
  beforeAll: Map<any, string[]>
  afterAll: Map<any, string[]>
  beforeEach: Map<any, string[]>
  afterEach: Map<any, string[]>
} = {
  suites: new Map(),
  tests: new Map(),
  beforeAll: new Map(),
  afterAll: new Map(),
  beforeEach: new Map(),
  afterEach: new Map(),
}

/**
 * Декоратор для создания тестового набора
 */
export function TestSuite(
  name: string,
  options: { category?: string; description?: string } = {}
) {
  return function (target: any) {
    TEST_REGISTRY.suites.set(target, {
      name,
      category: options.category,
      description: options.description,
      target,
    })

    if (!TEST_REGISTRY.tests.has(target)) {
      TEST_REGISTRY.tests.set(target, [])
    }
  }
}

/**
 * Декоратор для создания теста
 */
export function Test(
  name: string,
  options: {
    category?: string
    description?: string
    tags?: string[]
    timeout?: number
    skip?: boolean
    only?: boolean
  } = {}
) {
  return function (target: Object, propertyKey: string): void {
    const constructor = target.constructor

    if (!TEST_REGISTRY.tests.has(constructor)) {
      TEST_REGISTRY.tests.set(constructor, [])
    }

    TEST_REGISTRY.tests.get(constructor)!.push({
      name,
      category: options.category,
      description: options.description,
      tags: options.tags,
      timeout: options.timeout,
      skip: options.skip,
      only: options.only,
      target,
      propertyKey,
    })
  }
}

/**
 * Декоратор для функции, выполняемой перед набором тестов
 */
export function BeforeAll() {
  return function (target: Object, propertyKey: string): void {
    const constructor = target.constructor

    if (!TEST_REGISTRY.beforeAll.has(constructor)) {
      TEST_REGISTRY.beforeAll.set(constructor, [])
    }

    TEST_REGISTRY.beforeAll.get(constructor)!.push(propertyKey)
  }
}

/**
 * Декоратор для функции, выполняемой после набора тестов
 */
export function AfterAll() {
  return function (target: Object, propertyKey: string): void {
    const constructor = target.constructor

    if (!TEST_REGISTRY.afterAll.has(constructor)) {
      TEST_REGISTRY.afterAll.set(constructor, [])
    }

    TEST_REGISTRY.afterAll.get(constructor)!.push(propertyKey)
  }
}

/**
 * Декоратор для функции, выполняемой перед каждым тестом
 */
export function BeforeEach() {
  return function (target: Object, propertyKey: string): void {
    const constructor = target.constructor

    if (!TEST_REGISTRY.beforeEach.has(constructor)) {
      TEST_REGISTRY.beforeEach.set(constructor, [])
    }

    TEST_REGISTRY.beforeEach.get(constructor)!.push(propertyKey)
  }
}

/**
 * Декоратор для функции, выполняемой после каждого теста
 */
export function AfterEach() {
  return function (target: Object, propertyKey: string): void {
    const constructor = target.constructor

    if (!TEST_REGISTRY.afterEach.has(constructor)) {
      TEST_REGISTRY.afterEach.set(constructor, [])
    }

    TEST_REGISTRY.afterEach.get(constructor)!.push(propertyKey)
  }
}
