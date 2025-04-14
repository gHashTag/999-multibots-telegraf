type LogLevel = 'info' | 'error' | 'warn' | 'debug'

interface LogData {
  message: string
  [key: string]: any
}

class Logger {
  private log(level: LogLevel, messageOrData: string | LogData, data?: any) {
    const timestamp = new Date().toISOString()

    if (typeof messageOrData === 'string') {
      console[level](`[${timestamp}] ${messageOrData}`, data || '')
    } else {
      const { message, ...contextData } = messageOrData
      console[level](
        `[${timestamp}] ${message}`,
        Object.keys(contextData).length > 0 ? contextData : ''
      )
    }
  }

  info(messageOrData: string | LogData, data?: any) {
    this.log('info', messageOrData, data)
  }

  error(messageOrData: string | LogData, data?: any) {
    this.log('error', messageOrData, data)
  }

  warn(messageOrData: string | LogData, data?: any) {
    this.log('warn', messageOrData, data)
  }

  debug(messageOrData: string | LogData, data?: any) {
    this.log('debug', messageOrData, data)
  }
}

export const logger = new Logger()
