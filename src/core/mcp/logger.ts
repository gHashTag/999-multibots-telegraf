import winston from 'winston'
import path from 'path'

const logDir = path.join(__dirname, '../../../logs')

// Создаем форматтер для логов
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
)

// Создаем логгер
export const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    // Записываем все логи с уровнем info и выше в файл
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log')
    }),
    // Выводим в консоль в development режиме
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
})

// Создаем директорию для логов, если её нет
import fs from 'fs'
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// Экспортируем интерфейс логгера для типизации
export interface Logger {
  info(message: string, meta?: any): void
  error(message: string, meta?: any): void
  warn(message: string, meta?: any): void
  debug(message: string, meta?: any): void
} 