export type MockResult<T> = {
  type: "return" | "throw";
  value: T;
};

export interface MockState<T extends (...args: any[]) => any> {
  calls: Parameters<T>[];
  results: MockResult<ReturnType<T>>[];
  instances: any[];
  invocationCallOrder: number[];
  lastCall?: Parameters<T>;
  implementation?: T;
}

export interface IMockFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>;
  mock: MockState<T>;
  mockClear(): IMockFunction<T>;
  mockReset(): IMockFunction<T>;
  mockImplementation(fn: T): IMockFunction<T>;
  mockReturnValue(value: ReturnType<T>): IMockFunction<T>;
  mockReturnValueOnce(value: ReturnType<T>): IMockFunction<T>;
  mockRestore(): IMockFunction<T>;
}

/**
 * Создает мок-функцию с возможностью отслеживания вызовов
 */
export function createMockFunction<T extends (...args: any[]) => any>(
  implementation?: T
): IMockFunction<T> {
  const mockState = {
    calls: [] as Parameters<T>[],
    results: [] as ReturnType<T>[],
    implementation: implementation || ((() => undefined) as unknown as T)
  };

  const mockFn = function(this: any, ...args: Parameters<T>): ReturnType<T> {
    mockState.calls.push(args);
    mockState.results.push(mockState.implementation.apply(this, args));
    return mockState.results[mockState.results.length - 1];
  } as IMockFunction<T>;

  mockFn.mock = {
    calls: mockState.calls,
    results: mockState.results,
    implementation: mockState.implementation
  };

  mockFn.mockClear = () => {
    mockState.calls = [];
    mockState.results = [];
    mockState.implementation = (() => undefined) as unknown as T;
    return mockFn;
  };

  mockFn.mockReset = () => {
    mockFn.mockClear();
    mockState.implementation = (() => undefined) as unknown as T;
    return mockFn;
  };

  mockFn.mockImplementation = (fn: T) => {
    mockState.implementation = fn;
    return mockFn;
  };

  mockFn.mockReturnValue = (value: ReturnType<T>) => {
    return mockFn.mockImplementation((() => value) as unknown as T);
  };

  mockFn.mockReturnValueOnce = (value: ReturnType<T>) => {
    const original = mockState.implementation;
    let called = false;
    mockState.implementation = ((...args: Parameters<T>) => {
      if (!called) {
        called = true;
        return value;
      }
      return original(...args);
    }) as T;
    return mockFn;
  };

  mockFn.mockRestore = () => {
    mockFn.mockReset();
    return mockFn;
  };

  return mockFn;
}

/**
 * Вспомогательные функции для работы с моками
 */
export const mockUtils = {
  /**
   * Проверяет, был ли мок вызван
   */
  wasCalled: <T extends (...args: any[]) => any>(mock: IMockFunction<T>): boolean => {
    return mock.mock.calls.length > 0;
  },

  /**
   * Проверяет, был ли мок вызван с определенными аргументами
   */
  wasCalledWith: <T extends (...args: any[]) => any>(
    mock: IMockFunction<T>,
    ...expectedArgs: Parameters<T>
  ): boolean => {
    return mock.mock.calls.some(args =>
      args.length === expectedArgs.length &&
      args.every((arg, i) => arg === expectedArgs[i])
    );
  },

  /**
   * Получает количество вызовов мока
   */
  getCallCount: <T extends (...args: any[]) => any>(mock: IMockFunction<T>): number => {
    return mock.mock.calls.length;
  }
};

/**
 * A simple mock function implementation that replaces Jest's jest.fn()
 * This provides similar functionality for mocking in our custom test framework.
 */
export const mockFn = <T extends (...args: any[]) => any>(implementation?: T): IMockFunction<T> => {
  let callOrder = 0;

  const fn = function (...args: Parameters<T>): ReturnType<T> {
    fn.mock.calls.push(args);
    fn.mock.lastCall = args;
    fn.mock.invocationCallOrder.push(++callOrder);

    try {
      const impl = fn.mock.implementation || ((() => undefined) as unknown as T);
      const result = impl(...args);
      fn.mock.results.push({ type: "return", value: result });
      return result;
    } catch (error) {
      fn.mock.results.push({ type: "throw", value: error as ReturnType<T> });
      throw error;
    }
  } as IMockFunction<T>;

  fn.mock = {
    calls: [],
    results: [],
    instances: [],
    invocationCallOrder: [],
    lastCall: undefined,
    implementation: implementation || ((() => undefined) as unknown as T)
  };

  fn.mockClear = function(this: IMockFunction<T>): IMockFunction<T> {
    this.mock.calls = [];
    this.mock.results = [];
    this.mock.instances = [];
    this.mock.invocationCallOrder = [];
    this.mock.lastCall = undefined;
    return this;
  };

  fn.mockReset = function(this: IMockFunction<T>): IMockFunction<T> {
    this.mockClear();
    this.mock.implementation = undefined;
    return this;
  };

  fn.mockImplementation = function(this: IMockFunction<T>, impl: T): IMockFunction<T> {
    this.mock.implementation = impl;
    return this;
  };

  fn.mockReturnValue = function(this: IMockFunction<T>, value: ReturnType<T>): IMockFunction<T> {
    return this.mockImplementation((() => value) as unknown as T);
  };

  fn.mockReturnValueOnce = function(this: IMockFunction<T>, value: ReturnType<T>): IMockFunction<T> {
    const originalImpl = this.mock.implementation;
    let called = false;
    
    return this.mockImplementation(function(this: any, ...args: Parameters<T>): ReturnType<T> {
      if (!called) {
        called = true;
        return value;
      }
      return (originalImpl || ((() => undefined) as unknown as T)).apply(this, args);
    } as unknown as T);
  };

  fn.mockRestore = function(this: IMockFunction<T>): IMockFunction<T> {
    return this.mockReset();
  };

  return fn;
};

/**
 * Creates a mock object with all methods mocked
 */
export function mockObject<T extends Record<string, (...args: any[]) => any>>(obj: T): { [K in keyof T]: IMockFunction<T[K]> } {
  const result = {} as { [K in keyof T]: IMockFunction<T[K]> };
  for (const key in obj) {
    result[key] = createMockFunction(obj[key]);
  }
  return result;
}

/**
 * Mocks a module with custom implementation
 */
export function mockModule(modulePath: string, factory: () => any): void {
  // Implementation depends on your module system
  throw new Error('Not implemented');
}

/**
 * Clears all mocks
 */
export function clearAllMocks(): void {
  // Implementation
}

/**
 * Resets all mocks
 */
export function resetAllMocks(): void {
  // Implementation
}

/**
 * Restores all mocks to their original state
 */
export function restoreAllMocks(): void {
  // Implementation
}

export default {
  mockFn,
  mockObject,
  mockModule,
  clearAllMocks,
  resetAllMocks,
  restoreAllMocks,
  createMockFunction,
  mockUtils
}; 