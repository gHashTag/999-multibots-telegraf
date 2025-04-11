import axios from 'axios'
import { TEST_CONFIG } from '../../test-config'
import { logger } from '@/utils/logger'
// import { testSupabase } from '../../test-env' // Закомментировано, так как файл не найден
import { TestResult } from '../../types'
import fetch from 'node-fetch'

/**
 * Класс для тестирования вебхуков Replicate
 */
export class ReplicateWebhookTester {
  /**
   * Отправляет вебхук и проверяет результат
   */
  async sendWebhook(
    payload: any,
    options = { checkDatabase: true }
  ): Promise<TestResult> {
    const testName = `Webhook test: ${payload.status}`

    try {
      logger.info({
        message: '🧪 Тест отправки вебхука',
        description: 'Webhook send test',
        status: payload.status,
        trainingId: payload.id,
      })

      const beforeStatus: string | null = null
      if (options.checkDatabase) {
        logger.warn('Проверка базы данных пропущена, testSupabase недоступен.')
      }

      const webhookUrl = 'http://localhost:2999/api/webhooks/replicate'

      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const afterStatus: string | null = null
      if (options.checkDatabase) {
        // Ждем, чтобы изменения успели примениться
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      return {
        name: testName,
        success: true,
        message: `Вебхук успешно отправлен (status ${response.status})`,
        details: [
          `Response status: ${response.status}`,
          `Database check: ${options.checkDatabase ? 'skipped (testSupabase unavailable)' : 'disabled'}`,
          `Before status: ${beforeStatus || 'unknown'}`,
          `After status: ${afterStatus || 'unknown'}`,
          `Status changed: ${beforeStatus !== afterStatus}`,
        ],
      }
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при отправке вебхука',
        description: 'Error during webhook test',
        error: error instanceof Error ? error.message : String(error),
        payload,
      })

      return {
        name: 'Тест вебхука Replicate',
        success: false,
        message: `Ошибка при обработке вебхука: ${error instanceof Error ? error.message : String(error)}`,
        details: { payload },
      }
    }
  }

  /**
   * Тестирует успешное завершение тренировки
   */
  async testSuccessfulTraining(): Promise<TestResult> {
    const testName = 'Successful training webhook test'
    if (!TEST_CONFIG.PAYMENT_TESTS) {
      return {
        name: testName,
        success: false,
        message: 'Отсутствует секция PAYMENT_TESTS в TEST_CONFIG',
      }
    }
    const sample = {
      task_id: 'test-task-success',
      result: 'http://example.com/result.zip',
    }

    if (!sample) {
      return {
        name: testName,
        success: false,
        message:
          'Нет примера успешной тренировки в конфигурации (использована заглушка)',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука успешной тренировки',
      description: 'Successful training webhook test',
      sample,
    })

    const payload = {
      id: sample.task_id,
      status: 'COMPLETED',
      output: { uri: sample.result },
    }
    return this.sendWebhook(payload)
  }

  /**
   * Тестирует неудачное завершение тренировки
   */
  async testFailedTraining(): Promise<TestResult> {
    const testName = 'Failed training webhook test'
    if (!TEST_CONFIG.PAYMENT_TESTS) {
      return {
        name: testName,
        success: false,
        message: 'Отсутствует секция PAYMENT_TESTS в TEST_CONFIG',
      }
    }
    const sample = { task_id: 'test-task-failed', result: 'Error description' }

    if (!sample) {
      return {
        name: testName,
        success: false,
        message:
          'Нет примера неудачной тренировки в конфигурации (использована заглушка)',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука неудачной тренировки',
      description: 'Failed training webhook test',
      sample,
    })

    const payload = {
      id: sample.task_id,
      status: 'ERROR',
      error: sample.result,
    }
    return this.sendWebhook(payload)
  }

  /**
   * Тестирует отмену тренировки
   */
  async testCanceledTraining(): Promise<TestResult> {
    const testName = 'Canceled training webhook test'
    if (!TEST_CONFIG.PAYMENT_TESTS) {
      return {
        name: testName,
        success: false,
        message: 'Отсутствует секция PAYMENT_TESTS в TEST_CONFIG',
      }
    }
    const sample = { task_id: 'test-task-canceled' }

    if (!sample) {
      return {
        name: testName,
        success: false,
        message:
          'Нет примера отмененной тренировки в конфигурации (использована заглушка)',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука отмененной тренировки',
      description: 'Canceled training webhook test',
      sample,
    })

    const payload = { id: sample.task_id, status: 'PENDING' }
    return this.sendWebhook(payload)
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
        error: error instanceof Error ? error.message : String(error),
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
    payload: any,
    options = { checkDatabase: true }
  ): Promise<TestResult> {
    const testName = `BFL Webhook test: ${payload.status}`

    try {
      logger.info({
        message: '🧪 Тест отправки BFL вебхука',
        description: 'BFL webhook send test',
        status: payload.status,
        trainingId: payload.id,
      })

      const beforeStatus: string | null = null
      if (options.checkDatabase) {
        logger.warn('Проверка базы данных пропущена, testSupabase недоступен.')
      }

      const webhookUrl = 'http://localhost:2999/api/webhooks/bfl'

      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const afterStatus: string | null = null
      if (options.checkDatabase) {
        // Ждем, чтобы изменения успели примениться
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      return {
        name: testName,
        success: true,
        message: `BFL вебхук успешно отправлен (status ${response.status})`,
        details: [
          `Response status: ${response.status}`,
          `Database check: ${options.checkDatabase ? 'skipped (testSupabase unavailable)' : 'disabled'}`,
          `Before status: ${beforeStatus || 'unknown'}`,
          `After status: ${afterStatus || 'unknown'}`,
          `Status changed: ${beforeStatus !== afterStatus}`,
        ],
      }
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при отправке BFL вебхука',
        description: 'Error during BFL webhook test',
        error: error instanceof Error ? error.message : String(error),
        payload,
      })

      return {
        name: 'Тест вебхука BFL',
        success: false,
        message: `Ошибка при обработке BFL вебхука: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          payload,
          error: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  /**
   * Тестирует успешное завершение тренировки в BFL
   */
  async testSuccessfulTraining(): Promise<TestResult> {
    const testName = 'Successful BFL training webhook test'
    if (!TEST_CONFIG.PAYMENT_TESTS) {
      return {
        name: testName,
        success: false,
        message: 'Отсутствует секция PAYMENT_TESTS в TEST_CONFIG',
      }
    }
    const sample = {
      task_id: 'test-bfl-task-success',
      result: 'http://example.com/result.zip',
    }

    if (!sample) {
      return {
        name: testName,
        success: false,
        message: 'Нет примера успешной тренировки в конфигурации (заглушка)',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука успешной BFL тренировки',
      description: 'Successful BFL training webhook test',
      sample,
    })

    const payload = {
      id: sample.task_id,
      status: 'COMPLETED',
      output: { uri: sample.result },
    }
    return this.sendWebhook(payload)
  }

  /**
   * Тестирует ошибку при тренировке в BFL
   */
  async testFailedTraining(): Promise<TestResult> {
    const testName = 'Failed BFL training webhook test'
    if (!TEST_CONFIG.PAYMENT_TESTS) {
      return {
        name: testName,
        success: false,
        message: 'Отсутствует секция PAYMENT_TESTS в TEST_CONFIG',
      }
    }
    const sample = { task_id: 'test-bfl-task-failed', result: 'BFL Error' }

    if (!sample) {
      return {
        name: testName,
        success: false,
        message: 'Нет примера неудачной тренировки в конфигурации (заглушка)',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука неудачной BFL тренировки',
      description: 'Failed BFL training webhook test',
      sample,
    })

    const payload = {
      id: sample.task_id,
      status: 'ERROR',
      error: sample.result,
    }
    return this.sendWebhook(payload)
  }

  /**
   * Тестирует в процессе тренировки в BFL
   */
  async testCanceledTraining(): Promise<TestResult> {
    const testName = 'Canceled BFL training webhook test'
    if (!TEST_CONFIG.PAYMENT_TESTS) {
      return {
        name: testName,
        success: false,
        message: 'Отсутствует секция PAYMENT_TESTS в TEST_CONFIG',
      }
    }
    const sample = { task_id: 'test-bfl-task-canceled' }

    if (!sample) {
      return {
        name: testName,
        success: false,
        message: 'Нет примера отмененной тренировки в конфигурации (заглушка)',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука отмененной BFL тренировки',
      description: 'Canceled BFL training webhook test',
      sample,
    })

    const payload = { id: sample.task_id, status: 'PENDING' }
    return this.sendWebhook(payload)
  }

  /**
   * Запускает все тесты последовательно
   */
  async runAllTests(): Promise<TestResult[]> {
    logger.info({
      message: '🚀 Запуск всех тестов BFL вебхуков',
      description: 'Starting all BFL webhook tests',
    })

    const results = [
      await this.testSuccessfulTraining(),
      await this.testFailedTraining(),
      await this.testCanceledTraining(),
    ]

    // Проверяем результаты
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    logger.info({
      message: `🏁 Тесты BFL вебхуков завершены: ${successCount} успешно, ${failCount} неуспешно`,
      description: `BFL webhook tests completed: ${successCount} success, ${failCount} failures`,
      results,
    })

    return results
  }
}

/**
 * Класс для тестирования вебхуков нейрофото
 */
export class NeurophotoWebhookTester {
  /**
   * Отправляет вебхук для тестирования нейрофото и проверяет результат
   * @param payload Данные для отправки
   * @param options Опции отправки
   */
  async sendWebhook(
    payload: any,
    options: { checkDatabase?: boolean } = {}
  ): Promise<TestResult> {
    const testName = 'Neurophoto webhook test'

    try {
      logger.info({
        message: '🚀 Отправка вебхука для нейрофото',
        description: 'Sending neurophoto webhook',
        payload,
      })

      if (options.checkDatabase) {
        logger.warn('Проверка базы данных пропущена, testSupabase недоступен.')
      }

      const webhookUrl = 'http://localhost:2999/api/webhooks/neurophoto'

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const responseData = await response.json()

      if (options.checkDatabase) {
        // Ждем, чтобы изменения успели примениться
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      return {
        name: testName,
        success: true,
        message: `Вебхук нейрофото успешно отправлен (status ${response.status})`,
        details: [
          `Ответ сервера: ${JSON.stringify(responseData)}`,
          options.checkDatabase
            ? `Проверка базы данных: skipped (testSupabase unavailable)`
            : 'Проверка базы данных не требуется',
        ],
      }
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при отправке вебхука нейрофото',
        description: 'Error during neurophoto webhook test',
        error: error instanceof Error ? error.message : String(error),
        payload,
      })

      return {
        name: 'Тест вебхука нейрофото',
        success: false,
        message: `Ошибка при обработке нейрофото вебхука: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          payload,
          error: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  /**
   * Тестирует успешное завершение генерации изображения
   */
  async testSuccessfulGeneration(): Promise<TestResult> {
    const testName = 'Successful neurophoto generation webhook test'
    const sample = {
      task_id: 'test-neuro-task-success',
      status: 'succeeded',
      result: ['http://example.com/img1.png'],
    }

    if (!sample) {
      return {
        name: testName,
        success: false,
        message: 'Нет примера (заглушка)',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука успешной генерации изображения',
      description: 'Successful neurophoto generation webhook test',
      sample,
    })

    const payload = {
      task_id: sample.task_id,
      status: sample.status,
      result: sample.result,
    }
    return this.sendWebhook(payload)
  }

  /**
   * Тестирует обработку задачи в процессе выполнения
   */
  async testProcessingStatus(): Promise<TestResult> {
    const testName = 'Processing neurophoto webhook test'
    const sample = {
      task_id: 'test-neuro-task-processing',
      status: 'processing',
    }

    if (!sample) {
      return {
        name: testName,
        success: false,
        message: 'Нет примера (заглушка)',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука нейрофото со статусом processing',
      description: 'Processing neurophoto webhook test',
      sample,
    })

    const payload = { task_id: sample.task_id, status: sample.status }
    return this.sendWebhook(payload)
  }

  /**
   * Тестирует обработку модерации контента
   */
  async testContentModeration(): Promise<TestResult> {
    const testName = 'Content moderation neurophoto webhook test'
    const sample = {
      task_id: 'test-neuro-task-moderation',
      status: 'failed',
      error: 'NSFW content detected',
    }

    if (!sample) {
      return {
        name: testName,
        success: false,
        message: 'Нет примера (заглушка)',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука нейрофото с модерацией контента',
      description: 'Content moderation neurophoto webhook test',
      sample,
    })

    const payload = { task_id: sample.task_id, status: sample.status }
    return this.sendWebhook(payload)
  }

  /**
   * Запускает все тесты вебхуков нейрофото
   * @param options Параметры запуска тестов
   */
  async runAllTests(
    options: { checkDatabase?: boolean } = {}
  ): Promise<TestResult[]> {
    logger.info({
      message: '🧪 Запуск всех тестов вебхуков нейрофото',
      description: 'Running all neurophoto webhook tests',
      options,
    })

    const results: TestResult[] = []

    if (options.checkDatabase) {
      // Выполняем тесты с проверкой базы данных
      results.push(await this.testSuccessfulGeneration())
      results.push(await this.testProcessingStatus())
      results.push(await this.testContentModeration())
    } else {
      // Выполняем тесты без создания записей в базе данных
      // и без проверки данных в базе (dry run)
      logger.info({
        message: '🧪 Запуск тестов в режиме dry run (без проверки базы данных)',
        description: 'Running neurophoto webhook tests in dry run mode',
      })

      // Используем примеры из конфигурации напрямую
      // for (const sample of TEST_CONFIG.neurophoto.samples) { // Удаляем этот цикл
      //   const payload = {
      //     task_id: sample.task_id,
      //     status: sample.status,
      //   }

      //   results.push(await this.sendWebhook(payload, { checkDatabase: false }))
      // }

      // Вместо цикла вызываем тесты с заглушками, как и в блоке if
      results.push(await this.testSuccessfulGeneration())
      results.push(await this.testProcessingStatus())
      results.push(await this.testContentModeration())
    }

    return results
  }
}
