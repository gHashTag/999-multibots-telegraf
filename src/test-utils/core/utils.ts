/**
 * Утилиты для тестовых модулей
 */

/**
 * Проверяет глубокое равенство двух значений
 */
export function deepEqual(a: any, b: any): boolean {
  // Если примитивные типы или null/undefined - проверяем простое равенство
  if (a === b) return true;
  
  // Если одно из значений null/undefined, а другое нет
  if (a == null || b == null) return false;
  
  // Если типы не совпадают
  if (typeof a !== typeof b) return false;
  
  // Для сравнения дат
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  
  // Для сравнения регулярных выражений
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }
  
  // Для сравнения объектов и массивов
  if (typeof a === 'object') {
    // Проверяем, что оба объекта имеют одинаковые ключи
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    // Проверяем, что все ключи из A существуют в B и имеют те же значения
    return keysA.every(key => {
      return Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]);
    });
  }
  
  return false;
}

/**
 * Форматирует значение для вывода в сообщениях об ошибках
 */
export function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return Object.prototype.toString.call(value);
    }
  }
  
  return String(value);
}

/**
 * Создает отступ заданной длины
 */
export function indent(level: number): string {
  return ' '.repeat(level * 2);
}

/**
 * Форматирует длинный текст для улучшения читаемости в консоли
 */
export function formatLongText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  
  return `${text.substring(0, maxLength - 3)}...`;
}

/**
 * Создает уникальный идентификатор
 */
export function uniqueId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Проверяет тип значения
 */
export function getType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  
  return typeof value;
} 