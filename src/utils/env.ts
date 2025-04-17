/**
 * Утилиты для работы с переменными окружения
 */

/**
 * Проверяет, должен ли бот запускаться в режиме webhook
 * @returns true, если бот должен использовать webhook, false для long polling
 */
export function isWebhookEnv(): boolean {
  // Проверяем наличие переменных окружения для webhook
  const webhookDomain = process.env.WEBHOOK_DOMAIN
  const nodeEnv = process.env.NODE_ENV || 'development'

  // В production или при наличии домена используем webhook
  return nodeEnv === 'production' || !!webhookDomain
}

/**
 * Получает значение переменной окружения, приводя её к числу
 * @param name Имя переменной окружения
 * @param defaultValue Значение по умолчанию
 * @returns Числовое значение переменной или значение по умолчанию
 */
export function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name]
  if (!value) return defaultValue

  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Получает значение переменной окружения как boolean
 * @param name Имя переменной окружения
 * @param defaultValue Значение по умолчанию
 * @returns Boolean значение переменной или значение по умолчанию
 */
export function getEnvBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]
  if (!value) return defaultValue

  // Строки, которые считаются true
  return ['true', 'yes', '1', 'y'].includes(value.toLowerCase())
}

/**
 * Получает значение переменной окружения как строку
 * @param name Имя переменной окружения
 * @param defaultValue Значение по умолчанию
 * @returns Строковое значение переменной или значение по умолчанию
 */
export function getEnvString(name: string, defaultValue: string = ''): string {
  return process.env[name] || defaultValue
}

/**
 * Проверяет, находится ли приложение в режиме разработки
 * @returns true в режиме разработки, false в production
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/**
 * Проверяет, находится ли приложение в production режиме
 * @returns true в production, false в режиме разработки
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}
