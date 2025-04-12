import { isRussian } from '../../../logic/logic'; // Assuming isRussian is exported from here

describe('isRussian', () => {
  // Test cases for Cyrillic characters
  test('should return true for text containing only Cyrillic characters', () => {
    expect(isRussian('Привет мир')).toBe(true);
    expect(isRussian('тест')).toBe(true);
    expect(isRussian('РУССКИЙ')).toBe(true);
    expect(isRussian('абвгдеёжзийклмнопрстуфхцчшщъыьэюя')).toBe(true);
    expect(isRussian('АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ')).toBe(true);
  });

  test('should return true for text containing mixed Cyrillic and Latin characters/numbers/symbols', () => {
    expect(isRussian('Привет world')).toBe(true);
    expect(isRussian('тест 123')).toBe(true);
    expect(isRussian('РУССКИЙ!')).toBe(true);
    expect(isRussian('mix Привет and Hello')).toBe(true);
  });

  test('should return true for text containing Cyrillic characters with diacritics (though less common)', () => {
     // Note: Russian doesn't typically use many diacritics beyond ё/Ё
    expect(isRussian('Ещё текст')).toBe(true);
  });

  // Test cases for non-Cyrillic characters
  test('should return false for text containing only Latin characters', () => {
    expect(isRussian('Hello world')).toBe(false);
    expect(isRussian('test')).toBe(false);
    expect(isRussian('ENGLISH')).toBe(false);
    expect(isRussian('abcdefghijklmnopqrstuvwxyz')).toBe(false);
    expect(isRussian('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(false);
  });

   test('should return false for text containing only numbers', () => {
    expect(isRussian('1234567890')).toBe(false);
  });

   test('should return false for text containing only symbols', () => {
    expect(isRussian('!@#$%^&*()_+=-`~')).toBe(false);
    expect(isRussian(',./?<>{}[]|\')).toBe(false);
  });

  test('should return false for text in other languages (non-Cyrillic)', () => {
    expect(isRussian('你好世界')).toBe(false); // Chinese
    expect(isRussian('Bonjour le monde')).toBe(false); // French
    expect(isRussian('Hola mundo')).toBe(false); // Spanish
    expect(isRussian('Γειά σου Κόσμε')).toBe(false); // Greek
    expect(isRussian('こんにちは世界')).toBe(false); // Japanese
  });

  // Edge cases
   test('should return false for an empty string', () => {
    expect(isRussian('')).toBe(false);
  });

   test('should return false for null or undefined input (if the function handles it)', () => {
    // This depends on how isRussian handles non-string inputs.
    // Assuming it's designed for strings, these might throw errors or return false.
    // Adjust based on actual implementation.
    expect(isRussian(null as any)).toBe(false); // Cast to any to bypass TS checks if needed
    expect(isRussian(undefined as any)).toBe(false);
   });

  test('should return false for whitespace-only strings', () => {
    expect(isRussian('   ')).toBe(false);
    expect(isRussian('\t\n')).toBe(false);
  });
}); 