/**
 * @deprecated Этот файл устарел. Используйте @/utils/enhancedLogger вместо него.
 * Этот файл сохранен для обратной совместимости и реэкспортирует все из enhancedLogger.
 *
 * Миграция:
 * Было: import { logger } from '@/utils/logger'
 * Стало: import { logger } from '@/utils/enhancedLogger'
 *
 * Все функции из старого logger.ts теперь доступны через enhancedLogger.ts
 */

// Реэкспортируем все из enhancedLogger для обратной совместимости
export {
  logger,
  enhancedLogger,
  EnhancedLogger,
  botLogger,
  securityLogger,
  logSecurityEvent,
  logSessionSafely,
  safeConsoleLog,
  setupSafeConsoleLogging,
} from './enhancedLogger'

export { default } from './enhancedLogger'
