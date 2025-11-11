// ВРЕМЕННАЯ ЗАГЛУШКА для logger, пока не исправим 448 TypeScript ошибок
// Этот файл позволяет собрать проект без полной реализации utils/logger

export const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  debug: (...args: any[]) => console.debug('[DEBUG]', ...args),
  log: (...args: any[]) => console.log('[LOG]', ...args),
}

export function setupSafeConsoleLogging() {
  console.log('[INFO] setupSafeConsoleLogging: temporary stub, skipping setup')
}

export function logSessionSafely(...args: any[]) {
  console.log('[SESSION]', ...args)
}

export default logger
