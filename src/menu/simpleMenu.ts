/**
 * ⚠️ DEPRECATED: Этот файл оставлен для обратной совместимости
 *
 * ✅ НОВЫЙ ИСТОЧНИК ПРАВДЫ: src/services/NavigationService.ts
 *
 * Все новые импорты должны быть из:
 * import { ... } from '@/services/NavigationService'
 *
 * Этот файл просто реэкспортирует из NavigationService для обратной совместимости
 */

// ✅ ПРОСТОЕ РЕШЕНИЕ: Реэкспортируем всё напрямую без алиасов
export * from '@/services/NavigationService'

// ⚠️ DEPRECATED: Эти экспорты удалены - используйте NavigationService напрямую
// Если нужны кнопки меню, используйте CATEGORIES из NavigationService
// Если нужны тексты кнопок, используйте getButtonTextsByMode() из NavigationService
