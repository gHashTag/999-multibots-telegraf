/**
 * Функциональный модуль для создания моков и заглушек в тестах
 */
import { deepEqual, formatValue } from '@/test-utils/core/utils';

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
export type MockedFunction<T extends MockFunction<any>> = T & {
  mock: {
    calls: Parameters<T>[];
    results: Array<{
      type: 'return' | 'throw';
      value: any;
    }>;
    lastCall: Parameters<T> | undefined;
    clear: () => void;
  };
  mockReturnValue: (value: ReturnType<T>) => MockedFunction<T>;
  mockImplementation: (fn: T) => MockedFunction<T>;
};

/**
 * Создает типизированный мок для функции
 */
export function create<T extends (...args: any[]) => any>(): MockFunction<T> {
  let mockFn: any = (...args: Parameters<T>) => {
    mockFn.calls.push(args)
    return mockFn.implementation ? mockFn.implementation(...args) : mockFn.returnValue
  }

  mockFn.calls = []
  mockFn.implementation = null
  mockFn.returnValue = undefined

  mockFn.mockResolvedValue = (value: Awaited<ReturnType<T>>) => {
    mockFn.implementation = async () => value
  }

  mockFn.mockRejectedValue = (error: Error) => {
    mockFn.implementation = async () => { throw error }
  }

  mockFn.mockReturnValue = (value: ReturnType<T>) => {
    mockFn.returnValue = value
  }

  mockFn.mockImplementation = (fn: T) => {
    mockFn.implementation = fn
  }

  mockFn.mockClear = () => {
    mockFn.calls = []
    mockFn.implementation = null
    mockFn.returnValue = undefined
  }

  mockFn.getMockCalls = () => mockFn.calls

  return mockFn
}

/**
 * Мокает модуль целиком
 */
export function mockModule<T extends Record<string, any>>(
  path: string,
  implementation: Partial<{ [K in keyof T]: T[K] }>
): MockObject<T> {
  const mock = {} as MockObject<T>;

  for (const [key, value] of Object.entries(implementation)) {
    if (typeof value === 'function') {
      const mockFn = create();
      (mock as any)[key] = mockFn;
    } else {
      (mock as any)[key] = value;
    }
  }

  jest.mock(path, () => mock);

  return mock;
}

/**
 * Очищает все моки
 */
export function clearAll(): void {
  // Реализация очистки всех моков
}

/**
 * Создает мок-функцию
 */
export function createMock<T extends MockFunction<any>>(
  implementation?: T
): MockedFunction<T> {
  const calls: Parameters<T>[] = [];
  const results: Array<{ type: 'return' | 'throw'; value: any }> = [];

  const mockFn = function(this: any, ...args: Parameters<T>): ReturnType<T> {
    calls.push(args);
    try {
      const result = implementation?.apply(this, args);
      results.push({ type: 'return', value: result });
      return result as ReturnType<T>;
    } catch (error) {
      results.push({ type: 'throw', value: error });
      throw error;
    }
  } as MockedFunction<T>;

  mockFn.mock = {
    calls,
    results,
    get lastCall() {
      return calls[calls.length - 1];
    },
    clear: () => {
      calls.length = 0;
      results.length = 0;
    }
  };

  mockFn.mockReturnValue = (value: ReturnType<T>) => {
    implementation = (() => value) as T;
    return mockFn;
  };

  mockFn.mockImplementation = (fn: T) => {
    implementation = fn;
    return mockFn;
  };

  return mockFn;
}

// Экспорт по умолчанию
export default {
  create,
  mockModule,
  clearAll,
  createMock
}; 