/**
 * Модуль для асинхронной проверки утверждений
 */
import { AssertionError } from './index';
import { formatValue } from '../utils';

/**
 * Проверяет, что промис успешно завершается
 * 
 * @param promise Проверяемый промис
 * @param message Сообщение об ошибке
 * @returns Значение, с которым завершился промис
 */
export async function resolves<T>(promise: Promise<T>, message?: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    throw new AssertionError(
      message || `Ожидалось успешное завершение промиса, но было выброшено исключение: ${(error as Error).message}`,
      error,
      'fulfilled promise',
      'resolves'
    );
  }
}

/**
 * Проверяет, что промис завершается с ошибкой
 * 
 * @param promise Проверяемый промис
 * @param expected Ожидаемая ошибка или тип ошибки (опционально)
 * @param message Сообщение об ошибке
 * @returns Ошибка, с которой завершился промис
 */
export async function rejects(
  promise: Promise<any>,
  expected?: RegExp | Function | Object | Error,
  message?: string
): Promise<Error> {
  try {
    await promise;
    throw new AssertionError(
      message || 'Ожидалось исключение, но промис завершился успешно',
      undefined,
      expected,
      'rejects'
    );
  } catch (error) {
    // Если это ошибка от нашей проверки выше, пробрасываем её дальше
    if (error instanceof AssertionError && error.operator === 'rejects') {
      throw error;
    }

    const actualError = error as Error;
    
    if (expected) {
      if (expected instanceof RegExp) {
        if (!expected.test(actualError.message)) {
          throw new AssertionError(
            message || `Ожидалось исключение с сообщением, соответствующим ${expected}, получено: ${actualError.message}`,
            actualError,
            expected,
            'rejects'
          );
        }
      } else if (expected instanceof Error) {
        if (actualError.name !== expected.name || actualError.message !== expected.message) {
          throw new AssertionError(
            message || `Ожидалось исключение ${expected.name}: ${expected.message}, получено: ${actualError.name}: ${actualError.message}`,
            actualError,
            expected,
            'rejects'
          );
        }
      } else if (typeof expected === 'function') {
        if (!(actualError instanceof expected)) {
          throw new AssertionError(
            message || `Ожидалось исключение типа ${expected.name}, получено: ${actualError.name}`,
            actualError,
            expected,
            'rejects'
          );
        }
      } else if (typeof expected === 'object') {
        // Сравниваем свойства объекта expected с соответствующими свойствами actualError
        for (const key in expected) {
          if (Object.prototype.hasOwnProperty.call(expected, key)) {
            const expectedValue = (expected as Record<string, any>)[key];
            const actualValue = (actualError as any)[key];
            
            if (!Object.prototype.hasOwnProperty.call(actualError, key) || 
                expectedValue !== actualValue) {
              throw new AssertionError(
                message || `Ожидалось исключение с ${key}: ${formatValue(expectedValue)}, получено: ${formatValue(actualValue)}`,
                actualError,
                expected,
                'rejects'
              );
            }
          }
        }
      }
    }
    
    return actualError;
  }
}

/**
 * Проверяет, что значение становится истинным в течение указанного времени
 * 
 * @param getValue Функция, возвращающая проверяемое значение
 * @param timeout Максимальное время ожидания в миллисекундах
 * @param interval Интервал между проверками в миллисекундах
 * @param message Сообщение об ошибке
 */
export async function eventually(
  getValue: () => any,
  timeout: number = 5000,
  interval: number = 100,
  message?: string
): Promise<void> {
  const startTime = Date.now();
  let lastValue: any;
  
  while (Date.now() - startTime < timeout) {
    lastValue = getValue();
    
    if (lastValue) {
      return; // Успех
    }
    
    // Ждем перед следующей проверкой
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new AssertionError(
    message || `Таймаут ${timeout}мс истек, но значение не стало истинным. Последнее значение: ${formatValue(lastValue)}`,
    lastValue,
    true,
    'eventually'
  );
}

/**
 * Проверяет, что функция выполняется за указанное время
 * 
 * @param fn Проверяемая функция
 * @param maxTime Максимальное время выполнения в миллисекундах
 * @param message Сообщение об ошибке
 * @returns Результат выполнения функции
 */
export async function completesWithin<T>(
  fn: () => T | Promise<T>,
  maxTime: number,
  message?: string
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await Promise.resolve(fn());
    const execTime = Date.now() - startTime;
    
    if (execTime > maxTime) {
      throw new AssertionError(
        message || `Ожидалось выполнение за ${maxTime}мс, но потребовалось ${execTime}мс`,
        execTime,
        maxTime,
        'completesWithin'
      );
    }
    
    return result;
  } catch (error) {
    if (error instanceof AssertionError && error.operator === 'completesWithin') {
      throw error;
    }
    
    throw new AssertionError(
      message || `Ошибка при выполнении функции: ${(error as Error).message}`,
      error,
      'successful completion',
      'completesWithin'
    );
  }
}

// Экспортируем все асинхронные функции
export default {
  resolves,
  rejects,
  eventually,
  completesWithin
}; 