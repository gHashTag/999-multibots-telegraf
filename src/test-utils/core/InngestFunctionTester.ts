import { config } from 'dotenv'
import path from 'path'
import { logger } from '@/utils/logger'

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

/**
 * Результат тестирования функции
 */
export interface FunctionTestResult<T = any> {
  /** Успешность выполнения теста */
  success: boolean
  /** Сообщение о результате теста */
  message: string
  /** Результат выполнения функции, если тест успешен */
  result?: T
  /** Ошибка, если тест не успешен */
  error?: string
  /** Подробная информация о выполнении */
  details?: Record<string, any>
  /** Продолжительность выполнения в миллисекундах */
  duration?: number
}

/**
 * Опции для тестирования функции
 */
export interface FunctionTestOptions {
  /** Имя теста */
  name: string
  /** Включить расширенное логирование */
  verbose?: boolean
  /** Таймаут теста в миллисекундах */
  timeout?: number
  /** Автоматически выходить при ошибке */
  exitOnError?: boolean
}

/**
 * Базовый абстрактный класс для тестеров Inngest функций
 *
 * Используется для создания специализированных тестеров для различных Inngest функций
 */
export abstract class InngestFunctionTester<TInput, TOutput> {
  protected name: string
  protected eventName: string
  protected verbose: boolean

  constructor(eventName: string, options: { name: string; verbose?: boolean }) {
    this.eventName = eventName
    this.name = options.name
    this.verbose = options.verbose || false
  }

  /**
   * Запускает тест с указанными входными данными
   */
  async runTest(input: TInput): Promise<TOutput> {
    const startTime = Date.now()

    try {
      if (this.verbose) {
        logger.info({
          message: `🧪 Запуск теста: ${this.name}`,
          description: `Running test: ${this.name}`,
          eventName: this.eventName,
          input,
        })
      }

      const result = await this.executeTest(input)

      const duration = Date.now() - startTime

      if (this.verbose) {
        logger.info({
          message: `✅ Тест успешно завершен: ${this.name}`,
          description: `Test completed successfully: ${this.name}`,
          duration,
          eventName: this.eventName,
        })
      }

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      logger.error({
        message: `❌ Ошибка при выполнении теста: ${this.name}`,
        description: `Test failed: ${this.name}`,
        error: error instanceof Error ? error.message : String(error),
        duration,
        eventName: this.eventName,
      })

      throw error
    }
  }

  /**
   * Абстрактный метод, который должен быть реализован в потомках
   * Содержит основную логику тестирования
   */
  protected abstract executeTest(input: TInput): Promise<TOutput>
}
