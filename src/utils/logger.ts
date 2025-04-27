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

// --- ВРЕМЕННАЯ ЗАГЛУШКА WINSTON ---
const consoleLogger = {
  info: (...args: any[]) => console.log('INFO:', ...args),
  warn: (...args: any[]) => console.warn('WARN:', ...args),
  error: (...args: any[]) => console.error('ERROR:', ...args),
  debug: (...args: any[]) => console.debug('DEBUG:', ...args),
}

export const logger = consoleLogger

export const botLogger = {
  info: (botName: string, message: string, meta?: Record<string, any>) => {
    console.log(`INFO: [${botName}] ${message}`, meta || '')
  },
  warn: (botName: string, message: string, meta?: Record<string, any>) => {
    console.warn(`WARN: [${botName}] ${message}`, meta || '')
  },
  error: (botName: string, message: string, meta?: Record<string, any>) => {
    console.error(`ERROR: [${botName}] ${message}`, meta || '')
  },
  debug: (botName: string, message: string, meta?: Record<string, any>) => {
    console.debug(`DEBUG: [${botName}] ${message}`, meta || '')
  },
}

export const securityLogger = {
  info: (...args: any[]) => console.log('SEC_INFO:', ...args),
  warn: (...args: any[]) => console.warn('SEC_WARN:', ...args),
  error: (...args: any[]) => console.error('SEC_ERROR:', ...args),
  debug: (...args: any[]) => console.debug('SEC_DEBUG:', ...args),
}

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
// --- КОНЕЦ ВРЕМЕННОЙ ЗАГЛУШКИ ---

/* // --- ОРИГИНАЛЬНЫЙ КОД WINSTON (ЗАКОММЕНТИРОВАНО) --- 
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

const commonFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  prettyJson,
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

const baseTransports: any[] = [new transports.Console()]

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

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: commonFormat,
  transports: baseTransports,
})

export const botLogger = { ... }; // Определен выше в заглушке

const securityTransports: any[] = []

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

export const securityLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json()
  ),
  defaultMeta: { service: 'security' },
  transports: securityTransports,
})

export const logSecurityEvent = ( ... ); // Определен выше в заглушке

export default logger;
--- КОНЕЦ ОРИГИНАЛЬНОГО КОДА --- */
