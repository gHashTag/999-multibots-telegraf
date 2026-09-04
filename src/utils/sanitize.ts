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
 * SSRF host blocklist: localhost, private/link-local IPv4, and loopback/private
 * IPv6 (incl. 169.254.169.254 cloud metadata, and IPv4-mapped IPv6 which Node
 * renders in hex). Single source of truth, shared by sanitizeUrl (the incoming
 * host) and assertPublicRedirect (each redirect hop).
 */
const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/,
  /\.localhost$/,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^::$/,
  /^::ffff:7f[0-9a-f]{2}:/,
  /^::ffff:a9fe:/,
  /^fe80:/,
  /^f[cd][0-9a-f]{2}:/,
]

/**
 * True if hostname is a localhost/private/link-local address that must never be
 * the target of a server-side fetch. Normalizes case and strips IPv6 brackets.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  return PRIVATE_HOST_PATTERNS.some(pattern => pattern.test(h))
}

/**
 * axios `beforeRedirect` guard: re-check EVERY redirect hop against the same
 * blocklist. sanitizeUrl only vets the original host; a public URL can 302 to
 * 169.254.169.254 / 127.0.0.1, so each hop must be re-validated. Throws to abort
 * the download when the next hop is private/local.
 */
export function assertPublicRedirect(options: {
  hostname?: string | null
  host?: string | null
}): void {
  let host = (options?.hostname || '').toString()
  if (!host && options?.host) {
    const h = options.host.toString()
    // host may carry a port: [ipv6]:port or ipv4:port
    host = h.startsWith('[')
      ? h.slice(1, h.indexOf(']'))
      : h.replace(/:\d+$/, '')
  }
  // Refuse when the next hop cannot be identified, rather than allowing it.
  //
  // This read `if (host && isPrivateHost(host)) throw`, so an options object
  // carrying neither hostname nor host fell through and the redirect was
  // FOLLOWED. The whole job of this function is to block, and absence of the
  // value meant do-not-block: a guard that fails open on missing input.
  //
  // follow-redirects always populates one of the two for a real hop, so this
  // refuses nothing that occurs today; it removes the case where a hop nobody
  // could name was permitted.
  if (!host) {
    throw new Error('SSRF: redirect with an unidentifiable host blocked')
  }

  if (isPrivateHost(host)) {
    throw new Error('SSRF: redirect to private/local address blocked')
  }
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

    // SSRF guard: reject localhost/private/link-local hosts (incl. 169.254
    // cloud metadata + IPv4-mapped IPv6). Applied ALWAYS: a dev bot can be
    // tunnel-exposed and the only caller passes a user-typed URL. Shared
    // blocklist with the redirect-hop guard (assertPublicRedirect).
    if (isPrivateHost(parsed.hostname)) {
      throw new Error('Private/local URLs not allowed')
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
