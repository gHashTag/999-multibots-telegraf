/**
 * Модуль для проверки утверждений в функциональном стиле
 */
import asyncAssert from './async';
import { formatValue } from '../utils';

/**
 * Ошибка утверждения
 */
export class AssertionError extends Error {
  constructor(
    message: string,
    public actual?: any,
    public expected?: any,
    public operator?: string
  ) {
    super(message);
    this.name = 'AssertionError';
    
    // Сохраняем исходный стек
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AssertionError);
    }
  }
}

/**
 * Сравнивает два значения на равенство
 */
function isEqual(actual: any, expected: any): boolean {
  // Простое сравнение для примитивов и ссылок
  if (actual === expected) {
    return true;
  }
  
  // Если одно из значений null или undefined, а другое - нет
  if (actual === null || expected === null || actual === undefined || expected === undefined) {
    return false;
  }
  
  // Сравнение чисел (включая NaN)
  if (typeof actual === 'number' && typeof expected === 'number') {
    return (isNaN(actual) && isNaN(expected)) || (actual === expected);
  }
  
  // Сравнение дат
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();
  }
  
  // Сравнение RegExp
  if (actual instanceof RegExp && expected instanceof RegExp) {
    return actual.source === expected.source && 
           actual.global === expected.global && 
           actual.multiline === expected.multiline && 
           actual.ignoreCase === expected.ignoreCase;
  }
  
  // Проверяем, что оба аргумента - объекты
  if (typeof actual !== 'object' || typeof expected !== 'object') {
    return false;
  }
  
  // Сравнение массивов
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      return false;
    }
    
    return actual.every((item, index) => isEqual(item, expected[index]));
  }
  
  // Сравнение Map
  if (actual instanceof Map && expected instanceof Map) {
    if (actual.size !== expected.size) {
      return false;
    }
    
    for (const [key, value] of actual.entries()) {
      if (!expected.has(key) || !isEqual(value, expected.get(key))) {
        return false;
      }
    }
    
    return true;
  }
  
  // Сравнение Set
  if (actual instanceof Set && expected instanceof Set) {
    if (actual.size !== expected.size) {
      return false;
    }
    
    for (const item of actual) {
      // Для множеств сложнее, т.к. нужно найти эквивалентный элемент
      let found = false;
      for (const expectedItem of expected) {
        if (isEqual(item, expectedItem)) {
          found = true;
          break;
        }
      }
      
      if (!found) {
        return false;
      }
    }
    
    return true;
  }
  
  // Сравнение обычных объектов
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  
  if (actualKeys.length !== expectedKeys.length) {
    return false;
  }
  
  return actualKeys.every(key => 
    Object.prototype.hasOwnProperty.call(expected, key) && 
    isEqual(actual[key], expected[key])
  );
}

/**
 * Основная функция проверки утверждения
 */
function assert(condition: boolean, message?: string): void {
  if (!condition) {
    throw new AssertionError(
      message || 'Assertion failed',
      false,
      true,
      'assert'
    );
  }
}

/**
 * Проверяет, что два значения равны
 */
function equal(actual: any, expected: any, message?: string): void {
  if (actual != expected) {
    throw new AssertionError(
      message || `Ожидалось: ${formatValue(expected)}, получено: ${formatValue(actual)}`,
      actual,
      expected,
      'equal'
    );
  }
}

/**
 * Проверяет, что два значения строго равны
 */
function strictEqual(actual: any, expected: any, message?: string): void {
  if (actual !== expected) {
    throw new AssertionError(
      message || `Ожидалось: ${formatValue(expected)}, получено: ${formatValue(actual)}`,
      actual,
      expected,
      'strictEqual'
    );
  }
}

/**
 * Проверяет, что два значения не равны
 */
function notEqual(actual: any, expected: any, message?: string): void {
  if (actual == expected) {
    throw new AssertionError(
      message || `Не ожидалось: ${formatValue(expected)}`,
      actual,
      expected,
      'notEqual'
    );
  }
}

/**
 * Проверяет, что два значения строго не равны
 */
function notStrictEqual(actual: any, expected: any, message?: string): void {
  if (actual === expected) {
    throw new AssertionError(
      message || `Не ожидалось: ${formatValue(expected)}`,
      actual,
      expected,
      'notStrictEqual'
    );
  }
}

/**
 * Проверяет, что два значения глубоко равны
 */
function deepEqual(actual: any, expected: any, message?: string): void {
  if (!isEqual(actual, expected)) {
    throw new AssertionError(
      message || `Ожидалось: ${formatValue(expected)}, получено: ${formatValue(actual)}`,
      actual,
      expected,
      'deepEqual'
    );
  }
}

/**
 * Проверяет, что два значения глубоко не равны
 */
function notDeepEqual(actual: any, expected: any, message?: string): void {
  if (isEqual(actual, expected)) {
    throw new AssertionError(
      message || `Не ожидалось глубокое равенство с: ${formatValue(expected)}`,
      actual,
      expected,
      'notDeepEqual'
    );
  }
}

/**
 * Проверяет, что значение равно true
 */
function isTrue(value: any, message?: string): void {
  if (value !== true) {
    throw new AssertionError(
      message || `Ожидалось: true, получено: ${formatValue(value)}`,
      value,
      true,
      'isTrue'
    );
  }
}

/**
 * Проверяет, что значение равно false
 */
function isFalse(value: any, message?: string): void {
  if (value !== false) {
    throw new AssertionError(
      message || `Ожидалось: false, получено: ${formatValue(value)}`,
      value,
      false,
      'isFalse'
    );
  }
}

/**
 * Проверяет, что значение является истинным
 */
function ok(value: any, message?: string): void {
  if (!value) {
    throw new AssertionError(
      message || `Ожидалось истинное значение, получено: ${formatValue(value)}`,
      value,
      true,
      'ok'
    );
  }
}

/**
 * Проверяет, что значение определено (не undefined)
 */
function isDefined(value: any, message?: string): void {
  if (value === undefined) {
    throw new AssertionError(
      message || 'Ожидалось определённое значение, получено: undefined',
      value,
      'not undefined',
      'isDefined'
    );
  }
}

/**
 * Проверяет, что значение не определено (undefined)
 */
function isUndefined(value: any, message?: string): void {
  if (value !== undefined) {
    throw new AssertionError(
      message || `Ожидалось undefined, получено: ${formatValue(value)}`,
      value,
      undefined,
      'isUndefined'
    );
  }
}

/**
 * Проверяет, что значение равно null
 */
function isNull(value: any, message?: string): void {
  if (value !== null) {
    throw new AssertionError(
      message || `Ожидалось null, получено: ${formatValue(value)}`,
      value,
      null,
      'isNull'
    );
  }
}

/**
 * Проверяет, что значение не равно null
 */
function isNotNull(value: any, message?: string): void {
  if (value === null) {
    throw new AssertionError(
      message || 'Ожидалось не null значение',
      value,
      'not null',
      'isNotNull'
    );
  }
}

/**
 * Проверяет, что массив содержит указанный элемент
 */
function includes<T>(array: T[], item: T, message?: string): void {
  if (!Array.isArray(array)) {
    throw new AssertionError(
      message || `Ожидался массив, получено: ${formatValue(array)}`,
      array,
      'array',
      'includes'
    );
  }
  
  if (!array.includes(item)) {
    throw new AssertionError(
      message || `Ожидалось, что массив содержит: ${formatValue(item)}`,
      array,
      item,
      'includes'
    );
  }
}

/**
 * Проверяет, что строка содержит указанную подстроку
 */
function contains(str: string, substring: string, message?: string): void {
  if (typeof str !== 'string') {
    throw new AssertionError(
      message || `Ожидалась строка, получено: ${formatValue(str)}`,
      str,
      'string',
      'contains'
    );
  }
  
  if (!str.includes(substring)) {
    throw new AssertionError(
      message || `Ожидалось, что строка содержит: "${substring}"`,
      str,
      substring,
      'contains'
    );
  }
}

/**
 * Проверяет, что выражение выбрасывает ошибку
 */
function throws(fn: () => void, expected?: RegExp | Function | Object | Error, message?: string): void {
  let actual: Error | undefined;
  
  try {
    fn();
  } catch (err) {
    actual = err as Error;
  }
  
  if (!actual) {
    throw new AssertionError(
      message || 'Ожидалось исключение, но ничего не было выброшено',
      undefined,
      expected,
      'throws'
    );
  }
  
  if (expected) {
    if (expected instanceof RegExp) {
      if (!expected.test(actual.message)) {
        throw new AssertionError(
          message || `Ожидалось исключение с сообщением, соответствующим ${expected}, получено: ${actual.message}`,
          actual,
          expected,
          'throws'
        );
      }
    } else if (expected instanceof Error) {
      if (actual.name !== expected.name || actual.message !== expected.message) {
        throw new AssertionError(
          message || `Ожидалось исключение ${expected.name}: ${expected.message}, получено: ${actual.name}: ${actual.message}`,
          actual,
          expected,
          'throws'
        );
      }
    } else if (typeof expected === 'function') {
      if (!(actual instanceof expected)) {
        throw new AssertionError(
          message || `Ожидалось исключение типа ${expected.name}, получено: ${actual.name}`,
          actual,
          expected,
          'throws'
        );
      }
    } else if (typeof expected === 'object') {
      // Сравниваем свойства объекта expected с соответствующими свойствами actual
      for (const key in expected) {
        if (Object.prototype.hasOwnProperty.call(expected, key)) {
          const expectedValue = (expected as Record<string, any>)[key];
          const actualValue = actual[key as keyof typeof actual];
          
          if (!Object.prototype.hasOwnProperty.call(actual, key) || 
              !isEqual(actualValue, expectedValue)) {
            throw new AssertionError(
              message || `Ожидалось исключение с ${key}: ${formatValue(expectedValue)}, получено: ${formatValue(actualValue)}`,
              actual,
              expected,
              'throws'
            );
          }
        }
      }
    }
  }
}

/**
 * Проверяет, что выражение не выбрасывает ошибку
 */
function doesNotThrow(fn: () => void, message?: string): void {
  try {
    fn();
  } catch (err) {
    throw new AssertionError(
      message || `Не ожидалось исключение, но было выброшено: ${(err as Error).message}`,
      err,
      undefined,
      'doesNotThrow'
    );
  }
}

/**
 * Проверяет, что значение является экземпляром указанного класса
 */
function instanceOf(value: any, expectedClass: Function, message?: string): void {
  if (!(value instanceof expectedClass)) {
    throw new AssertionError(
      message || `Ожидался экземпляр ${expectedClass.name}, получено: ${formatValue(value)}`,
      value,
      expectedClass.name,
      'instanceOf'
    );
  }
}

/**
 * Проверяет, что значение имеет указанный тип
 */
function typeOf(value: any, expectedType: string, message?: string): void {
  const actualType = typeof value;
  if (actualType !== expectedType) {
    throw new AssertionError(
      message || `Ожидался тип ${expectedType}, получено: ${actualType}`,
      actualType,
      expectedType,
      'typeOf'
    );
  }
}

/**
 * Проверяет, что число находится в указанном диапазоне
 */
function inRange(value: number, min: number, max: number, message?: string): void {
  if (typeof value !== 'number') {
    throw new AssertionError(
      message || `Ожидалось число, получено: ${formatValue(value)}`,
      value,
      'number',
      'inRange'
    );
  }
  
  if (value < min || value > max) {
    throw new AssertionError(
      message || `Ожидалось число в диапазоне [${min}, ${max}], получено: ${value}`,
      value,
      `в диапазоне [${min}, ${max}]`,
      'inRange'
    );
  }
}

// Экспортируем функциональный API
export default {
  AssertionError,
  assert,
  equal,
  strictEqual,
  notEqual,
  notStrictEqual,
  deepEqual,
  notDeepEqual,
  isTrue,
  isFalse,
  ok,
  isDefined,
  isUndefined,
  isNull,
  isNotNull,
  includes,
  contains,
  throws,
  doesNotThrow,
  instanceOf,
  typeOf,
  inRange,
  
  // Асинхронные функции
  resolves: asyncAssert.resolves,
  rejects: asyncAssert.rejects,
  eventually: asyncAssert.eventually,
  completesWithin: asyncAssert.completesWithin
}; 