/**
 * Интерфейс для мок-функции
 */
export interface IMockFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): ReturnType<T>;
  mock: {
    calls: Parameters<T>[];
    results: Array<{ type: 'return' | 'throw'; value: any }>;
    instances: any[];
    lastCall?: Parameters<T>;
  };
  mockClear: () => IMockFunction<T>;
  mockReset: () => IMockFunction<T>;
  mockImplementation: (fn: T) => IMockFunction<T>;
  mockReturnValue: (value: ReturnType<T>) => IMockFunction<T>;
  mockResolvedValue: <U>(value: U) => IMockFunction<T>;
  mockRejectedValue: (error: Error) => IMockFunction<T>;
  mockReturnThis?: () => IMockFunction<T>;
}

/**
 * Создает мок-функцию с возможностью отслеживания вызовов
 */
function createBaseMockFunction<T extends (...args: any[]) => any>(
  implementation?: T
): IMockFunction<T> {
  const mockState = {
    calls: [] as Parameters<T>[],
    results: [] as Array<{ type: 'return' | 'throw'; value: any }>,
    instances: [] as any[],
    implementation: implementation || ((() => undefined) as unknown as T)
  };

  const mockFn = function(this: any, ...args: Parameters<T>): ReturnType<T> {
    mockState.calls.push(args);
    mockState.instances.push(this);
    try {
      const result = mockState.implementation.apply(this, args);
      mockState.results.push({ type: 'return', value: result });
      return result;
    } catch (error) {
      mockState.results.push({ type: 'throw', value: error });
      throw error;
    }
  } as IMockFunction<T>;

  Object.defineProperty(mockFn, 'mock', {
    get: () => ({
      calls: mockState.calls,
      results: mockState.results,
      instances: mockState.instances,
      get lastCall() {
        return mockState.calls.length > 0 ? mockState.calls[mockState.calls.length - 1] : undefined;
      }
    })
  });

  mockFn.mockClear = () => {
    mockState.calls = [];
    mockState.results = [];
    mockState.instances = [];
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
    mockState.implementation = (() => value) as unknown as T;
    return mockFn;
  };

  mockFn.mockResolvedValue = <U>(value: U) => {
    mockState.implementation = (() => Promise.resolve(value)) as unknown as T;
    return mockFn;
  };

  mockFn.mockRejectedValue = (error: Error) => {
    mockState.implementation = (() => Promise.reject(error)) as unknown as T;
    return mockFn;
  };

  mockFn.mockReturnThis = () => {
    mockState.implementation = (function(this: any) { return this; }) as unknown as T;
    return mockFn;
  };

  return mockFn;
}

export const createMockFunction = createBaseMockFunction;

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
export function mockFn<T extends (...args: any[]) => any>(
  implementation?: T
): IMockFunction<T> {
  const mockCalls: Array<Parameters<T>> = [];
  const mockResults: Array<{ type: 'return' | 'throw'; value: any }> = [];
  const mockInstances: any[] = [];
  let mockImplementationFn = implementation || ((() => undefined) as unknown as T);

  const mockFunction = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    mockCalls.push(args);
    mockInstances.push(this);

    try {
      const result = mockImplementationFn.apply(this, args);
      mockResults.push({ type: 'return', value: result });
      return result;
    } catch (error) {
      mockResults.push({ type: 'throw', value: error });
      throw error;
    }
  } as IMockFunction<T>;

  // Add mock property to track calls and results
  mockFunction.mock = {
    calls: mockCalls,
    results: mockResults,
    instances: mockInstances,
    get lastCall() {
      return mockCalls.length > 0 ? mockCalls[mockCalls.length - 1] : undefined;
    },
  };

  // Add methods for manipulating the mock
  mockFunction.mockClear = () => {
    mockCalls.length = 0;
    mockResults.length = 0;
    mockInstances.length = 0;
    return mockFunction;
  };

  mockFunction.mockReset = () => {
    mockFunction.mockClear();
    mockImplementationFn = (() => undefined) as unknown as T;
    return mockFunction;
  };

  mockFunction.mockImplementation = (fn: T) => {
    mockImplementationFn = fn;
    return mockFunction;
  };

  mockFunction.mockReturnValue = (value: ReturnType<T>) => {
    mockImplementationFn = (() => value) as unknown as T;
    return mockFunction;
  };

  mockFunction.mockResolvedValue = <U>(value: U) => {
    mockImplementationFn = (() => Promise.resolve(value)) as unknown as T;
    return mockFunction;
  };

  mockFunction.mockRejectedValue = (error: Error) => {
    mockImplementationFn = (() => Promise.reject(error)) as unknown as T;
    return mockFunction;
  };

  mockFunction.mockReturnThis = () => {
    mockImplementationFn = (function(this: any) { return this; }) as unknown as T;
    return mockFunction;
  };

  return mockFunction;
}

/**
 * Creates a mock object with all methods mocked
 */
export function mockObject<T extends Record<string, any>>(methods: Partial<T> = {}): { [K in keyof T]: T[K] extends (...args: any[]) => any ? IMockFunction<T[K]> : T[K] } {
  const result = {} as { [K in keyof T]: T[K] extends (...args: any[]) => any ? IMockFunction<T[K]> : T[K] };
  
  for (const key in methods) {
    const value = methods[key];
    if (typeof value === 'function') {
      result[key] = mockFn(value) as any;
    } else {
      result[key] = value as any;
    }
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