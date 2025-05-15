// A simple logger for the digitalAvatarBody module
// For now, it can be a basic wrapper around console, or re-export a more complex one if needed.
// This promotes module independence.

// Basic console wrapper example:
const formatMessage = (level: string, message: string, context?: any) => {
  let logEntry = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`
  if (context) {
    try {
      logEntry += ` ${JSON.stringify(context)}`
    } catch (e) {
      // Non-serializable context
      logEntry += ` [UnserializableContext]`
    }
  }
  return logEntry
}

export const logger = {
  info: (message: string, context?: any) => {
    console.log(formatMessage('info', message, context))
  },
  warn: (message: string, context?: any) => {
    console.warn(formatMessage('warn', message, context))
  },
  error: (message: string, context?: any) => {
    console.error(formatMessage('error', message, context))
  },
  debug: (message: string, context?: any) => {
    // Simple logger might not distinguish debug, or map it to info
    // Or use console.debug if available and desired
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.LOG_LEVEL === 'debug'
    ) {
      console.debug(formatMessage('debug', message, context))
    }
  },
}
