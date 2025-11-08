/**
 * ⚠️ DEPRECATED: Этот файл оставлен для обратной совместимости
 *
 * ✅ НОВЫЙ ИСТОЧНИК ПРАВДЫ: src/navigation/unified-navigation.config.ts
 *
 * Все новые импорты должны быть из:
 * import { ... } from '@/navigation/unified-navigation.config'
 *
 * Этот файл просто реэкспортирует из нового конфига для обратной совместимости
 */

// Реэкспортируем всё из единого источника правды
export * from '@/navigation/unified-navigation.config'

// Экспорты для обратной совместимости (алиасы)
import {
  NAVIGATION_BUTTONS,
  createMainMenuKeyboard,
  levels as unifiedLevels,
  HAIM_GROUP_STAFF_IDS as unifiedHaimStaff,
  METAMUSE_STAFF_IDS as unifiedMetamuseStaff,
  getParsingAccess as unifiedGetParsingAccess,
  handleMenuButtonPress as unifiedHandleMenuButtonPress,
} from '@/navigation/unified-navigation.config'

// Алиасы для старого кода
export const MAIN_MENU_BUTTONS = NAVIGATION_BUTTONS
export const mainMenu = createMainMenuKeyboard
export const simpleLevels = NAVIGATION_BUTTONS
export const simpleMainMenu = NAVIGATION_BUTTONS

// Реэкспорт констант
export const HAIM_GROUP_STAFF_IDS = unifiedHaimStaff
export const METAMUSE_STAFF_IDS = unifiedMetamuseStaff
export const getParsingAccess = unifiedGetParsingAccess
export const handleMenuButtonPress = unifiedHandleMenuButtonPress

// Реэкспорт levels
export const levels = unifiedLevels
