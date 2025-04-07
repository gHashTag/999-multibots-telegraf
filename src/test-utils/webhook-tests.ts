import axios from 'axios'
import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { supabaseTestClient } from './test-env'

interface TestResult {
  name: string
  success: boolean
  message: string
  error?: Error | string
  details?: Record<string, unknown>
  duration?: number
  metadata?: {
    startTime?: number
    endTime?: number
    environment?: string
    testType?: string
  }
  testName?: string
  paymentProcessed?: boolean
  videoBuffer?: Buffer
  balance?: number
  before_balance?: number
  after_balance?: number
  spent_balance?: number
}

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
  result?: any
}

interface WebhookOptions {
  checkDatabase: boolean
  expectedStatus?: string
  expectedOutput?: string
  expectedError?: string
  useDebugEndpoint?: boolean
}

interface DatabaseStatus {
  beforeStatus: string | null
  afterStatus: string | null
  changed: boolean
  output_url?: string
}

interface ModelTrainingSample {
  prompt: string
  negative_prompt: string
  image_url: string
}

interface BFLTrainingSample {
  text: string
  image_url: string
}

interface NeuroPhotoSample {
  url: string
  prompt: string
}

/**
 * Класс для тестирования вебхуков Replicate
 */
export class ReplicateWebhookTester {
  /**
   * Отправляет вебхук и проверяет результат
   */
  async sendWebhook(
    payload: WebhookPayload,
    options: WebhookOptions = { checkDatabase: true }
  ): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `Webhook test: ${payload.status || 'unknown'}`

    try {
      logger.info({
        message: '🧪 Тест отправки вебхука',
        description: 'Webhook send test',
        status: payload.status,
        trainingId: payload.id,
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
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус тренировки до теста',
            description: 'Failed to get training status before test',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Формируем URL для запроса
      const webhookUrl = `${TEST_CONFIG.server.apiUrl}${TEST_CONFIG.server.webhookPath}`

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
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус тренировки после теста',
            description: 'Failed to get training status after test',
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

      return {
        name: testName,
        success: true,
        message: `Вебхук успешно отправлен за ${duration}мс`,
        details: {
          responseData: response.data,
          databaseCheck,
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке вебхука',
        description: 'Error during webhook test',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при отправке вебхука',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      }
    }
  }

  /**
   * Тестирует успешное завершение тренировки
   */
  async testSuccessfulTraining(): Promise<TestResult> {
    const mockTraining: WebhookPayload = {
      id: 'test-training-id',
      task_id: 'test-task-id',
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'SUCCESS',
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
      description: 'Successful training webhook test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Тестирует неудачное завершение тренировки
   */
  async testFailedTraining(): Promise<TestResult> {
    const mockTraining: WebhookPayload = {
      id: 'test-training-id-failed',
      task_id: 'test-task-id-failed',
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'FAILED',
      error: 'Test error message',
    }

    logger.info({
      message: '🧪 Тест вебхука неудачной тренировки',
      description: 'Failed training webhook test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Тестирует отмену тренировки
   */
  async testCanceledTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.modelTraining.samples.find(
      s => s.status === 'canceled'
    )

    if (!sample) {
      return {
        name: 'Canceled training webhook test',
        success: false,
        message: 'Не найден пример отмененной тренировки',
      }
    }

    const mockTraining: WebhookPayload = {
      id: sample.trainingId,
      task_id: `${sample.trainingId}-task`,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'CANCELED',
    }

    logger.info({
      message: '🧪 Тест вебхука отмененной тренировки',
      description: 'Canceled training webhook test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Запускает все тесты вебхуков
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []
    logger.info({
      message: '🧪 Запуск всех тестов вебхуков',
      description: 'Running all webhook tests',
    })

    try {
      // Тест успешного завершения тренировки
      const successResult = await this.testSuccessfulTraining()
      results.push(successResult)

      // Тест неудачного завершения тренировки
      const failedResult = await this.testFailedTraining()
      results.push(failedResult)

      // Тест отмены тренировки
      const canceledResult = await this.testCanceledTraining()
      results.push(canceledResult)

      // Считаем общую статистику
      const successful = results.filter(r => r.success).length
      const total = results.length

      logger.info({
        message: `🏁 Тесты вебхуков завершены: ${successful}/${total} успешно`,
        description: 'Webhook tests completed',
        successCount: successful,
        totalCount: total,
      })

      return results
    } catch (error) {
      logger.error({
        message: '❌ Критическая ошибка при выполнении тестов вебхуков',
        description: 'Critical error during webhook tests',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }
}

/**
 * Класс для тестирования вебхуков BFL
 */
export class BFLWebhookTester {
  /**
   * Отправляет вебхук и проверяет результат
   */
  async sendWebhook(
    payload: WebhookPayload,
    options: WebhookOptions = { checkDatabase: true }
  ): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `BFL Webhook test: ${payload.status || 'completed'}`

    try {
      logger.info({
        message: '🧪 Тест отправки вебхука BFL',
        description: 'BFL webhook send test',
        status: payload.status || 'completed',
        taskId: payload.task_id,
      })

      // Формируем URL для запроса
      const webhookUrl = `${TEST_CONFIG.server.apiUrl}${TEST_CONFIG.server.bflWebhookPath}`

      // Подготавливаем данные для отправки
      const webhookData: WebhookPayload = {
        task_id: payload.task_id,
        status: payload.status || 'completed',
        result: payload.result || null,
      }

      // Отправляем вебхук
      const response = await axios.post(webhookUrl, webhookData, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Проверяем статус ответа
      if (response.status !== 200) {
        throw new Error(`Unexpected status code: ${response.status}`)
      }

      const duration = Date.now() - startTime

      return {
        name: testName,
        success: true,
        message: `Вебхук BFL успешно отправлен за ${duration}мс`,
        details: {
          responseData: response.data,
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке вебхука BFL',
        description: 'Error during BFL webhook test',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при отправке вебхука BFL',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      }
    }
  }

  /**
   * Тестирует успешное завершение тренировки в BFL
   */
  async testSuccessfulTraining(): Promise<TestResult> {
    const mockTraining: WebhookPayload = {
      id: 'test-bfl-training-id',
      task_id: 'test-bfl-task-id',
      model: 'stability-ai/stable-diffusion',
      version:
        'db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf',
      status: 'SUCCESS',
      output: {
        uri: 'https://example.com/bfl-output.jpg',
        version: '1.0.0',
      },
      metrics: {
        predict_time: 1000,
      },
    }

    logger.info({
      message: '🧪 Тест вебхука успешной BFL тренировки',
      description: 'Successful BFL training webhook test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Тестирует ошибку при тренировке в BFL
   */
  async testFailedTraining(): Promise<TestResult> {
    const mockTraining: WebhookPayload = {
      id: 'test-bfl-training-id-failed',
      task_id: 'test-bfl-task-id-failed',
      model: 'stability-ai/stable-diffusion',
      version:
        'db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf',
      status: 'FAILED',
      error: 'Test BFL error message',
    }

    logger.info({
      message: '🧪 Тест вебхука неудачной BFL тренировки',
      description: 'Failed BFL training webhook test',
      sample: mockTraining,
    })

    return this.sendWebhook(mockTraining)
  }

  /**
   * Запускает все тесты последовательно
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []

    // Успешная тренировка
    results.push(await this.testSuccessfulTraining())

    // Ошибочная тренировка
    results.push(await this.testFailedTraining())

    return results
  }
}

/**
 * Класс для тестирования вебхуков нейрофото
 */
export class NeuroPhotoWebhookTester {
  /**
   * Отправляет вебхук для тестирования нейрофото и проверяет результат
   * @param payload Данные для отправки
   * @param options Опции отправки
   */
  async sendWebhook(
    payload: WebhookPayload,
    options: WebhookOptions = { checkDatabase: true }
  ): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `NeuroPhoto Webhook test: ${payload.status || 'unknown'}`

    try {
      logger.info({
        message: '🧪 Тест отправки вебхука NeuroPhoto',
        description: 'NeuroPhoto webhook send test',
        status: payload.status,
        taskId: payload.task_id,
      })

      // Формируем URL для запроса
      const webhookUrl = `${TEST_CONFIG.server.apiUrl}${TEST_CONFIG.server.neurophotoWebhookPath}`

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

      const duration = Date.now() - startTime

      return {
        name: testName,
        success: true,
        message: `Вебхук NeuroPhoto успешно отправлен за ${duration}мс`,
        details: {
          responseData: response.data,
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке вебхука NeuroPhoto',
        description: 'Error during NeuroPhoto webhook test',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при отправке вебхука NeuroPhoto',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      }
    }
  }

  /**
   * Тестирует успешное завершение генерации изображения
   */
  async testSuccessfulGeneration(): Promise<TestResult> {
    const mockGeneration: WebhookPayload = {
      id: 'test-neurophoto-id',
      task_id: 'test-neurophoto-task-id',
      model: 'stability-ai/stable-diffusion',
      version:
        'db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf',
      status: 'SUCCESS',
      output: {
        uri: 'https://example.com/neurophoto-output.jpg',
        version: '1.0.0',
      },
      metrics: {
        predict_time: 1000,
      },
    }

    logger.info({
      message: '🧪 Тест вебхука успешной NeuroPhoto генерации',
      description: 'Successful NeuroPhoto generation webhook test',
      sample: mockGeneration,
    })

    return this.sendWebhook(mockGeneration)
  }

  /**
   * Тестирует неудачное завершение генерации изображения
   */
  async testFailedGeneration(): Promise<TestResult> {
    const mockGeneration: WebhookPayload = {
      id: 'test-neurophoto-id-failed',
      task_id: 'test-neurophoto-task-id-failed',
      model: 'stability-ai/stable-diffusion',
      version:
        'db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf',
      status: 'FAILED',
      error: 'Test NeuroPhoto error message',
    }

    logger.info({
      message: '🧪 Тест вебхука неудачной NeuroPhoto генерации',
      description: 'Failed NeuroPhoto generation webhook test',
      sample: mockGeneration,
    })

    return this.sendWebhook(mockGeneration)
  }

  /**
   * Запускает все тесты вебхуков нейрофото
   * @param options Параметры запуска тестов
   */
  async runAllTests(options = { checkDatabase: true }): Promise<TestResult[]> {
    logger.info({
      message: '🧪 Запуск всех тестов вебхуков нейрофото',
      description: 'Running all neurophoto webhook tests',
      options,
    })

    const results: TestResult[] = []

    if (options.checkDatabase) {
      // Выполняем тесты с проверкой базы данных
      results.push(await this.testSuccessfulGeneration())
      results.push(await this.testFailedGeneration())
    } else {
      // Выполняем тесты без создания записей в базе данных
      // и без проверки данных в базе (dry run)
      logger.info({
        message: '🧪 Запуск тестов в режиме dry run (без проверки базы данных)',
        description: 'Running neurophoto webhook tests in dry run mode',
      })

      // Используем примеры из конфигурации напрямую
      for (const sample of TEST_CONFIG.neurophoto.samples) {
        const taskId = `test-dryrun-${sample.task_id}-${Date.now()}`
        const payload: WebhookPayload = {
          task_id: taskId,
          status: sample.status,
          result: sample.result,
        }

        results.push(
          await this.sendWebhook(payload, {
            checkDatabase: false,
          })
        )
      }
    }

    logger.info({
      message: '✅ Все тесты вебхуков нейрофото выполнены',
      description: 'All neurophoto webhook tests completed',
      totalTests: results.length,
      successfulTests: results.filter(r => r.success).length,
    })

    return results
  }
}
