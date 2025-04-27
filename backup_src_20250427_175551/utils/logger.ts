import { createLogger, format, transports } from 'winston'

import path from 'path'
// Используем стандартный модуль fs
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

// Улучшенный формат для вывода метаданных и объектов
const prettyJson = format(info => {
  const { timestamp, level, message, ...rest } = info

  // Форматируем дополнительные метаданные
  const formatMetadata = (obj: Record<string, any>, indent = 2): string => {
    if (!obj || Object.keys(obj).length === 0) return ''

    let result = ''
    for (const [key, value] of Object.entries(obj)) {
      // Пропускаем stack, так как он будет обработан отдельно
      if (key === 'stack') continue

      // Форматируем ключ
      result += ' '.repeat(indent) + `${key}: `

      // Обрабатываем разные типы значений
      if (value === null) {
        result += 'null\n'
      } else if (value === undefined) {
        result += 'undefined\n'
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Рекурсивно форматируем вложенные объекты
        result += '\n' + formatMetadata(value, indent + 2)
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          result += '[]\n'
        } else {
          result += '[\n'
          value.forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              result +=
                ' '.repeat(indent + 2) +
                `${index}: \n` +
                formatMetadata(item, indent + 4)
            } else {
              result += ' '.repeat(indent + 2) + `${index}: ${String(item)}\n`
            }
          })
          result += ' '.repeat(indent) + ']\n'
        }
      } else {
        // Простые типы данных
        result += `${String(value)}\n`
      }
    }
    return result
  }

  return { ...info, formattedMetadata: formatMetadata(rest) }
})

// Общий формат для всех логгеров
const commonFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  prettyJson(),
  format.printf(({ level, message, timestamp, stack, formattedMetadata }) => {
    // Эмодзи для разных уровней логов
    const levelEmoji =
      {
        error: '❌',
        warn: '⚠️',
        info: 'ℹ️',
        debug: '🔍',
        verbose: '📝',
        silly: '🤪',
      }[level] || ''

    return `${timestamp} ${levelEmoji} [${level.toUpperCase()}]: ${message}${
      stack ? `\n${'='.repeat(80)}\n${stack}\n${'='.repeat(80)}` : ''
    }${formattedMetadata ? `\n${formattedMetadata}` : ''}`
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

export default logger
