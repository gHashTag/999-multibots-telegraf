import 'reflect-metadata'
import { logger } from '@/utils/logger'

// Ключи для метаданных
const TEST_SUITE_KEY = 'test:suite'
const TEST_METHOD_KEY = 'test:method'
const BEFORE_ALL_KEY = 'test:before:all'
const AFTER_ALL_KEY = 'test:after:all'
const BEFORE_EACH_KEY = 'test:before:each'
const AFTER_EACH_KEY = 'test:after:each'

// Тип для метаданных теста
export interface TestMetadata {
  name: string
  description?: string
  tags?: string[]
  timeout?: number
  skip?: boolean
  only?: boolean
  condition?: () => boolean | Promise<boolean>
}

// Тип для метаданных тестового набора
export interface TestSuiteMetadata {
  name: string
  category: string
  description?: string
  tags?: string[]
}

// Декоратор для класса тестового набора
export function TestSuite(metadata: TestSuiteMetadata) {
  return function (constructor: Function) {
    Reflect.defineMetadata(TEST_SUITE_KEY, metadata, constructor)
    logger.debug(
      `Зарегистрирован тестовый набор: ${metadata.name} (${metadata.category})`
    )
  }
}

// Получение метаданных тестового набора
export function getTestSuiteMetadata(
  target: any
): TestSuiteMetadata | undefined {
  return Reflect.getMetadata(TEST_SUITE_KEY, target)
}

// Декоратор для тестового метода
export function Test(metadata: TestMetadata) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const testMethods =
      Reflect.getMetadata(TEST_METHOD_KEY, target.constructor) || []
    testMethods.push({
      methodName: propertyKey,
      metadata,
    })
    Reflect.defineMetadata(TEST_METHOD_KEY, testMethods, target.constructor)

    // Сохраняем оригинальный метод
    const originalMethod = descriptor.value

    // Обертываем метод для добавления возможности логирования и измерения времени выполнения
    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now()
      logger.debug(`Запуск теста: ${metadata.name}`)

      try {
        // Проверяем условие запуска, если оно есть
        if (metadata.condition) {
          const shouldRun = await metadata.condition()
          if (!shouldRun) {
            logger.debug(`Тест пропущен по условию: ${metadata.name}`)
            return
          }
        }

        // Запускаем тест
        const result = await originalMethod.apply(this, args)
        const duration = Date.now() - startTime
        logger.debug(`Тест успешно завершен: ${metadata.name} (${duration}ms)`)
        return result
      } catch (error) {
        const duration = Date.now() - startTime
        logger.error(
          `Тест завершился с ошибкой: ${metadata.name} (${duration}ms)`,
          error
        )
        throw error
      }
    }

    return descriptor
  }
}

// Получение метаданных тестовых методов
export function getTestMethods(
  target: any
): Array<{ methodName: string; metadata: TestMetadata }> {
  return Reflect.getMetadata(TEST_METHOD_KEY, target) || []
}

// Декоратор для метода, запускаемого перед всеми тестами
export function BeforeAll() {
  return function (target: any, propertyKey: string) {
    Reflect.defineMetadata(BEFORE_ALL_KEY, propertyKey, target.constructor)
  }
}

// Получение метода BeforeAll
export function getBeforeAllMethod(target: any): string | undefined {
  return Reflect.getMetadata(BEFORE_ALL_KEY, target)
}

// Декоратор для метода, запускаемого после всех тестов
export function AfterAll() {
  return function (target: any, propertyKey: string) {
    Reflect.defineMetadata(AFTER_ALL_KEY, propertyKey, target.constructor)
  }
}

// Получение метода AfterAll
export function getAfterAllMethod(target: any): string | undefined {
  return Reflect.getMetadata(AFTER_ALL_KEY, target)
}

// Декоратор для метода, запускаемого перед каждым тестом
export function BeforeEach() {
  return function (target: any, propertyKey: string) {
    Reflect.defineMetadata(BEFORE_EACH_KEY, propertyKey, target.constructor)
  }
}

// Получение метода BeforeEach
export function getBeforeEachMethod(target: any): string | undefined {
  return Reflect.getMetadata(BEFORE_EACH_KEY, target)
}

// Декоратор для метода, запускаемого после каждого теста
export function AfterEach() {
  return function (target: any, propertyKey: string) {
    Reflect.defineMetadata(AFTER_EACH_KEY, propertyKey, target.constructor)
  }
}

// Получение метода AfterEach
export function getAfterEachMethod(target: any): string | undefined {
  return Reflect.getMetadata(AFTER_EACH_KEY, target)
}
