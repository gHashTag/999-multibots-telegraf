import { logger, LogData, LogObject } from '../utils/logger'

export const testLogger = {
  log(message: string | LogObject, data?: LogData) {
    logger.log(message, { ...data, context: 'TEST' })
  },

  error(message: string | LogObject, data?: LogData) {
    logger.error(message, { ...data, context: 'TEST' })
  },

  warn(message: string | LogObject, data?: LogData) {
    logger.warn(message, { ...data, context: 'TEST' })
  },

  info(message: string | LogObject, data?: LogData) {
    logger.info(message, { ...data, context: 'TEST' })
  },

  debug(message: string | LogObject, data?: LogData) {
    logger.debug(message, { ...data, context: 'TEST' })
  },

  success(message: string | LogObject, data?: LogData) {
    logger.success(message, { ...data, context: 'TEST' })
  },
}
