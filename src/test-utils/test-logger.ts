import { Logger as logger } from '@/utils/logger'
import { TestError, TestLogError, TestResult } from './interfaces'
import { TEST_CONFIG } from './test-config'

/**
 * Класс для логирования в тестах с поддержкой TypeScript
 */
export class TestLogger {
  private static formatError(error: Error | string): TestError {
    if (error instanceof Error) {
      return error as TestError
    }
    const testError = new Error(error) as TestError
    testError.timestamp = Date.now()
    return testError
  }

  /**
   * Логирование начала теста
   */
  static logTestStart(testName: string, context?: Record<string, unknown>): void {
    logger.info({
      message: `${TEST_CONFIG.EMOJI.START} Запуск теста: ${testName}`,
      description: `Starting test: ${testName}`,
      ...context,
    })
  }

  /**
   * Логирование успешного завершения теста
   */
  static logTestSuccess(result: TestResult): void {
    logger.info({
      message: `${TEST_CONFIG.EMOJI.SUCCESS} Тест успешно завершен: ${result.name}`,
      description: `Test completed successfully: ${result.name}`,
      duration: result.duration,
      details: result.details,
      metadata: result.metadata,
    })
  }

  /**
   * Логирование ошибки теста
   */
  static logTestError(logError: TestLogError): void {
    const formattedError = this.formatError(logError.error)
    
    logger.error({
      message: `${TEST_CONFIG.EMOJI.ERROR} ${logError.message}`,
      description: logError.description,
      error: {
        message: formattedError.message,
        stack: formattedError.stack,
        code: logError.code || 'TEST_ERROR',
        context: logError.context,
        timestamp: formattedError.timestamp,
      },
    })
  }

  /**
   * Создание результата теста
   */
  static createTestResult(params: {
    name: string
    success: boolean
    message: string
    error?: Error | string
    details?: Record<string, unknown>
    startTime: number
  }): TestResult {
    const { name, success, message, error, details, startTime } = params
    
    return {
      name,
      success,
      message,
      error: error ? this.formatError(error) : undefined,
      details,
      duration: Date.now() - startTime,
      metadata: {
        startTime,
        endTime: Date.now(),
        environment: process.env.NODE_ENV,
        testType: name.split(' ')[0],
      },
    }
  }

  /**
   * Логирование информации в процессе теста
   */
  static logTestInfo(
    message: string,
    description: string,
    context?: Record<string, unknown>
  ): void {
    logger.info({
      message: `${TEST_CONFIG.EMOJI.INFO} ${message}`,
      description,
      ...context,
    })
  }

  /**
   * Логирование предупреждения в процессе теста
   */
  static logTestWarning(
    message: string,
    description: string,
    context?: Record<string, unknown>
  ): void {
    logger.warn({
      message: `${TEST_CONFIG.EMOJI.WARNING} ${message}`,
      description,
      ...context,
    })
  }

  /**
   * Логирование отладочной информации
   */
  static logTestDebug(
    message: string,
    description: string,
    context?: Record<string, unknown>
  ): void {
    logger.debug({
      message: `${TEST_CONFIG.EMOJI.DEBUG} ${message}`,
      description,
      ...context,
    })
  }
} 