/**
 * 🎯 МОДУЛЬ НАВИГАЦИИ
 * 
 * Централизованное управление навигацией бота:
 * - Конфигурация кнопок и категорий
 * - Middleware для перехвата навигации
 * - Безопасные переходы между сценами
 * - Логирование и отладка навигации
 * - Защита от проблем в глубоких сценах
 * - Права доступа
 * 
 * @example
 * // Показать главное меню
 * import { showMainMenu, navigateToMainMenu } from '@/navigation'
 * await showMainMenu(ctx)
 * 
 * @example
 * // Использование матчера кнопок
 * import { buttonMatcher } from '@/navigation'
 * const result = buttonMatcher.match(text)
 * if (result?.button.id === 'mainMenu') { ... }
 * 
 * @example
 * // Безопасный переход между сценами
 * import { safeEnterScene, goBack } from '@/navigation'
 * await safeEnterScene(ctx, ModeEnum.NeuroPhoto, { mode: ModeEnum.NeuroPhoto })
 * await goBack(ctx)
 * 
 * @example
 * // Защита сцены от проблем с навигацией
 * import { addSceneGuard } from '@/navigation'
 * const protectedScene = addSceneGuard(myScene)
 * 
 * @example
 * // Проверка прав доступа
 * import { isAdmin, getParsingAccess } from '@/navigation'
 * if (isAdmin(userId)) { ... }
 */

// ========================================
// КОНФИГУРАЦИЯ
// ========================================
export * from './config/buttons.config'
export * from './config/categories.config'
export * from './config/access.config'

// Re-export helper functions for easy access
export {
  getMainMenuText,
  getBackText,
  getCancelText,
  getHelpText
} from './config/buttons.config'

// ========================================
// НОВЫЕ КОНСТАНТЫ И УТИЛИТЫ
// ========================================
export * from './constants/access'
export * from './helpers/messages'
// Re-export specific functions for convenience
export {
  getStepSelectionMenu,
  getStepSelectionMenuV2,
  createGenerateImageKeyboard
} from './helpers/messages'

// ========================================
// MIDDLEWARE
// ========================================
export * from './middleware/buttonMatcher'
export * from './middleware/sceneGuard'

// ========================================
// HELPERS
// ========================================
export * from './helpers/sceneTransition'
export * from './helpers/navigationLogger'
export * from './helpers/menuKeyboard'

// ========================================
// RE-EXPORTS ДЛЯ УДОБСТВА
// ========================================

// Матчер кнопок
export { buttonMatcher } from './middleware/buttonMatcher'

// Переходы между сценами
export { 
  safeEnterScene, 
  goBack, 
  goToMainMenu,
  canGoBack,
  getPreviousScene,
  clearNavigationHistory
} from './helpers/sceneTransition'

// Защита сцен
export {
  addSceneGuard,
  createSceneGuardMiddleware,
  handleNavigationButton,
  debugNavigation,
  isStuckNavigation,
  forceNavigationReset
} from './middleware/sceneGuard'

// Логирование
export {
  logSceneEnter,
  logSceneLeave,
  logButtonPress,
  logCallbackQuery,
  logMainMenuReturn,
  logGoBack,
  logCancel,
  logNavigationError,
  logNavigationWarning,
  logDeepScene,
  dumpNavigationState,
  createNavigationLoggingMiddleware,
  NavigationLogLevel
} from './helpers/navigationLogger'

// Меню и клавиатуры
export {
  showMainMenu,
  showCategoryMenu,
  createMainMenuKeyboard,
  createCategoryKeyboard,
  navigateToMainMenu,
  navigateToCategory
} from './helpers/menuKeyboard'

// Права доступа
export {
  HAIM_GROUP_STAFF_IDS,
  METAMUSE_STAFF_IDS,
  SUPER_ADMIN_ID,
  getParsingAccess,
  isAdmin,
  isSuperAdmin
} from './config/access.config'

// ========================================
// MIGRATION FROM NAVIGATIONSERVICE.TS
// ========================================

// Регистрация команд и Stage
console.log('🔴🔴🔴 DIAGNOSTIC: Loading registerCommands from /navigation/registerCommands.ts')
export { registerCommands, createStage } from './registerCommands'

// Утилиты для работы с кнопками (замена levels[])
export {
  findItemByText,
  findItemByMode,
  getButtonTextsByMode,
  getCategoryButtonTexts,
  getAllButtonTexts,
  // ❌ getSpecialButtonTexts - УДАЛЕНО, используйте NAVIGATION_BUTTONS из buttons.config.ts
  getCategoryItems
} from './buttonUtils'

// Глобальная навигация (middleware)
export { registerGlobalNavigationMiddleware } from './middleware/registerGlobalNavigationMiddleware'

// ========================================
// SERVICES - Централизованные сервисы навигации
// ========================================
export {
  CancelButtonService,
  createCancelButton,
  handleCancelButton,
  cancelHelpArray
} from './services/CancelButtonService'

// ========================================
// HANDLERS - Обработчики навигации
// ========================================
export { handleHelpCancel } from './handlers/handleHelpCancel'

// ========================================
// RE-EXPORTS FROM CORE MODULES
// ========================================

// Core bot functions (needed in navigation)
export { getBotNameByToken, getBotNameByUsername, getTokenByBotName } from '@/core/bot'
