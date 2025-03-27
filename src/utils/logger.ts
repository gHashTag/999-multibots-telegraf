import { existsSync, mkdirSync } from 'fs'
import winston from 'winston'
import morgan from 'morgan'
import { isDev } from '@/config'

// interface LogData {
//   description: string
//   [key: string]: any
// }

// export const logger = {
//   log(message: string, data?: LogData) {
//     console.log(`🔍 ${message}`, data ? { ...data } : '')
//   },

//   error(message: string, data?: LogData) {
//     console.error(`❌ ${message}`, data ? { ...data } : '')
//   },

//   warn(message: string, data?: LogData) {
//     console.warn(`⚠️ ${message}`, data ? { ...data } : '')
//   },

//   info(message: string, data?: LogData) {
//     console.info(`ℹ️ ${message}`, data ? { ...data } : '')
//   },

//   debug(message: string, data?: LogData) {
//     console.debug(`🔧 ${message}`, data ? { ...data } : '')
//   },

//   success(message: string, data?: LogData) {
//     console.log(`✅ ${message}`, data ? { ...data } : '')
//   },
// }




const logDir = process.env.LOG_DIR || '/tmp/logs'

if (!existsSync(logDir)) {
  try {
    mkdirSync(logDir, { recursive: true })
  } catch (error) {
    console.warn(`Unable to create log directory: ${error.message}`)
  }
}

// Установите уровень логирования через переменную окружения
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info')
// Создаем логгер
const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: `${logDir}/combined.log` }),
  ],
})

// Использование logger
logger.info('Server started')
logger.error('Error occurred')

// Создаем разные форматы логирования
const morganDev = morgan('dev', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
})

const morganCombined = morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
})

// Экспортируем функцию для динамического выбора формата
const getDynamicLogger = (format = 'dev') => {
  return format === 'combined' ? morganCombined : morganDev
}

export { logger, getDynamicLogger }

