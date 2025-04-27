import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// Import the actual logger implementation
import { logger as actualLogger } from '@/utils/logger'
// Import winston *specifically for mocking*, not for direct use in tests usually
import winston from 'winston'

// --- Winston Mock v5 (Fixing Formatters) ---
vi.mock('winston', async importOriginal => {
  // Mock logger instance methods
  const mockLogFunctions = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }

  // Base mock formatter *function* - simulates the core logic if needed
  const mockTransformFn = vi.fn(info => info)

  // Function that returns a mock *format instance* (object with transform)
  const createMockFormatInstance = () => ({ transform: mockTransformFn })

  // Mock format methods that should return a format instance
  const mockTimestampFormatter = vi.fn(createMockFormatInstance)
  const mockErrorsFormatter = vi.fn(createMockFormatInstance)
  const mockPrettyJsonFormatter = vi.fn(createMockFormatInstance) // format() is called to get prettyJson
  const mockGenericFormatter = vi.fn(createMockFormatInstance) // For combine, printf, etc.

  // Assign methods to the format object
  const mockFormat = {
    combine: mockGenericFormatter,
    timestamp: mockTimestampFormatter,
    errors: mockErrorsFormatter,
    printf: mockGenericFormatter, // printf expects a function, but combine needs instances
    json: mockGenericFormatter,
    colorize: mockGenericFormatter,
    simple: mockGenericFormatter,
    // IMPORTANT: format() itself is also called directly in logger.ts to define prettyJson
    // So, we make the format object *itself* callable and return a format instance.
    __call__: mockPrettyJsonFormatter, // Make the object callable
    // Alternatively, we can make format a function and assign properties, but this seems less standard
  }

  // Hack to make the mockFormat object callable for when `format(info => ...)` is used
  // This might be fragile depending on JS environment or Vitest version.
  const callableMockFormat = Object.assign(mockPrettyJsonFormatter, mockFormat)

  // Mock transports
  const mockTransports = {
    Console: vi.fn(() => ({ log: vi.fn() })),
    File: vi.fn(() => ({ log: vi.fn() })),
  }

  return {
    createLogger: vi.fn(() => mockLogFunctions),
    format: callableMockFormat, // Use the callable format object
    transports: mockTransports,
  }
})
// --- End of Winston Mock ---

// Now dynamically import the logger AFTER mocks are set up
let logger: typeof import('@/utils/logger').logger
let botLogger: typeof import('@/utils/logger').botLogger
let securityLogger: typeof import('@/utils/logger').securityLogger
let logSecurityEvent: typeof import('@/utils/logger').logSecurityEvent
let mockedWinston: typeof import('winston')

beforeEach(async () => {
  // Reset mocks before each test
  vi.resetModules() // Essential to re-evaluate imports with fresh mocks

  // Import winston mock to potentially reset its internal mocks if needed
  // (Often vi.resetModules is enough, but can be explicit)
  mockedWinston = await import('winston')
  vi.mocked(mockedWinston.createLogger).mockClear()
  // Clear mocks for the logger methods returned by createLogger
  const loggerInstance = vi.mocked(mockedWinston.createLogger)()
  Object.values(loggerInstance).forEach(mockFn => mockFn.mockClear())

  // Import the module under test dynamically
  const loggerModule = await import('@/utils/logger')
  logger = loggerModule.logger
  botLogger = loggerModule.botLogger
  securityLogger = loggerModule.securityLogger
  logSecurityEvent = loggerModule.logSecurityEvent
})

afterEach(() => {
  vi.clearAllMocks() // Clean up all mocks
})

describe('Logger Utilities', () => {
  describe('logger', () => {
    it('should be created', () => {
      expect(logger).toBeDefined()
      // Check if createLogger was called (implicitly tested by logger being defined)
      expect(vi.mocked(mockedWinston.createLogger)).toHaveBeenCalled()
    })

    it('should call winston logger methods', () => {
      logger.info('Test info message')
      logger.warn('Test warn message')
      logger.error('Test error message')
      logger.debug('Test debug message')

      const loggerInstance = vi.mocked(mockedWinston.createLogger)()
      expect(loggerInstance.info).toHaveBeenCalledWith('Test info message')
      expect(loggerInstance.warn).toHaveBeenCalledWith('Test warn message')
      expect(loggerInstance.error).toHaveBeenCalledWith('Test error message')
      expect(loggerInstance.debug).toHaveBeenCalledWith('Test debug message')
    })
  })

  describe('botLogger', () => {
    it('should prepend bot name and call underlying logger', () => {
      const botName = 'testBot'
      const message = 'Bot message'
      const meta = { data: 123 }

      botLogger.info(botName, message, meta)
      botLogger.warn(botName, message, meta)
      botLogger.error(botName, message, meta)
      botLogger.debug(botName, message, meta)

      const loggerInstance = vi.mocked(mockedWinston.createLogger)()
      expect(loggerInstance.info).toHaveBeenCalledWith(
        `[${botName}] ${message}`,
        meta
      )
      expect(loggerInstance.warn).toHaveBeenCalledWith(
        `[${botName}] ${message}`,
        meta
      )
      expect(loggerInstance.error).toHaveBeenCalledWith(
        `[${botName}] ${message}`,
        meta
      )
      expect(loggerInstance.debug).toHaveBeenCalledWith(
        `[${botName}] ${message}`,
        meta
      )
    })
  })

  describe('securityLogger', () => {
    it('should be created', () => {
      expect(securityLogger).toBeDefined()
      // Since securityLogger also uses createLogger, it should have been called again
      // Adjust expectation based on whether it's the SAME logger or a different one.
      // Assuming logger.ts creates two distinct loggers:
      expect(vi.mocked(mockedWinston.createLogger)).toHaveBeenCalledTimes(2) // Once for main, once for security
    })

    it('should call winston logger methods (for security)', () => {
      const securityInstance = vi.mocked(mockedWinston.createLogger).mock
        .results[1]?.value // Get the second instance
      if (!securityInstance)
        throw new Error('Security logger instance not created/mocked')

      securityLogger.info('Security info')
      securityLogger.warn('Security warn')
      securityLogger.error('Security error')

      expect(securityInstance.info).toHaveBeenCalledWith('Security info')
      expect(securityInstance.warn).toHaveBeenCalledWith('Security warn')
      expect(securityInstance.error).toHaveBeenCalledWith('Security error')
    })
  })

  describe('logSecurityEvent', () => {
    it('should call securityLogger with formatted message and details', () => {
      const eventType = 'Unauthorized Access'
      const details = { ip: '127.0.0.1', user: 'admin' }
      const severity = 'error'

      logSecurityEvent(eventType, details, severity)

      const securityInstance = vi.mocked(mockedWinston.createLogger).mock
        .results[1]?.value // Get the second instance
      if (!securityInstance)
        throw new Error('Security logger instance not created/mocked')

      expect(securityInstance[severity]).toHaveBeenCalledWith(
        `Событие безопасности: ${eventType}`,
        expect.objectContaining({
          ...details,
          eventType,
          timestamp: expect.any(String), // Check that timestamp is included
        })
      )
    })

    it('should default severity to "warn"', () => {
      const eventType = 'Suspicious Activity'
      const details = { path: '/admin' }

      logSecurityEvent(eventType, details) // No severity provided

      const securityInstance = vi.mocked(mockedWinston.createLogger).mock
        .results[1]?.value
      if (!securityInstance)
        throw new Error('Security logger instance not created/mocked')

      // Check if the 'warn' method was called
      expect(securityInstance.warn).toHaveBeenCalledWith(
        `Событие безопасности: ${eventType}`,
        expect.objectContaining({
          ...details,
          eventType,
          timestamp: expect.any(String),
        })
      )
      // Ensure other levels weren't called
      expect(securityInstance.info).not.toHaveBeenCalled()
      expect(securityInstance.error).not.toHaveBeenCalled()
    })
  })
})
