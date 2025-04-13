/**
 * Утилиты для создания моков в тестах
 */

/**
 * Создает мок-функцию для тестирования
 * Альтернатива jest.fn() для нашей собственной системы тестирования
 */
export const createMockFn = () => {
  const mockCalls: any[][] = []

  // Основная функция-мок
  const mockImplementationFunction: any = (...args: any[]) => {
    mockCalls.push(args)
    return mockImplementationFunction.returnValue
  }

  // Свойства для хранения состояния мока
  mockImplementationFunction.mock = {
    calls: mockCalls,
    results: [] as any[],
  }

  // Возвращаемое значение по умолчанию
  mockImplementationFunction.returnValue = undefined

  // Методы настройки мока
  mockImplementationFunction.mockReturnValue = (value: any) => {
    mockImplementationFunction.returnValue = value
    return mockImplementationFunction
  }

  mockImplementationFunction.mockResolvedValue = (value: any) => {
    mockImplementationFunction.returnValue = Promise.resolve(value)
    return mockImplementationFunction
  }

  mockImplementationFunction.mockRejectedValue = (error: any) => {
    mockImplementationFunction.returnValue = Promise.reject(error)
    return mockImplementationFunction
  }

  mockImplementationFunction.mockImplementation = (
    implementation: (...args: any[]) => any
  ) => {
    // Создаем новую функцию, которая вызывает переданную имплементацию
    const newMockFn = (...args: any[]) => {
      mockCalls.push(args)
      return implementation(...args)
    }

    // Копируем все свойства и методы
    newMockFn.mock = mockImplementationFunction.mock
    newMockFn.returnValue = mockImplementationFunction.returnValue
    newMockFn.mockReturnValue = mockImplementationFunction.mockReturnValue
    newMockFn.mockResolvedValue = mockImplementationFunction.mockResolvedValue
    newMockFn.mockRejectedValue = mockImplementationFunction.mockRejectedValue
    newMockFn.mockImplementation = mockImplementationFunction.mockImplementation
    newMockFn.mockReset = mockImplementationFunction.mockReset
    newMockFn.mockClear = mockImplementationFunction.mockClear

    return newMockFn
  }

  // Сброс состояния мока
  mockImplementationFunction.mockReset = () => {
    mockCalls.length = 0
    mockImplementationFunction.mock.results.length = 0
    mockImplementationFunction.returnValue = undefined
    return mockImplementationFunction
  }

  mockImplementationFunction.mockClear = () => {
    mockCalls.length = 0
    mockImplementationFunction.mock.results.length = 0
    return mockImplementationFunction
  }

  return mockImplementationFunction
}

/**
 * Тип для мок-функции
 */
export type MockFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): ReturnType<T>
  mock: {
    calls: Parameters<T>[]
    results: ReturnType<T>[]
  }
  mockReturnValue: (value: ReturnType<T>) => MockFunction<T>
  mockResolvedValue: <U>(value: U) => MockFunction<T>
  mockRejectedValue: (error: any) => MockFunction<T>
  mockImplementation: (implementation: T) => MockFunction<T>
  mockReset: () => MockFunction<T>
  mockClear: () => MockFunction<T>
  returnValue: ReturnType<T> | Promise<any> | undefined
}
