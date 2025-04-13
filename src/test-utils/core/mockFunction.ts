/**
 * A simple mock function implementation that replaces Jest's jest.fn()
 * This provides similar functionality for mocking in our custom test framework.
 */

type MockFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): ReturnType<T>;
  mock: {
    calls: Array<Parameters<T>>;
    results: Array<{ type: 'return' | 'throw'; value: any }>;
    instances: any[];
    lastCall: Parameters<T> | undefined;
  };
  mockClear: () => MockFunction<T>;
  mockReset: () => MockFunction<T>;
  mockImplementation: (fn: T) => MockFunction<T>;
  mockReturnValue: (value: ReturnType<T>) => MockFunction<T>;
  mockResolvedValue: <U>(value: U) => MockFunction<T>;
  mockRejectedValue: (error: Error) => MockFunction<T>;
  mockReturnThis: () => MockFunction<T>;
};

/**
 * Creates a mock function similar to Jest's jest.fn()
 * @param implementation Optional implementation function
 * @returns Mock function with tracking capabilities
 */
export function mockFn<T extends (...args: any[]) => any>(
  implementation?: T
): MockFunction<T> {
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
  } as MockFunction<T>;

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
    mockImplementationFn = function (this: any) {
      return this;
    } as unknown as T;
    return mockFunction;
  };

  return mockFunction;
}

/**
 * A helper to create a mock object with methods that are mocked
 * Similar to Jest's jest.mock() for modules
 * @param methods Object with method implementations
 * @returns Mocked object
 */
export function mockObject<T extends Record<string, any>>(methods: Partial<T> = {}): { [K in keyof T]: T[K] extends (...args: any[]) => any ? MockFunction<T[K]> : T[K] } {
  const mockObj = {} as { [K in keyof T]: T[K] extends (...args: any[]) => any ? MockFunction<T[K]> : T[K] };
  
  for (const key in methods) {
    if (Object.prototype.hasOwnProperty.call(methods, key)) {
      if (typeof methods[key] === 'function') {
        // Use type assertion to handle the conversion from function to mock function
        mockObj[key] = mockFn(methods[key] as any) as any;
      } else if (methods[key] !== undefined) {
        mockObj[key] = methods[key] as any;
      }
    }
  }
  
  return mockObj;
}

/**
 * Creates a mock module similar to Jest's jest.mock()
 * @param modulePath The module path to mock
 * @param factory A factory function returning the mock implementation
 */
export function mockModule(modulePath: string, factory: () => any): void {
  // This would need to be implemented with a module mocking system
  // For now, it's a placeholder to be compatible with the Jest API
  console.warn(`mockModule called for ${modulePath} but not fully implemented yet`);
}

/**
 * Clears all mocks, similar to Jest's jest.clearAllMocks()
 */
export function clearAllMocks(): void {
  // This would need to track all created mocks to clear them
  console.warn('clearAllMocks called but not fully implemented yet');
}

/**
 * Resets all mocks, similar to Jest's jest.resetAllMocks()
 */
export function resetAllMocks(): void {
  // This would need to track all created mocks to reset them
  console.warn('resetAllMocks called but not fully implemented yet');
}

/**
 * Restores all mocks, similar to Jest's jest.restoreAllMocks()
 */
export function restoreAllMocks(): void {
  // This would need to track all created spies to restore them
  console.warn('restoreAllMocks called but not fully implemented yet');
}

export default {
  fn: mockFn,
  mock: mockModule,
  clearAllMocks,
  resetAllMocks,
  restoreAllMocks,
}; 