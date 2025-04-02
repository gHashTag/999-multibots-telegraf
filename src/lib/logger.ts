type LogLevel = 'info' | 'error' | 'warn' | 'debug'

class Logger {
  private log(level: LogLevel, message: string, data?: any) {
    const timestamp = new Date().toISOString()
    console[level](`[${timestamp}] ${message}`, data || '')
  }

  info(message: string, data?: any) {
    this.log('info', message, data)
  }

  error(message: string, data?: any) {
    this.log('error', message, data)
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data)
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data)
  }
}

export const logger = new Logger()
