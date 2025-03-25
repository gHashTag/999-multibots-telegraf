interface LogData {
  description: string
  [key: string]: any
}

export const logger = {
  log(message: string, data?: LogData) {
    console.log(`🔍 ${message}`, data ? { ...data } : '')
  },

  error(message: string, data?: LogData) {
    console.error(`❌ ${message}`, data ? { ...data } : '')
  },

  warn(message: string, data?: LogData) {
    console.warn(`⚠️ ${message}`, data ? { ...data } : '')
  },

  info(message: string, data?: LogData) {
    console.info(`ℹ️ ${message}`, data ? { ...data } : '')
  },

  debug(message: string, data?: LogData) {
    console.debug(`🔧 ${message}`, data ? { ...data } : '')
  },

  success(message: string, data?: LogData) {
    console.log(`✅ ${message}`, data ? { ...data } : '')
  },
}
