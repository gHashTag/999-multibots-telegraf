/**
 * Enhanced Testing Framework
 * Расширенный фреймворк для тестирования с дополнительными возможностями
 */

import assert, { Assert, AssertionError } from '../assert'
import mock, { Mock, MockFunction } from '../mock'
import snapshot, { Snapshot } from '../snapshot'
import { logger } from '@/utils/logger'
import { TestResult } from '../types'

/**
 * Класс расширенного тестового контекста
 * Предоставляет дополнительные возможности для тестов
 */
export class TestContext {
  // Ссылки на утилиты
  public assert = assert
  public mock = mock
  public snapshot = snapshot

  private testResults: TestResult[] = []
  private currentTestName: string = ''
  private timeouts: NodeJS.Timeout[] = []

  constructor() {}

  /**
   * Устанавливает имя текущего теста
   */
  setCurrentTest(name: string): void {
    this.currentTestName = name
  }

  /**
   * Добавляет результат теста
   */
  addResult(result: TestResult): void {
    this.testResults.push(result)
  }

  /**
   * Возвращает все результаты тестов
   */
  getResults(): TestResult[] {
    return [...this.testResults]
  }

  /**
   * Очищает все таймауты, установленные во время тестов
   */
  clearTimeouts(): void {
    this.timeouts.forEach(timeout => clearTimeout(timeout))
    this.timeouts = []
  }

  /**
   * Устанавливает таймаут с автоматической очисткой
   */
  setTimeout(
    callback: (...args: any[]) => void,
    ms: number,
    ...args: any[]
  ): NodeJS.Timeout {
    const timeout = setTimeout(callback, ms, ...args)
    this.timeouts.push(timeout)
    return timeout
  }

  /**
   * Создает промис, который разрешается через указанное время
   * @param ms Время задержки в миллисекундах
   */
  wait(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        resolve()
      }, ms)
      this.timeouts.push(timeout)
    })
  }

  /**
   * Выполняет функцию заданное количество раз
   * @param fn Выполняемая функция
   * @param count Количество вызовов
   */
  repeat<T>(fn: (index: number) => T, count: number): T[] {
    const results: T[] = []
    for (let i = 0; i < count; i++) {
      results.push(fn(i))
    }
    return results
  }

  /**
   * Создаёт объект с заполнителями для всех методов
   * @param objectName Имя объекта для логирования
   * @param methods Список методов для заполнения
   */
  createStub(
    objectName: string = 'stub',
    methods: string[] = []
  ): Record<string, MockFunction> {
    const stub: Record<string, MockFunction> = {}

    for (const method of methods) {
      stub[method] = this.mock.fn(`${objectName}.${method}`)
    }

    return stub
  }

  /**
   * Выполняет callback с перехватом исключений
   * @param callback Функция для выполнения
   * @param errorHandler Обработчик ошибок (по умолчанию ошибка логируется)
   */
  tryCatch<T>(
    callback: () => T,
    errorHandler?: (error: any) => T
  ): T | undefined {
    try {
      return callback()
    } catch (error: any) {
      if (errorHandler) {
        return errorHandler(error)
      } else {
        logger.error(`Error in test "${this.currentTestName}":`, error)
        return undefined
      }
    }
  }

  /**
   * Создаёт спай на функцию, который не изменяет её поведение, но отслеживает вызовы
   * @param obj Объект, содержащий функцию
   * @param methodName Имя функции
   */
  spy<T extends object, K extends keyof T>(
    obj: T,
    methodName: K
  ): MockFunction {
    const original = obj[methodName]

    if (typeof original !== 'function') {
      throw new Error(
        `Cannot spy on non-function property ${String(methodName)}`
      )
    }

    return this.mock.method(obj, methodName as string, {
      implementation: (...args: any[]) => {
        if (typeof original === 'function') {
          return (original as any).apply(obj, args)
        }
        return undefined
      },
    })
  }

  /**
   * Выполняет код в песочнице, откатывая все изменения после выполнения
   * @param testFn Тестовая функция
   */
  async sandbox<T>(testFn: () => Promise<T> | T): Promise<T> {
    // Сохраняем оригинальное состояние
    const originalConsole = { ...console } as Record<string, any>
    const originalProcessEnv = { ...process.env }
    const originalProcessExit = process.exit

    // Перехватываем process.exit
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code}) called in test sandbox`)
    }) as any

    try {
      // Выполняем тест
      return await testFn()
    } finally {
      // Восстанавливаем состояние
      Object.keys(console).forEach(key => {
        ;(console as Record<string, any>)[key] = originalConsole[key]
      })

      // Восстанавливаем process.env
      process.env = originalProcessEnv

      // Восстанавливаем process.exit
      process.exit = originalProcessExit

      // Восстанавливаем моки
      this.mock.restore()

      // Очищаем таймауты
      this.clearTimeouts()
    }
  }
}

// Создаем глобальный экземпляр контекста
const testContext = new TestContext()

// Экспортируем все модули
export {
  testContext,
  assert,
  Assert,
  AssertionError,
  mock,
  Mock,
  MockFunction,
  snapshot,
  Snapshot,
}

// Экспортируем функции-хелперы для удобства использования
export const expect = {
  /**
   * Проверяет, что значение истинно
   */
  toBeTrue: (value: any, message?: string) => Assert.isTrue(value, message),

  /**
   * Проверяет, что значение ложно
   */
  toBeFalse: (value: any, message?: string) => Assert.isFalse(value, message),

  /**
   * Проверяет равенство значений
   */
  toEqual: (actual: any, expected: any, message?: string) =>
    Assert.equal(actual, expected, message),

  /**
   * Проверяет неравенство значений
   */
  notToEqual: (actual: any, expected: any, message?: string) =>
    Assert.notEqual(actual, expected, message),

  /**
   * Проверяет, что значение не undefined
   */
  toBeDefined: (value: any, message?: string) =>
    Assert.isDefined(value, message),

  /**
   * Проверяет, что строка содержит подстроку
   */
  toContain: (str: string, substring: string, message?: string) =>
    Assert.contains(str, substring, message),

  /**
   * Проверяет, что массив содержит элемент
   */
  toInclude: <T>(array: T[], element: T, message?: string) =>
    Assert.includes(array, element, message),

  /**
   * Проверяет, что функция выбрасывает исключение
   */
  toThrow: (fn: Function, errorType?: any, message?: string) =>
    Assert.throws(fn, errorType, message),

  /**
   * Проверяет, что функция не выбрасывает исключение
   */
  notToThrow: (fn: Function, message?: string) =>
    Assert.doesNotThrow(fn, message),

  /**
   * Проверяет, что промис выполняется успешно
   */
  toResolve: async (promise: Promise<any>, message?: string) =>
    await Assert.resolves(promise, message),

  /**
   * Проверяет, что промис завершается с ошибкой
   */
  toReject: async (promise: Promise<any>, errorType?: any, message?: string) =>
    await Assert.rejects(promise, errorType, message),

  /**
   * Проверяет соответствие данных снапшоту
   */
  toMatchSnapshot: (name: string, data: any) =>
    snapshot.toMatchSnapshot(name, data),
}

export default testContext
