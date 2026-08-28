/**
 * 🔒 INPUT SANITIZATION UTILITIES
 *
 * Защита от command injection и path traversal атак
 */

/**
 * Sanitize filename для использования в FFmpeg и других shell командах
 * Удаляет все символы кроме безопасных
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) {
    throw new Error('Filename cannot be empty')
  }

  // Разрешаем только буквы, цифры, точку, дефис, подчеркивание
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Защита от скрытых файлов и относительных путей
  if (sanitized.startsWith('.') || sanitized.includes('..')) {
    throw new Error('Invalid filename: hidden or relative paths not allowed')
  }

  return sanitized
}

/**
 * Sanitize path для защиты от path traversal
 * Удаляет ../ и абсолютные пути
 */
export function sanitizePath(path: string): string {
  if (!path) {
    throw new Error('Path cannot be empty')
  }

  // Удаляем ../ и абсолютные пути
  const sanitized = path
    .replace(/\.\./g, '') // Убираем ../
    .replace(/^\/+/, '') // Убираем начальные слеши
    .replace(/\/+/g, '/') // Нормализуем множественные слеши

  // Проверяем что не осталось опасных последовательностей
  if (sanitized.includes('..') || sanitized.startsWith('/')) {
    throw new Error('Invalid path: path traversal detected')
  }

  return sanitized
}

/**
 * Sanitize URL для защиты от SSRF
 * Проверяет что URL использует безопасный протокол
 */
export function sanitizeUrl(
  url: string,
  allowedProtocols: string[] = ['http', 'https']
): string {
  if (!url) {
    throw new Error('URL cannot be empty')
  }

  try {
    const parsed = new URL(url)

    // Проверяем протокол
    const protocol = parsed.protocol.replace(':', '')
    if (!allowedProtocols.includes(protocol)) {
      throw new Error(
        `Protocol ${protocol} not allowed. Allowed: ${allowedProtocols.join(', ')}`
      )
    }

    // Защита от localhost/private IPs в production
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsed.hostname.toLowerCase()
      const privatePatterns = [
        /^localhost$/,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^0\.0\.0\.0$/,
      ]

      if (privatePatterns.some(pattern => pattern.test(hostname))) {
        throw new Error('Private/local URLs not allowed in production')
      }
    }

    return parsed.toString()
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Invalid URL format')
  }
}

/**
 * Sanitize shell command argument
 * Экранирует специальные символы shell
 */
export function sanitizeShellArg(arg: string): string {
  if (!arg) {
    return '""'
  }

  // Экранируем опасные символы
  return arg
    .replace(/\\/g, '\\\\') // Backslash
    .replace(/"/g, '\\"') // Quotes
    .replace(/\$/g, '\\$') // Dollar
    .replace(/`/g, '\\`') // Backtick
    .replace(/!/g, '\\!') // Exclamation
    .replace(/\|/g, '\\|') // Pipe
    .replace(/&/g, '\\&') // Ampersand
    .replace(/;/g, '\\;') // Semicolon
    .replace(/</g, '\\<') // Less than
    .replace(/>/g, '\\>') // Greater than
}

/**
 * Validate Telegram user ID
 * Должен быть только числом
 */
export function validateTelegramId(id: string | number): number {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id

  if (!Number.isInteger(numId) || numId <= 0) {
    throw new Error('Invalid Telegram ID: must be positive integer')
  }

  return numId
}

/**
 * Validate bot token format
 * Формат: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
 */
export function validateBotToken(token: string): string {
  const tokenPattern = /^[0-9]{8,10}:[A-Za-z0-9_-]{35,}$/

  if (!tokenPattern.test(token)) {
    throw new Error('Invalid bot token format')
  }

  return token
}
