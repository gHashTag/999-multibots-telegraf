import { createLogger, format, transports } from 'winston'
// @ts-ignore - winston-daily-rotate-file doesn't have proper types
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import fs from 'fs'
import { performance } from 'perf_hooks'
import { randomUUID } from 'crypto'

// Создаем директорию для логов
const logDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// Создаем директорию для логов безопасности
const securityLogsDir = path.join(logDir, 'security')
if (!fs.existsSync(securityLogsDir)) {
  fs.mkdirSync(securityLogsDir, { recursive: true })
}

// Расширенный интерфейс для логирования
interface EnhancedLogContext {
  correlationId?: string
  telegramId?: string
  userId?: string
  botUsername?: string
  service?: string
  operation?: string
  duration?: number
  metadata?: Record<string, any>
  tags?: string[]
}

// Формат для структурированных логов
const structuredFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
)

// Формат для консоли (readable)
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(
    ({
      timestamp,
      level,
      message,
      correlationId,
      service,
      operation,
      telegramId,
      ...rest
    }) => {
      const correlation = correlationId
        ? `[${String(correlationId).slice(0, 8)}]`
        : ''
      const context =
        service || operation || telegramId
          ? `[${[service, operation, telegramId].filter(Boolean).join('|')}]`
          : ''
      const metadata =
        Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest, null, 0)}` : ''

      return `${timestamp} ${level}${correlation}${context}: ${message}${metadata}`
    }
  )
)

// Настройка ротации логов
const createRotateTransport = (filename: string, level?: string) => {
  return new DailyRotateFile({
    filename: path.join(logDir, `${filename}-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    level,
    format: structuredFormat,
    auditFile: path.join(logDir, `${filename}-audit.json`),
  })
}

// Транспорты
const logTransports: any[] = []

// Консоль (только в development)
if (process.env.NODE_ENV !== 'production') {
  logTransports.push(
    new transports.Console({
      format: consoleFormat,
    })
  )
}

// Файлы (только не в тестах)
if (process.env.NODE_ENV !== 'test') {
  logTransports.push(
    createRotateTransport('app', 'info'),
    createRotateTransport('error', 'error')
  )

  // Добавляем специальный транспорт для логов безопасности
  logTransports.push(
    new DailyRotateFile({
      filename: path.join(securityLogsDir, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      level: 'warn',
      format: structuredFormat,
      auditFile: path.join(securityLogsDir, 'security-audit.json'),
    })
  )
}

// Создание основного логгера
const baseLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: logTransports,
  // Не падать при ошибках логирования
  exitOnError: false,
})

/**
 * Расширенный логгер с дополнительными возможностями
 */
export class EnhancedLogger {
  private correlationId?: string
  private context: Partial<EnhancedLogContext>

  constructor(context: Partial<EnhancedLogContext> = {}) {
    this.context = context
    this.correlationId = context.correlationId || randomUUID()
  }

  /**
   * Создает дочерний логгер с дополнительным контекстом
   */
  child(additionalContext: Partial<EnhancedLogContext>): EnhancedLogger {
    return new EnhancedLogger({
      ...this.context,
      ...additionalContext,
      correlationId: this.correlationId,
    })
  }

  /**
   * Логирует с временными метками
   */
  timed<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    const operationLogger = this.child({ operation })

    operationLogger.info(`Starting ${operation}`)

    return fn()
      .then(result => {
        const duration = performance.now() - start
        operationLogger.info(`Completed ${operation}`, {
          duration: Math.round(duration),
        })
        return result
      })
      .catch(error => {
        const duration = performance.now() - start
        operationLogger.error(`Failed ${operation}`, {
          error: error.message,
          duration: Math.round(duration),
        })
        throw error
      })
  }

  private log(level: string, message: string, meta: any = {}) {
    baseLogger.log(level, message, {
      correlationId: this.correlationId,
      ...this.context,
      ...meta,
      timestamp: new Date().toISOString(),
    })
  }

  debug(message: string, meta?: any) {
    this.log('debug', message, meta)
  }

  info(message: string, meta?: any) {
    this.log('info', message, meta)
  }

  warn(message: string, meta?: any) {
    this.log('warn', message, meta)
  }

  error(message: string, meta?: any) {
    this.log('error', message, meta)
  }

  security(message: string, meta?: any) {
    this.log('warn', `[SECURITY] ${message}`, { ...meta, security: true })
  }
}

// Глобальный логгер для обратной совместимости
export const enhancedLogger = new EnhancedLogger()

// Экспорт старого API для совместимости
export const logger = {
  debug: (message: string, meta?: any) => enhancedLogger.debug(message, meta),
  info: (message: string, meta?: any) => enhancedLogger.info(message, meta),
  warn: (message: string, meta?: any) => enhancedLogger.warn(message, meta),
  error: (message: string, meta?: any) => enhancedLogger.error(message, meta),
  security: (message: string, meta?: any) =>
    enhancedLogger.security(message, meta),
}

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

// Создаем отдельный логгер безопасности
const securityTransports: any[] = []

if (process.env.NODE_ENV !== 'test') {
  securityTransports.push(
    new DailyRotateFile({
      filename: path.join(securityLogsDir, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: structuredFormat,
      auditFile: path.join(securityLogsDir, 'security-audit.json'),
    }),
    // Критические проблемы безопасности также идут в основной лог ошибок
    createRotateTransport('error', 'error')
  )
}

// В development режиме выводим в консоль
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  securityTransports.push(
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    })
  )
}

// Логгер безопасности для отслеживания подозрительной активности
export const securityLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json()
  ),
  defaultMeta: { service: 'security' },
  transports: securityTransports,
  exitOnError: false,
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
