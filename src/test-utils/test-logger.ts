import { logger } from '@/utils/logger'
import { TestResult } from './types'

/**
 * Класс для логирования в тестах с поддержкой TypeScript
 */
export class TestLogger {
  private static formatError(error: Error | string): Error {
    if (error instanceof Error) {
      return error
    }
    return new Error(error)
  }

  /**
   * Логирование начала теста
   */
  static logTestStart(testName: string): void {
    logger.info('🚀 Начало теста', {
      description: 'Test started',
      test_name: testName,
    })
  }

  /**
   * Логирование успешного завершения теста
   */
  static logTestSuccess(result: TestResult): void {
    logger.info('✅ Тест успешно завершен', {
      description: 'Test completed successfully',
      test_name: result.name,
      success: result.success,
      message: result.message,
    })
  }

  /**
   * Логирование ошибки теста
   */
  static logTestError(error: Error | string, testName: string): void {
    const errorMessage = error instanceof Error ? error.message : error
    logger.error('❌ Ошибка в тесте', {
      description: 'Test failed',
      test_name: testName,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
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
    startTime: number
  }): TestResult {
    const { name, success, message, error } = params

    if (error) {
      logger.error('❌ Ошибка в тесте', {
        description: 'Test error details',
        test_name: name,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      })
    }

    return {
      name,
      success,
      message,
      error: error ? this.formatError(error) : undefined,
      startTime: params.startTime,
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
    logger.info('ℹ️ ' + message, {
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
    logger.warn('⚠️ ' + message, {
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
    logger.debug('🔍 ' + message, {
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

  /**
   * Создание результата теста с правильной обработкой ошибок
   */
  static createTestError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error))
  }
}

export const createTestError = TestLogger.createTestError

export async function testLogger(): Promise<TestResult> {
  const testName = 'Logger Test'

  try {
    logger.info({
      message: '🧪 Тест логгера',
      description: 'Testing logger functionality',
    })

    // Тестируем различные уровни логирования
    logger.debug({
      message: '🔍 Тестовое отладочное сообщение',
      description: 'Test debug message',
    })

    logger.info({
      message: 'ℹ️ Тестовое информационное сообщение',
      description: 'Test info message',
    })

    logger.warn({
      message: '⚠️ Тестовое предупреждение',
      description: 'Test warning message',
    })

    logger.error({
      message: '❌ Тестовая ошибка',
      description: 'Test error message',
      error: new Error('Test error'),
    })

    return {
      name: testName,
      success: true,
      message: 'Все уровни логирования работают корректно',
      startTime: Date.now(),
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error({
      message: '❌ Ошибка при тестировании логгера',
      description: 'Logger test error',
      error,
    })

    return {
      name: testName,
      success: false,
      message: 'Ошибка при тестировании логгера',
      error: error,
      startTime: Date.now(),
    }
  }
}
