/**
 * Утилиты для совместимости с ES модулями
 * 
 * Этот файл предоставляет функции для совместимости с разными форматами модулей
 * и решает проблемы с импортами в тестовой среде.
 */

import { logger } from '@/utils/logger';

/**
 * Импортирует модуль с поддержкой как ES, так и CommonJS форматов
 * 
 * @param modulePath Путь к модулю
 * @returns Импортированный модуль
 */
export async function importModule(modulePath: string) {
  try {
    // Сначала пробуем импортировать стандартным способом
    return await import(modulePath);
  } catch (error) {
    logger.warn(`Ошибка при стандартном импорте модуля ${modulePath}: ${error}`);
    
    try {
      // Пробуем создать динамический import через require
      const moduleObj = require(modulePath);
      return moduleObj;
    } catch (requireError) {
      logger.error(`Не удалось импортировать модуль ${modulePath} ни одним способом: ${requireError}`);
      throw new Error(`Не удалось импортировать модуль ${modulePath}: ${requireError}`);
    }
  }
}

/**
 * Функция для адаптации тестового файла - получает как модуль ES, так и CommonJS
 * @param testModule Импортированный модуль теста
 * @returns Стандартизированный модуль теста
 */
export function normalizeTestModule(testModule: any) {
  // Если модуль имеет default экспорт (ES модуль)
  if (testModule.default) {
    // Если default - это функция, это экспорт по умолчанию
    if (typeof testModule.default === 'function') {
      return {
        runTests: testModule.default,
        ...testModule // Сохраняем и все именованные экспорты
      };
    }
    // Если default - это объект, возвращаем его
    return testModule.default;
  }
  
  // CommonJS модуль
  return testModule;
}

/**
 * Проверяет, существует ли указанный файл
 * @param filePath Путь к файлу
 * @returns true если файл существует, иначе false
 */
export function fileExists(filePath: string): boolean {
  try {
    require.resolve(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Безопасно загружает тестовый файл с обработкой ошибок
 * @param filePath Путь к тестовому файлу
 */
export async function safelyLoadTestFile(filePath: string) {
  try {
    if (!fileExists(filePath)) {
      logger.warn(`Тестовый файл не найден: ${filePath}`);
      return null;
    }
    
    const module = await importModule(filePath);
    return normalizeTestModule(module);
  } catch (error) {
    logger.error(`Ошибка при загрузке тестового файла ${filePath}: ${error}`);
    return null;
  }
} 