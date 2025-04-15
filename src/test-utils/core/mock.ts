/**
 * Функциональный модуль для создания моков и заглушек в тестах
 */
import { deepEqual, formatValue } from '@/test-utils/core/utils'

/**
 * Типы для мок-функций
 */
export type MockedFunction<T extends (...args: any[]) => any> = T & {
  mock: {
    calls: Array<Parameters<T>>
    results: Array<{
      type: 'return' | 'throw'
      value: any
    }>
    instances: any[]
    lastCall: Parameters<T> | undefined
    clear: () => void
    reset: () => void
  }
  mockReturnValue: (value: ReturnType<T>) => MockedFunction<T>
  mockReturnValueOnce: (value: ReturnType<T>) => MockedFunction<T>
  mockResolvedValue: <U extends Promise<any>>(
    value: PromisedType<ReturnType<T> & U>
  ) => MockedFunction<T>
  mockResolvedValueOnce: <U extends Promise<any>>(
    value: PromisedType<ReturnType<T> & U>
  ) => MockedFunction<T>
  mockRejectedValue: <U extends Promise<any>>(value: any) => MockedFunction<T>
  mockRejectedValueOnce: <U extends Promise<any>>(
    value: any
  ) => MockedFunction<T>
  mockImplementation: (fn: T) => MockedFunction<T>
  mockImplementationOnce: (fn: T) => MockedFunction<T>
  mockClear: () => MockedFunction<T>
  mockReset: () => MockedFunction<T>
}

/**
 * Тип для извлечения типа из Promise
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
 * Тип для объекта-заглушки
 */
export type StubObject<T extends object> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? MockedFunction<T[K]>
    : T[K] extends object
      ? StubObject<T[K]>
      : T[K]
}

/**
 * Тип для мока метода объекта
 */
export type MockedMethod<T extends object, K extends keyof T> = T[K] extends (
  ...args: any[]
) => any
  ? MockedFunction<T[K]>
  : never

/**
 * Тип для мока объекта с методами
 */
export type MockedObject<T extends object> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? MockedFunction<T[K]>
    : T[K] extends object
      ? MockedObject<T[K]>
      : T[K]
}

/**
 * Создает мок-функцию с отслеживанием вызовов и настраиваемым поведением
 */
export function create<T extends (...args: any[]) => any>(
  fn?: T | MockOptions<T>
): MockedFunction<T> {
  const options: MockOptions<T> =
    typeof fn === 'function' ? { implementation: fn } : fn || {}
  const { name = 'mockFunction', defaultValue, implementation } = options

  // Хранение состояния мока
  const state = {
    calls: [] as Array<Parameters<T>>,
    results: [] as Array<{ type: 'return' | 'throw'; value: any }>,
    instances: [] as any[],
    implementations: [implementation] as Array<T | undefined>,
    returnValues: [] as any[],
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

  // Добавляем свойство mock для отслеживания и управления
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

  mockFn.mockResolvedValueOnce = <U extends Promise<any>>(
    value: PromisedType<ReturnType<T> & U>
  ): MockedFunction<T> => {
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

  mockFn.mockRejectedValueOnce = <U extends Promise<any>>(
    value: any
  ): MockedFunction<T> => {
    state.rejectionValues.push(value)
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
      ;(result as any)[key] = object(value as any)
    }
  })

  return result
}

/**
 * Создает заглушку с методами
 */
export function stub<T extends object>(
  methods: Partial<{ [K in keyof T]: T[K] }>
): StubObject<T> {
  const result = {} as StubObject<T>

  Object.entries(methods).forEach(([key, value]) => {
    if (typeof value === 'function') {
      const mockFn = create({
        name: key,
        implementation: value as any,
      })
      ;(result as any)[key] = mockFn
    } else {
      ;(result as any)[key] = value
    }
  })

  return result
}

// Функция для создания упрощенного мока (переименована, чтобы избежать конфликта с экспортированной функцией create)
function createMockFunction<T extends (...args: any[]) => any>(
  ...args: any[]
): MockedFunction<T> {
  const mock = {
    calls: [] as never[],
    instances: [] as never[],
    invocationCallOrder: [] as never[],
    results: [] as never[],
  }

  const mockFn = function (value: any) {
    return mockFn.mockReturnValue(value)
  } as any

  mockFn.mock = mock

  mockFn.mockReset = () => mockFn

  mockFn.mockReturnValue = (value: any) => {
    mockFn.mockReturnValueOnce = () => mockFn
    return mockFn
  }

  mockFn.mockReturnValueOnce = (value: any) => {
    mockFn.mockReturnValue(value)
    return mockFn
  }

  mockFn.mockResolvedValue = (value: any) => {
    return mockFn.mockReturnValue(Promise.resolve(value))
  }

  mockFn.mockResolvedValueOnce = (value: any) => {
    return mockFn.mockReturnValueOnce(Promise.resolve(value))
  }

  mockFn.mockRejectedValue = (value: any) => {
    return mockFn.mockReturnValue(Promise.reject(value))
  }

  mockFn.mockRejectedValueOnce = (value: any) => {
    return mockFn.mockReturnValueOnce(Promise.reject(value))
  }

  return mockFn
}

// Экспортируем createSimpleMock под другим именем
export const createSimpleMock = () => {
  const mockFn = function () {
    return true
  }

  mockFn.mockReturnValue = (val: any) => {
    return mockFn
  }

  mockFn.mockReturnValueOnce = (val: any) => {
    return mockFn
  }

  mockFn.mockImplementation = (fn: any) => {
    return mockFn
  }

  return mockFn
}

// Экспортируем mockSupabase
export const mockSupabase = () => {
  // Создаем базовые моки для Supabase
  const from = (table: any) => {
    const api = {
      select: (columns: any) => api,
      eq: (field: any, value: any) => api,
      order: (field: any) => api,
      limit: (limit: any) => api,
      single: () => api,
      match: (column: any, options: any) => api,
      range: (limit: any) => api,
      data: null as any,
      insert: (data: any) => api,
      upsert: (data: any) => api,
      update: (field: any, value: any) => api,
      delete: () => api,
      in: (field: any, value: any) => api,
      neq: (field: any) => api,
      then: (data: any) => Promise.resolve({ data: api.data, error: null }),
    }
    return api
  }

  return {
    from,
    auth: {
      signUp: () => Promise.resolve({ user: null, session: null, error: null }),
      signIn: () => Promise.resolve({ user: null, session: null, error: null }),
    },
  }
}

// Export all functions as a default export object
export default {
  create,
  method,
  object,
  createSimpleMock,
  mockSupabase,
}
