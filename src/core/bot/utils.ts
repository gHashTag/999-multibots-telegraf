import logger from '../../utils/logger'

/**
 * Результат валидации токена
 */
export interface TokenValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Проверяет валидность токена бота
 * @param token Токен для проверки
 * @returns Результат валидации
 */
export function validateToken(token: string): TokenValidationResult {
  if (!token) {
    return { isValid: false, error: 'Токен не может быть пустым' }
  }

  if (token.length < 20) {
    return { isValid: false, error: 'Токен слишком короткий' }
  }

  // Проверяем формат токена (примерная проверка)
  // Формат должен быть: числа:буквы-цифры
  const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/
  if (!tokenRegex.test(token)) {
    return { isValid: false, error: 'Неверный формат токена' }
  }

  return { isValid: true }
}

/**
 * Маскирует токен для безопасного логирования
 * @param token Токен для маскирования
 * @returns Маскированный токен
 */
export function maskToken(token: string): string {
  if (!token) return 'empty'

  const parts = token.split(':')
  if (parts.length !== 2) return `${token.slice(0, 6)}...${token.slice(-4)}`

  const [botId, secret] = parts

  if (secret.length <= 8) {
    return `${botId}:xxx`
  }

  return `${botId}:${secret.slice(0, 4)}...${secret.slice(-4)}`
}

/**
 * Логирует событие безопасности
 * @param eventType Тип события
 * @param data Данные события
 * @param level Уровень логирования
 */
export function logSecurityEvent(
  eventType: string,
  data: Record<string, any>,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const logMessage = `Событие безопасности [${eventType}]: ${JSON.stringify(data)}`

  switch (level) {
    case 'warn':
      logger.warn(logMessage)
      break
    case 'error':
      logger.error(logMessage)
      break
    default:
      logger.info(logMessage)
  }
}
