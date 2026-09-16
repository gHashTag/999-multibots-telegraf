import { createLogger, format, transports } from 'winston'
import Transport from 'winston-transport'

import path from 'path'
import fs from 'fs'

import { redactBotToken } from './redactBotToken'
import {
  decide,
  fingerprint,
  withSuppressedCount,
  type ThrottleState,
} from './alertThrottle'

/**
 * Custom Winston Transport для отправки ошибок в Telegram группу НейроМентор
 */
/** Routed by the transport itself; everything else in `meta` IS the detail. */
const ROUTED_META_KEYS = new Set([
  'context',
  'function',
  'telegramId',
  'telegram_id',
  'username',
  'botName',
  'bot_name',
])
const ALERT_DETAILS_MAX = 1200

/**
 * WHAT A CUSTOMER WROTE IS NOT A DIAGNOSTIC.
 *
 * 2026-09-15 08:56: one person's transform failed for want of four stars, and
 * the fourth alert of that incident carried their entire creative prompt into
 * the owner's Telegram group -- because `generateFluxKontext` passes
 * `prompt: params.prompt` in its catch-all meta, and everything in meta is
 * rendered. Roughly two hundred and fifty `logger.error` sites feed this one
 * function; fixing them one at a time is a list that is never finished, so the
 * rule lives here, at the choke point, where a new site inherits it.
 *
 * The length is kept, because the length is the only part an operator can use
 * ("the prompt was empty" is a real diagnosis; the prompt itself never is).
 */
const CONTENT_META_KEYS = new Set([
  'prompt',
  'originalPrompt',
  'negativePrompt',
  'promptText',
  'userPrompt',
  'eventData',
  'body',
  'rawBody',
  'requestBody',
  'callbackBody',
])

/**
 * No single value may eat the whole alert.
 *
 * The cap below was on the finished blob only, so one long value truncated
 * every key after it off the end -- the status code, the provider's answer, the
 * model. A per-value ceiling keeps the facts an operator needs in the message
 * even when something upstream logs a novel.
 */
const ALERT_VALUE_MAX = 300

/** `<prompt: 412 chars>` -- the size, never the content. */
const summarise = (label: string, length: number) =>
  `<${label}: ${length} chars>`

function renderValue(key: string, v: unknown): unknown {
  if (v instanceof Error)
    return `${v.message}${v.stack ? `\n${v.stack.split('\n').slice(1, 4).join('\n')}` : ''}`
  if (Buffer.isBuffer(v)) return `<Buffer ${v.length} bytes>`

  if (typeof v === 'string') {
    if (CONTENT_META_KEYS.has(key)) return summarise(key, v.length)
    return v.length > ALERT_VALUE_MAX
      ? `${v.slice(0, ALERT_VALUE_MAX)}…(+${v.length - ALERT_VALUE_MAX} chars)`
      : v
  }
  if (v === null || typeof v !== 'object') return v

  // An object under a content key, or any object big enough to crowd out the
  // rest of the alert, is reported by shape and size.
  let serialised: string
  try {
    serialised = JSON.stringify(v) ?? ''
  } catch {
    return '<unserialisable>'
  }
  if (CONTENT_META_KEYS.has(key)) return summarise(key, serialised.length)
  return serialised.length > ALERT_VALUE_MAX
    ? summarise(Array.isArray(v) ? `${key}[]` : key, serialised.length)
    : v
}

/**
 * REDACTION BELONGS TO THE ALERT, NOT TO ONE HALF OF IT.
 *
 * This was three chained `.replace` calls at the end of `detailsForAlert`, so
 * it scrubbed the meta blob and nothing else -- while the MESSAGE, which is the
 * part that always reaches Telegram, went out verbatim. That is not a
 * theoretical gap: 23 alert titles in this repository are template literals
 * built from a provider's own error text
 *
 *   `❌ Ошибка ${endpoint}: ${response.status} - ${errorText}`
 *   `Ошибка при получении ботов из Supabase: ${error.message}`
 *
 * and an upstream 401 body routinely quotes back the key it rejected. The
 * owner's alert group is an ordinary Telegram group with ordinary members.
 *
 * Named and exported so both halves use the same rule and a test can hold it.
 */
export function redactSecrets(text: string): string {
  return redactBotToken(text)
    .replace(/\b\d{8,10}:[A-Za-z0-9_-]{30,}/g, '<bot token>')
    .replace(/\b(sk|xai|r8|ghp|glpat|sk-proj)[-_][A-Za-z0-9_-]{6,}/g, '<key>')
}

/**
 * The owner's alert used to carry only the message title -- the `meta` object
 * with the status code, the provider's error text, the model, the stack was
 * dropped on the floor. "[answerAi] xAI Grok API error" reached the owner; the
 * 400 and "Model not found: grok-2-latest" did not. Render the remaining meta
 * as compact JSON, redact bot tokens and API keys, cap the size.
 */
export function detailsForAlert(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (ROUTED_META_KEYS.has(k) || v === undefined) continue
    rest[k] = renderValue(k, v)
  }
  if (Object.keys(rest).length === 0) return undefined
  let text: string
  try {
    text = JSON.stringify(rest, null, 1)
  } catch {
    text = String(rest)
  }
  text = redactSecrets(text)
  return text.length > ALERT_DETAILS_MAX
    ? `${text.slice(0, ALERT_DETAILS_MAX)}…`
    : text
}

class TelegramLogTransport extends Transport {
  private telegramLogService: any = null
  private isInitialized = false
  private pendingLogs: Array<{ level: string; message: string; meta: any }> = []
  /** One incident is one message: repeats are counted, not resent. */
  private seen = new Map<string, ThrottleState>()

  constructor(opts?: Transport.TransportStreamOptions) {
    super(opts)
    // Ленивая инициализация для избежания циклических зависимостей
    this.initService()
  }

  private async initService() {
    try {
      // Динамический импорт чтобы избежать циклической зависимости
      const { telegramLogService } = await import(
        '@/services/telegram-log.service'
      )
      this.telegramLogService = telegramLogService
      this.isInitialized = true

      // Отправляем накопленные логи
      for (const log of this.pendingLogs) {
        this.sendToTelegram(log.level, log.message, log.meta)
      }
      this.pendingLogs = []
    } catch (err) {
      // Сервис ещё не доступен - это нормально при старте
    }
  }

  private async sendToTelegram(level: string, message: string, meta: any) {
    if (!this.telegramLogService?.isReady()) return

    try {
      await this.telegramLogService.logError({
        // Both halves, one rule. The message used to skip this entirely.
        error: redactSecrets(message),
        context: meta?.context || meta?.function || 'logger.error',
        telegramId: meta?.telegramId || meta?.telegram_id,
        username: meta?.username,
        botName: meta?.botName || meta?.bot_name,
        details: detailsForAlert(meta),
      })
    } catch {
      // Игнорируем ошибки отправки чтобы не создавать бесконечный цикл
    }
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit('logged', info)
    })

    const message = info.message || ''

    // Отправляем только error уровень И исключаем собственные логи
    // чтобы избежать рекурсии
    const isOwnLog =
      message.includes('[TelegramLog]') ||
      message.includes('[TelegramLogService]') ||
      message.includes('Failed to send log to Telegram')

    if (info.level === 'error' && !isOwnLog) {
      const meta = { ...info }
      delete meta.level
      delete meta.message
      delete meta.timestamp

      /*
       * THE THROTTLE LIVES HERE, NOT AT THIRTEEN CALL SITES.
       *
       * Every alert to the owner passes through this one function, so a rule
       * here cannot be forgotten by whoever writes the next logger.error --
       * and about 250 error sites were never classified. Nothing is dropped
       * silently: the repeats are counted and the next message that gets
       * through says how many were held back.
       */
      const verdict = decide(
        this.seen,
        fingerprint(message, meta?.context || meta?.function),
        Date.now()
      )
      if (!verdict.send) {
        callback()
        return
      }
      const text = withSuppressedCount(message, verdict.suppressed)

      if (this.isInitialized) {
        this.sendToTelegram(info.level, text, meta)
      } else {
        // Сохраняем для отправки после инициализации (max 50)
        if (this.pendingLogs.length < 50) {
          this.pendingLogs.push({ level: info.level, message: text, meta })
        }
      }
    }

    callback()
  }
}

// Создаём глобальный экземпляр транспорта
const telegramTransport = new TelegramLogTransport({ level: 'error' })

// Создаем директорию для логов, если её нет
const logDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// Создаем директорию для логов безопасности
const securityLogsDir = path.join(logDir, 'security')
if (!fs.existsSync(securityLogsDir)) {
  fs.mkdirSync(securityLogsDir, { recursive: true })
}

// Общий формат для всех логгеров
const commonFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.printf(({ level, message, timestamp, stack, ...rest }) => {
    const restString = Object.keys(rest).length
      ? ` ${JSON.stringify(rest)}`
      : ''
    const line = `${timestamp} [${level.toUpperCase()}]: ${message}${
      stack ? `\n${stack}` : ''
    }${restString}`
    // Systemic guard: strip any Telegram bot token embedded in a file URL from
    // the rendered line, wherever it sits (message, meta, or stack). This makes
    // the whole logger.* surface safe by construction; the two console.log sites
    // that bypass the logger call redactBotToken directly.
    return redactBotToken(line)
  })
)

// Определяем базовые транспорты (консоль + telegram для ошибок)
// Указываем тип any[], чтобы разрешить разные транспорты
const baseTransports: any[] = [
  new transports.Console(),
  telegramTransport, // 📨 Отправка ошибок в группу НейроМентор
]

// Добавляем файловые транспорты только если не режим теста
if (process.env.NODE_ENV !== 'test') {
  baseTransports.push(
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new transports.File({
      filename: path.join(logDir, 'combined.log'),
    })
  )
}

// Основной логгер приложения
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: commonFormat,
  transports: baseTransports, // Используем сформированный массив транспортов
})

// Логгер для ботов с дополнительным контекстом имени бота
export const botLogger = {
  info: (botName: string, message: string, meta?: Record<string, any>) => {
    logger.info(`[${botName}] ${message}`, meta)
  },
  warn: (botName: string, message: string, meta?: Record<string, any>) => {
    logger.warn(`[${botName}] ${message}`, meta)
  },
  error: (botName: string, message: string, meta?: Record<string, any>) => {
    logger.error(`[${botName}] ${message}`, meta)
  },
  debug: (botName: string, message: string, meta?: Record<string, any>) => {
    logger.debug(`[${botName}] ${message}`, meta)
  },
}

// Определяем транспорты для логгера безопасности
// Указываем тип any[], чтобы разрешить разные транспорты
const securityTransports: any[] = []

// Добавляем файловые транспорты только если не режим теста
if (process.env.NODE_ENV !== 'test') {
  securityTransports.push(
    new transports.File({
      filename: path.join(securityLogsDir, 'security.log'),
    }),
    // Критические проблемы безопасности также идут в основной лог ошибок
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    })
  )
}

// Если мы не в продакшене И не в тесте, также выводим логи безопасности в консоль
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  // Добавляем Console транспорт, если его еще нет
  if (!securityTransports.some(t => t instanceof transports.Console)) {
    securityTransports.push(
      new transports.Console({
        format: format.combine(format.colorize(), format.simple()),
      })
    )
  }
}

// Логгер безопасности для отслеживания подозрительной активности
export const securityLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json()
  ),
  defaultMeta: { service: 'security' },
  transports: securityTransports, // Используем сформированный массив транспортов
})

// Хелпер для логирования попыток неавторизованного доступа
export const logSecurityEvent = (
  eventType: string,
  details: Record<string, any>,
  severity: 'info' | 'warn' | 'error' = 'warn'
) => {
  securityLogger[severity](`Событие безопасности: ${eventType}`, {
    ...details,
    timestamp: new Date().toISOString(),
    eventType,
  })
}

// Функция для безопасного логирования session без Buffer данных
export const logSessionSafely = (session: any, label?: string) => {
  const safeCopy = { ...session }

  // Удаляем или заменяем Buffer объекты безопасными представлениями
  if (safeCopy.images && Array.isArray(safeCopy.images)) {
    safeCopy.images = safeCopy.images.map((img: any, index: number) => ({
      filename: img.filename || `image_${index}`,
      bufferSize: img.buffer?.length || 0,
      hasBuffer: !!img.buffer,
    }))
  }

  // Удаляем другие потенциально большие объекты
  if (safeCopy.userModel && typeof safeCopy.userModel === 'object') {
    safeCopy.userModel = {
      ...safeCopy.userModel,
      // Сохраняем только основные поля, исключая потенциально большие данные
      model_url: safeCopy.userModel.model_url,
      trigger_word: safeCopy.userModel.trigger_word,
      model_id: safeCopy.userModel.model_id,
    }
  }

  logger.info(label || 'Session data', safeCopy)
}

// Функция для очистки объектов от Buffer данных перед логированием
const sanitizeForLogging = (obj: any, seen = new WeakSet()): any => {
  if (obj === null || obj === undefined) return obj

  if (Buffer.isBuffer(obj)) {
    return `<Buffer ${obj.length} bytes>`
  }

  if (obj instanceof Uint8Array) {
    return `<Uint8Array ${obj.length} bytes>`
  }

  if (Array.isArray(obj)) {
    // Защита от циклических ссылок
    if (seen.has(obj)) {
      return '<Circular Array Reference>'
    }
    seen.add(obj)

    // Проверяем, есть ли в массиве Buffer или большие данные
    if (obj.length > 100) {
      return `<Array ${obj.length} items (truncated for logging)>`
    }
    return obj.map(item => sanitizeForLogging(item, seen))
  }

  if (typeof obj === 'object') {
    // Защита от циклических ссылок
    if (seen.has(obj)) {
      return '<Circular Object Reference>'
    }
    seen.add(obj)

    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'images' && Array.isArray(value)) {
        sanitized[key] = value.map((img: any, index: number) => ({
          filename: img.filename || `image_${index}`,
          bufferSize: img.buffer?.length || 0,
          hasBuffer: !!img.buffer,
        }))
      } else {
        sanitized[key] = sanitizeForLogging(value, seen)
      }
    }
    return sanitized
  }

  return obj
}

// Безопасная версия console.log
export const safeConsoleLog = (...args: any[]) => {
  const sanitizedArgs = args.map(arg => sanitizeForLogging(arg))
  console.log(...sanitizedArgs)
}

// Настройка безопасного логирования консоли (опционально)
export const setupSafeConsoleLogging = () => {
  const originalConsoleLog = console.log

  console.log = (...args: any[]) => {
    const sanitizedArgs = args.map(arg => sanitizeForLogging(arg))
    originalConsoleLog(...sanitizedArgs)
  }

  logger.info('Safe console logging enabled - Buffer data will be sanitized')
}

export default logger
