export const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(`🧪 TEST: ${message}`, data || '')
  },
  error: (message: string, data?: Record<string, unknown>) => {
    console.error(`🧪 TEST ERROR: ${message}`, data || '')
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(`🧪 TEST WARN: ${message}`, data || '')
  },
}
