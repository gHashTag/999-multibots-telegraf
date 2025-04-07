import { logger } from '@/utils/logger'
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
  static logTestStart(testName: string): void {
    logger.info({
      message: `🚀 Запуск теста: ${testName}`,
      description: `Starting test: ${testName}`,
    })
  }

  /**
   * Логирование успешного завершения теста
   */
  static logTestSuccess(result: TestResult): void {
    logger.info({
      message: `✅ Тест успешно завершен: ${result.name}`,
      description: `Test completed successfully: ${result.name}`,
    })
  }

  /**
   * Логирование ошибки теста
   */
  static logTestError(error: Error | string, testName: string): void {
    const errorMessage = error instanceof Error ? error.message : error
    logger.error({
      message: `❌ Ошибка в тесте: ${testName}`,
      description: `Test failed: ${testName}`,
      error: errorMessage,
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

  static logTestSkipped(testName: string, reason: string): void {
    logger.info({
      message: `⏭️ Тест пропущен: ${testName}`,
      description: 'Test skipped',
      reason,
      context: {
        test: testName,
      },
    })
  }
}
