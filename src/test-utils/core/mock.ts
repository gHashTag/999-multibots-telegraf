/**
 * Функциональный модуль для создания моков и заглушек в тестах
 */
import { deepEqual, formatValue } from '@/test-utils/core/utils'

/**
 * Базовый тип для мок-функции
 */
export interface MockFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>
  mockResolvedValue(value: Awaited<ReturnType<T>>): void
  mockRejectedValue(error: Error): void
  mockReturnValue(value: ReturnType<T>): void
  mockImplementation(fn: T): void
  mockClear(): void
  getMockCalls(): Parameters<T>[]
}

/**
 * Интерфейс для API мока
 */
export interface MockAPI<T extends (...args: any[]) => any> {
  mockImplementation: (impl: T) => MockAPI<T>
  mockClear: () => void
  mock: {
    calls: Array<Parameters<T>>
  }
}

/**
 * Тип для мок-объекта
 */
export type MockObject<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? MockFunction<T[K]>
    : T[K] extends object
    ? MockObject<T[K]>
    : T[K];
};

/**
 * Тип для мокированной функции
 */
export type MockedFunction<T extends (...args: any[]) => any> = T & {
  mock: {
    calls: Parameters<T>[]
    results: Array<{ type: 'return' | 'throw'; value: any }>
    instances: any[]
    lastCall: Parameters<T> | undefined
    clear: () => void
    reset: () => void
  }
  mockReturnValue: (value: ReturnType<T>) => MockedFunction<T>
  mockReturnValueOnce: (value: ReturnType<T>) => MockedFunction<T>
  mockResolvedValue: (value: Awaited<ReturnType<T>>) => MockedFunction<T>
  mockResolvedValueOnce: (value: Awaited<ReturnType<T>>) => MockedFunction<T>
  mockRejectedValue: (error: any) => MockedFunction<T>
  mockRejectedValueOnce: (error: any) => MockedFunction<T>
  mockImplementation: (fn: T) => MockedFunction<T>
  mockImplementationOnce: (fn: T) => MockedFunction<T>
  mockClear: () => MockedFunction<T>
  mockReset: () => MockedFunction<T>
}

export type StubObject<T extends object> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? MockedFunction<T[K]>
    : T[K] extends object
      ? StubObject<T[K]>
      : T[K]
}

export type MockedObject<T extends object> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? MockedFunction<T[K]>
    : T[K] extends object
      ? MockedObject<T[K]>
      : T[K]
}

/**
 * Создает типизированный мок для функции
 */
type PromisedType<T> = T extends Promise<infer U> ? U : never

/**
 * Опции для создания мока
 */
export interface MockOptions<T extends (...args: any[]) => any> {
  name?: string
  defaultValue?: ReturnType<T>
  implementation?: T
}

/**
 * Основная функция создания мока
 */
export function create<T extends (...args: any[]) => any>(options?: {
  name?: string
  implementation?: T
  defaultValue?: ReturnType<T>
}): MockedFunction<T> {
  const { implementation, defaultValue } = options || {}
  const state = {
    calls: [] as Parameters<T>[],
    results: [] as Array<{ type: 'return' | 'throw'; value: any }>,
    instances: [] as any[],
    implementations: [implementation] as (T | undefined)[],
    returnValues: [] as ReturnType<T>[],
    rejectionValues: [] as any[],
  }

  // Функция очистки состояния вызовов
  const clear = (): void => {
    state.calls = []
    state.results = []
    state.instances = []
  }

  // Функция полного сброса состояния
  const reset = (): void => {
    clear()
    state.implementations = [implementation]
    state.returnValues = []
    state.rejectionValues = []
  }

  // Основная мок-функция
  const mockFn = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    const thisArg = this === undefined || this === global ? null : this
    if (thisArg !== null) {
      state.instances.push(thisArg)
    }
    // Сохраняем параметры вызова
    state.calls.push(args as Parameters<T>)
    try {
      // Проверяем реализацию для одного вызова
      const onceImplementation =
        state.implementations.length > 1 ? state.implementations.shift() : null
      const currentImplementation =
        onceImplementation || state.implementations[0]

      // Проверяем значение возврата для одного вызова
      const returnValueOnce =
        state.returnValues.length > 0 ? state.returnValues.shift() : undefined
      const rejectValueOnce =
        state.rejectionValues.length > 0
          ? state.rejectionValues.shift()
          : undefined

      let result: any

      if (rejectValueOnce !== undefined) {
        result = Promise.reject(rejectValueOnce)
      } else if (returnValueOnce !== undefined) {
        result = returnValueOnce
      } else if (currentImplementation) {
        result = currentImplementation.apply(thisArg, args)
      } else {
        result = defaultValue
      }

      state.results.push({ type: 'return', value: result })
      return result
    } catch (error) {
      state.results.push({ type: 'throw', value: error })
      throw error
    }
  } as MockedFunction<T>

  mockFn.mock = {
    calls: state.calls,
    results: state.results,
    instances: state.instances,
    get lastCall(): Parameters<T> | undefined {
      return state.calls.length > 0
        ? state.calls[state.calls.length - 1]
        : undefined
    },
    clear,
    reset,
  }

  // Методы для установки поведения мока
  mockFn.mockReturnValue = function <R>(value: R): MockedFunction<T> {
    state.implementations = [
      function () {
        return value
      } as any,
    ]
    return mockFn
  }

  mockFn.mockReturnValueOnce = (value: ReturnType<T>): MockedFunction<T> => {
    state.returnValues.push(value)
    return mockFn
  }

  mockFn.mockResolvedValue = function <R>(value: R): MockedFunction<T> {
    state.implementations = [
      function () {
        return Promise.resolve(value)
      } as any,
    ]
    return mockFn
  }

  mockFn.mockResolvedValueOnce = (value: Awaited<ReturnType<T>>): MockedFunction<T> => {
    return mockFn.mockReturnValueOnce(Promise.resolve(value) as ReturnType<T>)
  }

  mockFn.mockRejectedValue = function <E>(error: E): MockedFunction<T> {
    state.implementations = [
      function () {
        return Promise.reject(error)
      } as any,
    ]
    return mockFn
  }

  mockFn.mockRejectedValueOnce = (error: any): MockedFunction<T> => {
    state.rejectionValues.push(error)
    return mockFn
  }

  mockFn.mockImplementation = (fn: T): MockedFunction<T> => {
    state.implementations = [fn]
    return mockFn
  }

  mockFn.mockImplementationOnce = (fn: T): MockedFunction<T> => {
    state.implementations.push(fn)
    return mockFn
  }

  mockFn.mockClear = (): MockedFunction<T> => {
    clear()
    return mockFn
  }

  mockFn.mockReset = (): MockedFunction<T> => {
    reset()
    return mockFn
  }

  return mockFn
}

/**
 * Очищает все моки
 */
export function clearAll(): void {
  // TODO: Реализация очистки всех моков, если требуется глобальный реестр
}

/**
 * Создает мок-функцию (совместимость)
 */
export function createMock<T extends (...args: any[]) => any>(
  implementation?: T
): MockedFunction<T> {
  return create({ implementation })
}

/**
 * Создает мок для метода объекта
 */
export function method<T extends object, K extends keyof T>(
  obj: T,
  methodName: K,
  implementation?: T[K] extends (...args: any[]) => any ? T[K] : never
): T[K] extends (...args: any[]) => any ? MockedFunction<T[K]> : never {
  const original = obj[methodName]
  if (typeof original !== 'function') {
    throw new Error(`Cannot mock non-function property '${String(methodName)}'`)
  }

  const mockFn = create<T[K] extends (...args: any[]) => any ? T[K] : never>({
    name: `${obj.constructor.name || 'Object'}.${String(methodName)}`,
    implementation,
  })

  // Заменяем метод объекта на мок
  obj[methodName] = mockFn as any

  return mockFn as any
}

/**
 * Создает мок для всех методов объекта
 */
export function object<T extends object>(obj: T): MockedObject<T> {
  const result = { ...obj } as MockedObject<T>

  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === 'function') {
      const mockFn = create({
        name: `${obj.constructor.name || 'Object'}.${key}`,
        implementation: value as any,
      })
      ;(result as any)[key] = mockFn
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      ;(result as any)[key] = object(value as object)
    }
  })

  return result
}

/**
 * Создает заглушку с указанными методами
 */
export function stub<T extends object>(
  methods: Partial<{ [K in keyof T]: T[K] }>
): StubObject<T> {
  const result = {} as StubObject<T>

  Object.entries(methods).forEach(([key, value]) => {
    if (typeof value === 'function') {
      const mockFn = create({
        name: `Stub.${key}`,
        implementation: value as any,
      })
      ;(result as any)[key] = mockFn
    } else {
      ;(result as any)[key] = value
    }
  })

  return result
}

// Экспортируем API для работы с моками
export default {
  create,
  method,
  object,
  stub,
  clearAll,
  createMock,
}
