import axios from 'axios'
import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { supabaseTestClient } from './test-env'
import { TestResult } from './types'

/** Константы для статусов тренировки */
const TRAINING_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
  PROCESSING: 'PROCESSING',
} as const

/** Интерфейс для полезной нагрузки вебхука */
interface WebhookPayload {
  task_id: string
  status?: string
  id?: string
  model?: string
  version?: string
  output?: {
    uri?: string
    version?: string
    image?: string
  }
  metrics?: {
    predict_time?: number
  }
  error?: string
  trainingId?: string
  result?: Record<string, unknown>
}

/** Опции для отправки вебхука */
interface WebhookOptions {
  /** Проверять ли изменения в базе данных */
  checkDatabase: boolean
  /** Ожидаемый статус после обработки */
  expectedStatus?: string
  /** Ожидаемый результат */
  expectedOutput?: string
  /** Ожидаемая ошибка */
  expectedError?: string
  /** Использовать ли отладочный эндпоинт */
  useDebugEndpoint?: boolean
}

/** Статус в базе данных до и после отправки вебхука */
interface DatabaseStatus {
  /** Статус до отправки */
  beforeStatus: string | null
  /** Статус после отправки */
  afterStatus: string | null
  /** Изменился ли статус */
  changed: boolean
  /** URL результата */
  output_url?: string
}

/**
 * Класс для тестирования вебхуков Replicate
 */
export class ReplicateWebhookTester {
  /**
   * Отправляет вебхук и проверяет результат
   * @param payload - Полезная нагрузка вебхука
   * @param options - Опции для отправки и проверки
   * @returns Результат теста
   */
  async sendWebhook(
    payload: WebhookPayload,
    options: WebhookOptions = { checkDatabase: true }
  ): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `Webhook test: ${payload.status || 'unknown'}`

    try {
      logger.info({
        message: '🚀 Начало теста отправки вебхука',
        description: 'Starting webhook test',
        test_name: testName,
        status: payload.status,
        training_id: payload.id,
      })

      // Проверяем статус тренировки в базе перед запросом, если нужно
      let beforeStatus: string | null = null
      if (options.checkDatabase) {
        try {
          const { data } = await supabaseTestClient
            .from('model_trainings')
            .select('status')
            .eq('replicate_training_id', payload.id)
            .limit(1)
            .single()

          beforeStatus = data?.status || null

          logger.info({
            message: '🔍 Получен статус до теста',
            description: 'Got status before test',
            test_name: testName,
            status: beforeStatus,
          })
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус тренировки до теста',
            description: 'Failed to get training status before test',
            test_name: testName,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Формируем URL для запроса
      const webhookUrl = `${TEST_CONFIG.server.apiUrl}${TEST_CONFIG.server.webhookPath}`

      logger.info({
        message: '📡 Отправка вебхука',
        description: 'Sending webhook',
        test_name: testName,
        url: webhookUrl,
      })

      // Отправляем вебхук
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Проверяем статус ответа
      if (response.status !== 200) {
        throw new Error(`Unexpected status code: ${response.status}`)
      }

      logger.info({
        message: '✅ Вебхук успешно отправлен',
        description: 'Webhook sent successfully',
        test_name: testName,
        status: response.status,
      })

      // Если нужно проверить базу данных, ждем некоторое время для обработки запроса
      let afterStatus: string | null = null
      if (options.checkDatabase) {
        // Ждем, чтобы изменения успели примениться
        await new Promise(resolve => setTimeout(resolve, 1000))

        try {
          const { data } = await supabaseTestClient
            .from('model_trainings')
            .select('status')
            .eq('replicate_training_id', payload.id)
            .limit(1)
            .single()

          afterStatus = data?.status || null

          logger.info({
            message: '🔍 Получен статус после теста',
            description: 'Got status after test',
            test_name: testName,
            status: afterStatus,
          })
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус тренировки после теста',
            description: 'Failed to get training status after test',
            test_name: testName,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      const duration = Date.now() - startTime
      const databaseCheck: DatabaseStatus | null = options.checkDatabase
        ? {
            beforeStatus,
            afterStatus,
            changed: beforeStatus !== afterStatus,
          }
        : null

      logger.info({
        message: '🏁 Тест успешно завершен',
        description: 'Test completed successfully',
        test_name: testName,
        duration: `${duration}ms`,
        database_check: databaseCheck,
      })

      return {
        name: testName,
        success: true,
        message: `Вебхук успешно отправлен за ${duration}мс`,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке вебхука',
        description: 'Error during webhook test',
        test_name: testName,
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
        duration: `${duration}ms`,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при отправке вебхука',
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  /**
   * Тестирует успешное завершение тренировки
   * @returns Результат теста
   */
  async testSuccessfulTraining(): Promise<TestResult> {
    const mockTraining: WebhookPayload = {
      id: 'test-training-id',
      task_id: 'test-task-id',
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: TRAINING_STATUS.SUCCESS,
      output: {
        uri: 'https://example.com/output.jpg',
        version: '1.0.0',
      },
      metrics: {
        predict_time: 1000,
      },
    }

    logger.info({
      message: '🧪 Тест вебхука успешной тренировки',
      description: 'Starting successful training webhook test',
      test_name: 'Successful Training Test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Тестирует неудачное завершение тренировки
   * @returns Результат теста
   */
  async testFailedTraining(): Promise<TestResult> {
    const mockTraining: WebhookPayload = {
      id: 'test-training-id-failed',
      task_id: 'test-task-id-failed',
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: TRAINING_STATUS.FAILED,
      error: 'Test error message',
    }

    logger.info({
      message: '🧪 Тест вебхука неудачной тренировки',
      description: 'Starting failed training webhook test',
      test_name: 'Failed Training Test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Тестирует отмену тренировки
   * @returns Результат теста
   */
  async testCanceledTraining(): Promise<TestResult> {
    const mockTraining: WebhookPayload = {
      id: 'test-training-id-canceled',
      task_id: 'test-task-id-canceled',
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: TRAINING_STATUS.CANCELED,
    }

    logger.info({
      message: '🧪 Тест вебхука отмененной тренировки',
      description: 'Starting canceled training webhook test',
      test_name: 'Canceled Training Test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Запускает все тесты
   * @returns Массив результатов тестов
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []
    const startTime = Date.now()

    logger.info({
      message: '🚀 Запуск всех тестов вебхуков',
      description: 'Starting all webhook tests',
      test_name: 'All Webhook Tests',
    })

    // Тест успешной тренировки
    results.push(await this.testSuccessfulTraining())

    // Тест неудачной тренировки
    results.push(await this.testFailedTraining())

    // Тест отмененной тренировки
    results.push(await this.testCanceledTraining())

    const duration = Date.now() - startTime
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    logger.info({
      message: '🏁 Все тесты вебхуков завершены',
      description: 'All webhook tests completed',
      test_name: 'All Webhook Tests',
      duration: `${duration}ms`,
      success_count: successCount,
      failure_count: failureCount,
      total_tests: results.length,
    })

    return results
  }
}

/**
 * Класс для тестирования вебхуков BFL
 */
export class BFLWebhookTester {
  /**
   * Отправляет вебхук и проверяет результат
   * @param payload - Полезная нагрузка вебхука
   * @param options - Опции для отправки и проверки
   * @returns Результат теста
   */
  async sendWebhook(payload: WebhookPayload): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `BFL Webhook test: ${payload.status || 'unknown'}`

    try {
      logger.info({
        message: '🚀 Начало теста отправки BFL вебхука',
        description: 'Starting BFL webhook test',
        test_name: testName,
        status: payload.status,
        training_id: payload.trainingId,
      })

      // Формируем URL для запроса
      const webhookUrl = `${TEST_CONFIG.server.apiUrl}${TEST_CONFIG.server.bflWebhookPath}`

      logger.info({
        message: '📡 Отправка BFL вебхука',
        description: 'Sending BFL webhook',
        test_name: testName,
        url: webhookUrl,
      })

      // Отправляем вебхук
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Проверяем статус ответа
      if (response.status !== 200) {
        throw new Error(`Unexpected status code: ${response.status}`)
      }

      logger.info({
        message: '✅ BFL вебхук успешно отправлен',
        description: 'BFL webhook sent successfully',
        test_name: testName,
        status: response.status,
      })

      const duration = Date.now() - startTime

      logger.info({
        message: '🏁 Тест BFL вебхука успешно завершен',
        description: 'BFL webhook test completed successfully',
        test_name: testName,
        duration: `${duration}ms`,
      })

      return {
        name: testName,
        success: true,
        message: `BFL вебхук успешно отправлен за ${duration}мс`,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке BFL вебхука',
        description: 'Error during BFL webhook test',
        test_name: testName,
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
        duration: `${duration}ms`,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при отправке BFL вебхука',
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  /**
   * Тестирует успешное завершение тренировки
   * @returns Результат теста
   */
  async testSuccessfulTraining(): Promise<TestResult> {
    const mockTraining: WebhookPayload = {
      task_id: 'test-task-id',
      trainingId: 'test-training-id',
      status: TRAINING_STATUS.SUCCESS,
      result: {
        url: 'https://example.com/output.jpg',
      },
    }

    logger.info({
      message: '🧪 Тест BFL вебхука успешной тренировки',
      description: 'Starting successful BFL training webhook test',
      test_name: 'Successful BFL Training Test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Тестирует неудачное завершение тренировки
   * @returns Результат теста
   */
  async testFailedTraining(): Promise<TestResult> {
    const mockTraining: WebhookPayload = {
      task_id: 'test-task-id-failed',
      trainingId: 'test-training-id-failed',
      status: TRAINING_STATUS.FAILED,
      error: 'Test error message',
    }

    logger.info({
      message: '🧪 Тест BFL вебхука неудачной тренировки',
      description: 'Starting failed BFL training webhook test',
      test_name: 'Failed BFL Training Test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Запускает все тесты
   * @returns Массив результатов тестов
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []
    const startTime = Date.now()

    logger.info({
      message: '🚀 Запуск всех тестов BFL вебхуков',
      description: 'Starting all BFL webhook tests',
      test_name: 'All BFL Webhook Tests',
    })

    // Тест успешной тренировки
    results.push(await this.testSuccessfulTraining())

    // Тест неудачной тренировки
    results.push(await this.testFailedTraining())

    const duration = Date.now() - startTime
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    logger.info({
      message: '🏁 Все тесты BFL вебхуков завершены',
      description: 'All BFL webhook tests completed',
      test_name: 'All BFL Webhook Tests',
      duration: `${duration}ms`,
      success_count: successCount,
      failure_count: failureCount,
      total_tests: results.length,
    })

    return results
  }
}

/**
 * Класс для тестирования вебхуков NeuroPhoto
 */
export class NeuroPhotoWebhookTester {
  /**
   * Отправляет вебхук и проверяет результат
   * @param payload - Полезная нагрузка вебхука
   * @returns Результат теста
   */
  async sendWebhook(payload: WebhookPayload): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `NeuroPhoto Webhook test: ${payload.status || 'unknown'}`

    try {
      logger.info({
        message: '🚀 Начало теста отправки NeuroPhoto вебхука',
        description: 'Starting NeuroPhoto webhook test',
        test_name: testName,
        status: payload.status,
        id: payload.id,
      })

      // Формируем URL для запроса
      const webhookUrl = `${TEST_CONFIG.server.apiUrl}${TEST_CONFIG.server.neurophotoWebhookPath}`

      logger.info({
        message: '📡 Отправка NeuroPhoto вебхука',
        description: 'Sending NeuroPhoto webhook',
        test_name: testName,
        url: webhookUrl,
      })

      // Отправляем вебхук
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Проверяем статус ответа
      if (response.status !== 200) {
        throw new Error(`Unexpected status code: ${response.status}`)
      }

      logger.info({
        message: '✅ NeuroPhoto вебхук успешно отправлен',
        description: 'NeuroPhoto webhook sent successfully',
        test_name: testName,
        status: response.status,
      })

      const duration = Date.now() - startTime

      logger.info({
        message: '🏁 Тест NeuroPhoto вебхука успешно завершен',
        description: 'NeuroPhoto webhook test completed successfully',
        test_name: testName,
        duration: `${duration}ms`,
      })

      return {
        name: testName,
        success: true,
        message: `NeuroPhoto вебхук успешно отправлен за ${duration}мс`,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке NeuroPhoto вебхука',
        description: 'Error during NeuroPhoto webhook test',
        test_name: testName,
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
        duration: `${duration}ms`,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при отправке NeuroPhoto вебхука',
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  /**
   * Тестирует успешную генерацию
   * @returns Результат теста
   */
  async testSuccessfulGeneration(): Promise<TestResult> {
    const mockGeneration: WebhookPayload = {
      task_id: 'test-task-id',
      id: 'test-generation-id',
      status: TRAINING_STATUS.SUCCESS,
      output: {
        image: 'https://example.com/output.jpg',
      },
    }

    logger.info({
      message: '🧪 Тест NeuroPhoto вебхука успешной генерации',
      description: 'Starting successful NeuroPhoto generation webhook test',
      test_name: 'Successful NeuroPhoto Generation Test',
      sample: mockGeneration,
    })

    return this.sendWebhook(mockGeneration)
  }

  /**
   * Тестирует неудачную генерацию
   * @returns Результат теста
   */
  async testFailedGeneration(): Promise<TestResult> {
    const mockGeneration: WebhookPayload = {
      task_id: 'test-task-id-failed',
      id: 'test-generation-id-failed',
      status: TRAINING_STATUS.FAILED,
      error: 'Test error message',
    }

    logger.info({
      message: '🧪 Тест NeuroPhoto вебхука неудачной генерации',
      description: 'Starting failed NeuroPhoto generation webhook test',
      test_name: 'Failed NeuroPhoto Generation Test',
      sample: mockGeneration,
    })

    return this.sendWebhook(mockGeneration)
  }

  /**
   * Запускает все тесты
   * @returns Массив результатов тестов
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []
    const startTime = Date.now()

    logger.info({
      message: '🚀 Запуск всех тестов NeuroPhoto вебхуков',
      description: 'Starting all NeuroPhoto webhook tests',
      test_name: 'All NeuroPhoto Webhook Tests',
    })

    // Тест успешной генерации
    results.push(await this.testSuccessfulGeneration())

    // Тест неудачной генерации
    results.push(await this.testFailedGeneration())

    const duration = Date.now() - startTime
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    logger.info({
      message: '🏁 Все тесты NeuroPhoto вебхуков завершены',
      description: 'All NeuroPhoto webhook tests completed',
      test_name: 'All NeuroPhoto Webhook Tests',
      duration: `${duration}ms`,
      success_count: successCount,
      failure_count: failureCount,
      total_tests: results.length,
    })

    return results
  }
}
