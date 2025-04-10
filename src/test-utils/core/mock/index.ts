/**
 * Модуль для создания моков в функциональном стиле
 */
import { TestCategory } from '../../core/categories';
import { logger } from '@/utils/logger';

/**
 * Информация о вызове мока
 */
export interface MockCall {
  /** Аргументы, с которыми была вызвана функция */
  args: any[];
  /** Результат вызова */
  result: any;
  /** Было ли выброшено исключение */
  threw?: boolean;
  /** Выброшенное исключение, если было */
  error?: any;
  /** Время вызова */
  time: number;
}

/**
 * Опции для создания мока
 */
export interface MockOptions {
  /** Название мока */
  name?: string;
  /** Категория теста */
  category?: TestCategory;
  /** Реализация функции */
  implementation?: (...args: any[]) => any;
  /** Возвращаемое значение (альтернатива к implementation) */
  returnValue?: any;
  /** Выбрасываемое исключение (альтернатива к implementation и returnValue) */
  throwError?: any;
  /** Сколько раз должна быть вызвана функция, чтобы считаться успешной */
  callCount?: number;
  /** Ожидаемые аргументы вызова */
  expectedArgs?: any[][];
}

/**
 * Мокированная функция с дополнительной информацией
 */
export interface MockedFunction<T extends (...args: any[]) => any = (...args: any[]) => any> {
  /** Сама функция */
  (...args: Parameters<T>): ReturnType<T>;
  /** Информация о вызовах */
  calls: MockCall[];
  /** Был ли мок вызван */
  readonly called: boolean;
  /** Количество вызовов мока */
  readonly callCount: number;
  /** Опции мока */
  readonly options: MockOptions;
  /** Проверяет, был ли мок вызван с указанными аргументами */
  calledWith(...args: any[]): boolean;
  /** Очищает историю вызовов */
  resetCalls(): void;
  /** Проверяет, что мок был вызван нужное количество раз */
  verify(): boolean;
  /** Получает результаты вызовов */
  getResults(): any[];
}

/**
 * Создает мок-функцию
 * 
 * @param options Опции для создания мока
 * @returns Мокированная функция
 */
export function createMock<T extends (...args: any[]) => any>(
  options: MockOptions = {}
): MockedFunction<T> {
  const calls: MockCall[] = [];
  
  // Функция, которая будет возвращена
  const mockFn = function(...args: any[]): any {
    const call: MockCall = {
      args,
      result: undefined,
      time: Date.now()
    };
    
    try {
      // Определяем, что делать при вызове
      if (options.implementation) {
        call.result = options.implementation(...args);
      } else if (options.throwError) {
        call.threw = true;
        call.error = options.throwError instanceof Error 
          ? options.throwError 
          : new Error(String(options.throwError));
        throw call.error;
      } else {
        call.result = options.returnValue;
      }
      
      calls.push(call);
      return call.result;
    } catch (error) {
      if (!call.threw) {
        call.threw = true;
        call.error = error;
      }
      calls.push(call);
      throw error;
    }
  } as MockedFunction<T>;
  
  // Добавляем свойства и методы
  Object.defineProperties(mockFn, {
    calls: { 
      get: () => [...calls],
      enumerable: true 
    },
    called: { 
      get: () => calls.length > 0,
      enumerable: true 
    },
    callCount: { 
      get: () => calls.length,
      enumerable: true
    },
    options: {
      get: () => ({...options}),
      enumerable: true
    }
  });
  
  // Добавляем методы
  mockFn.calledWith = (...args) => {
    return calls.some(call => {
      if (call.args.length !== args.length) {
        return false;
      }
      
      return args.every((arg, idx) => {
        if (typeof arg === 'function' && typeof call.args[idx] === 'function') {
          return true; // Функции считаем равными, если не требуется строгое сравнение
        }
        return JSON.stringify(arg) === JSON.stringify(call.args[idx]);
      });
    });
  };
  
  mockFn.resetCalls = () => {
    calls.length = 0;
  };
  
  mockFn.verify = () => {
    // Проверка количества вызовов, если задано
    if (options.callCount !== undefined && calls.length !== options.callCount) {
      logger.error(`Ожидалось вызовов: ${options.callCount}, получено: ${calls.length}`);
      return false;
    }
    
    // Проверка аргументов вызова, если заданы
    if (options.expectedArgs) {
      if (calls.length !== options.expectedArgs.length) {
        logger.error(`Ожидалось вызовов: ${options.expectedArgs.length}, получено: ${calls.length}`);
        return false;
      }
      
      for (let i = 0; i < calls.length; i++) {
        const expectedArgs = options.expectedArgs[i];
        const actualArgs = calls[i].args;
        
        if (expectedArgs.length !== actualArgs.length) {
          logger.error(`Вызов ${i + 1}: ожидалось аргументов: ${expectedArgs.length}, получено: ${actualArgs.length}`);
          return false;
        }
        
        for (let j = 0; j < expectedArgs.length; j++) {
          const expectedArg = expectedArgs[j];
          const actualArg = actualArgs[j];
          
          if (JSON.stringify(expectedArg) !== JSON.stringify(actualArg)) {
            logger.error(`Вызов ${i + 1}, аргумент ${j + 1}: ожидалось: ${JSON.stringify(expectedArg)}, получено: ${JSON.stringify(actualArg)}`);
            return false;
          }
        }
      }
    }
    
    return true;
  };
  
  mockFn.getResults = () => {
    return calls.map(call => call.result);
  };
  
  return mockFn;
}

/**
 * Создает мок для метода объекта
 * 
 * @param object Объект, содержащий метод
 * @param methodName Имя метода
 * @param options Опции для создания мока
 * @returns Мокированная функция
 */
export function mockMethod<T extends object, K extends keyof T>(
  object: T,
  methodName: K & string,
  options: MockOptions = {}
): MockedFunction {
  // Сохраняем оригинальный метод
  const originalMethod = object[methodName];
  
  if (typeof originalMethod !== 'function') {
    throw new Error(`${methodName} не является функцией в объекте`);
  }
  
  // Создаем мок с указанными опциями
  const mock = createMock({
    name: `${object.constructor?.name || 'Object'}.${methodName}`,
    ...options
  });
  
  // Заменяем метод объекта на мок
  object[methodName] = mock as any;
  
  // Добавляем метод для восстановления оригинала
  const restoreMethod = () => {
    object[methodName] = originalMethod as any;
  };
  
  // Добавляем функцию восстановления в мок
  Object.defineProperty(mock, 'restore', {
    value: restoreMethod,
    enumerable: true
  });
  
  // Добавляем оригинальный метод
  Object.defineProperty(mock, 'original', {
    value: originalMethod,
    enumerable: true
  });
  
  return mock;
}

/**
 * Мокирует все методы объекта
 * 
 * @param object Объект, методы которого нужно мокировать
 * @param methods Имена методов (если не указаны, мокируются все методы)
 * @param options Опции для создания моков
 * @returns Объект с моками
 */
export function mockObject<T extends object>(
  object: T,
  methods?: (keyof T & string)[],
  options: MockOptions = {}
): Record<string, MockedFunction> {
  const mocks: Record<string, MockedFunction> = {};
  
  // Определяем, какие методы мокировать
  const methodsToMock = methods || 
    Object.getOwnPropertyNames(object).filter(name => {
      return typeof object[name as keyof T] === 'function' && name !== 'constructor';
    });
  
  // Мокируем каждый метод
  for (const methodName of methodsToMock) {
    if (typeof object[methodName as keyof T] === 'function') {
      mocks[methodName as string] = mockMethod(object, methodName as keyof T & string, options);
    }
  }
  
  return mocks;
}

/**
 * Создает заглушку (stub) объекта
 * 
 * @param name Имя заглушки
 * @param methods Имена методов
 * @param options Опции для создания моков
 * @returns Объект-заглушка
 */
export function createStub(
  name: string,
  methods: string[],
  options: MockOptions = {}
): Record<string, MockedFunction> {
  const stub: Record<string, MockedFunction> = {};
  
  for (const methodName of methods) {
    stub[methodName] = createMock({
      name: `${name}.${methodName}`,
      ...options
    });
  }
  
  return stub;
}

// Экспортируем функцию для проверки, является ли объект моком
export function isMock(obj: any): obj is MockedFunction {
  return obj && 
    typeof obj === 'function' && 
    'calls' in obj && 
    Array.isArray(obj.calls) && 
    typeof obj.calledWith === 'function';
}

// Экспортируем все функции
const mock = {
  create: createMock,
  method: mockMethod,
  object: mockObject,
  stub: createStub,
  is: isMock
};

export default mock; 