import { createLogger, format, transports } from 'winston'

import path from 'path'
import fs from 'fs'

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
    return `${timestamp} [${level.toUpperCase()}]: ${message}${
      stack ? `\n${stack}` : ''
    }${restString}`
  })
)

// Определяем базовые транспорты (консоль)
// Указываем тип any[], чтобы разрешить разные транспорты
const baseTransports: any[] = [new transports.Console()]

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
