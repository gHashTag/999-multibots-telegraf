import { createLogger, format, transports } from 'winston'
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
  format.printf(({ timestamp, level, message, correlationId, service, operation, telegramId, ...rest }) => {
    const correlation = correlationId ? `[${correlationId.slice(0, 8)}]` : ''
    const context = service || operation || telegramId ? 
      `[${[service, operation, telegramId].filter(Boolean).join('|')}]` : ''
    const metadata = Object.keys(rest).length > 0 ? 
      ` ${JSON.stringify(rest, null, 0)}` : ''
    
    return `${timestamp} ${level}${correlation}${context}: ${message}${metadata}`
  })
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
    auditFile: path.join(logDir, `${filename}-audit.json`)
  })
}

// Транспорты
const logTransports: any[] = []

// Консоль (только в development)
if (process.env.NODE_ENV !== 'production') {
  logTransports.push(
    new transports.Console({
      format: consoleFormat
    })
  )
}

// Файлы (только не в тестах)
if (process.env.NODE_ENV !== 'test') {
  logTransports.push(
    createRotateTransport('app', 'info'),
    createRotateTransport('error', 'error'),
    createRotateTransport('security', 'warn')
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
      correlationId: this.correlationId
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
      .then((result) => {
        const duration = performance.now() - start
        operationLogger.info(`Completed ${operation}`, { duration: Math.round(duration) })
        return result
      })
      .catch((error) => {
        const duration = performance.now() - start
        operationLogger.error(`Failed ${operation}`, { 
          error: error.message,
          duration: Math.round(duration)
        })
        throw error
      })
  }

  private log(level: string, message: string, meta: any = {}) {
    baseLogger.log(level, message, {
      correlationId: this.correlationId,
      ...this.context,
      ...meta,
      timestamp: new Date().toISOString()
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
  security: (message: string, meta?: any) => enhancedLogger.security(message, meta)
}

export default logger