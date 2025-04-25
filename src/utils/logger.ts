import { createLogger, format, transports } from 'winston'

import path from 'path'
import * as fs from 'fs'

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
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'neuroblogger-bot' },
  transports: [
    // Логи уровня 'error' и ниже отправляются в 'error.log'
    new transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    // Все логи отправляются в 'combined.log'
    new transports.File({ filename: path.join(logDir, 'combined.log') }),
  ],
})

// Если мы не в production, то также выводим логи в консоль с форматированием
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(
          (info) => `${info.timestamp} ${info.level}: ${info.message}`
        )
      ),
    })
  )
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
