interface LogData {
  description?: string
  message?: string
  [key: string]: any
}

type LogObject = {
  message: string
  [key: string]: any
}

export const logger = {
  log(message: string | LogObject, data?: LogData) {
    if (
      typeof message === 'object' &&
      message !== null &&
      'message' in message
    ) {
      console.log(`🔍 ${message.message}`, message)
      return
    }
    console.log(`🔍 ${message}`, data ? { ...data } : '')
  },

  error(message: string | LogObject, data?: LogData) {
    if (
      typeof message === 'object' &&
      message !== null &&
      'message' in message
    ) {
      console.error(`❌ ${message.message}`, message)
      return
    }
    console.error(`❌ ${message}`, data ? { ...data } : '')
  },

  warn(message: string | LogObject, data?: LogData) {
    if (
      typeof message === 'object' &&
      message !== null &&
      'message' in message
    ) {
      console.warn(`⚠️ ${message.message}`, message)
      return
    }
    console.warn(`⚠️ ${message}`, data ? { ...data } : '')
  },

  info(message: string | LogObject, data?: LogData) {
    if (
      typeof message === 'object' &&
      message !== null &&
      'message' in message
    ) {
      console.info(`ℹ️ ${message.message}`, message)
      return
    }
    console.info(`ℹ️ ${message}`, data ? { ...data } : '')
  },

  debug(message: string | LogObject, data?: LogData) {
    if (
      typeof message === 'object' &&
      message !== null &&
      'message' in message
    ) {
      console.debug(`🔧 ${message.message}`, message)
      return
    }
    console.debug(`🔧 ${message}`, data ? { ...data } : '')
  },

  success(message: string | LogObject, data?: LogData) {
    if (
      typeof message === 'object' &&
      message !== null &&
      'message' in message
    ) {
      console.log(`✅ ${message.message}`, message)
      return
    }
    console.log(`✅ ${message}`, data ? { ...data } : '')
  },
}

// const l
//     write: (message: string) => logger.info(message.trim()),
//   },
// })

// const morganCombined = morgan('combined', {
//   stream: {
//     write: (message: string) => logger.info(message.trim()),
//   },
// })

// // Экспортируем функцию для динамического выбора формата
// const getDynamicLogger = (format = 'dev') => {
//   return format === 'combined' ? morganCombined : morganDev
// }
