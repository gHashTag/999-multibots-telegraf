import axios from 'axios'
import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { testSupabase } from './test-env'
import { TestResult } from './types'

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
    const startTime = Date.now()
    const testName = `Webhook test: ${payload.status}`

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
          const { data } = await testSupabase
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
          const { data } = await testSupabase
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
      return {
        name: testName,
        success: true,
        message: `Вебхук успешно отправлен за ${duration}мс`,
        details: {
          responseData: response.data,
          databaseCheck: options.checkDatabase
            ? {
                beforeStatus,
                afterStatus,
                changed: beforeStatus !== afterStatus,
              }
            : null,
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
    const sample = TEST_CONFIG.modelTraining.samples.find(
      s => s.status === 'SUCCESS'
    )

    if (!sample) {
      return {
        name: 'Successful training webhook test',
        success: false,
        message: 'Нет примера успешной тренировки в конфигурации',
        error: 'No sample found',
      }
    }

    logger.info({
      message: '🧪 Тест вебхука успешной тренировки',
      description: 'Successful training webhook test',
      sample,
    })

    // Формируем правильную структуру пейлоада для вебхука
    const payload = {
      id: sample.trainingId,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'SUCCESS',
      output: {
        uri: sample.outputUrl,
        version: sample.version,
      },
      metrics: {
        predict_time: sample.metrics.predict_time,
      },
    }

    return this.sendWebhook(payload)
  }

  /**
   * Тестирует неудачное завершение тренировки
   */
  async testFailedTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.modelTraining.samples.find(
      s => s.status === 'failed'
    )

    if (!sample) {
      return {
        name: 'Failed training webhook test',
        success: false,
        message: 'Нет примера неудачной тренировки в конфигурации',
        error: 'No sample found',
      }
    }

    logger.info({
      message: '🧪 Тест вебхука неудачной тренировки',
      description: 'Failed training webhook test',
      sample,
    })

    // Формируем правильную структуру пейлоада для вебхука
    const payload = {
      id: sample.trainingId,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'failed',
      error: sample.error || 'Unknown error occurred during training',
      metrics: {
        predict_time: sample.metrics.predict_time,
      },
    }

    return this.sendWebhook(payload)
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
        message: 'Нет примера отмененной тренировки в конфигурации',
        error: 'No sample found',
      }
    }

    logger.info({
      message: '🧪 Тест вебхука отмененной тренировки',
      description: 'Canceled training webhook test',
      sample,
    })

    // Формируем правильную структуру пейлоада для вебхука
    const payload = {
      id: sample.trainingId,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'canceled',
      metrics: {
        predict_time: sample.metrics.predict_time,
      },
    }

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
    payload: any,
    options = { checkDatabase: true }
  ): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `BFL Webhook test: ${payload.status}`

    try {
      logger.info({
        message: '🧪 Тест отправки BFL вебхука',
        description: 'BFL webhook send test',
        status: payload.status,
        task_id: payload.task_id,
      })

      // Проверяем статус тренировки в базе перед запросом, если нужно
      let beforeStatus: string | null = null
      if (options.checkDatabase) {
        try {
          const { data } = await testSupabase
            .from('model_trainings')
            .select('status')
            .eq('finetune_id', payload.task_id)
            .limit(1)
            .single()

          beforeStatus = data?.status || null
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус BFL тренировки до теста',
            description: 'Failed to get BFL training status before test',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Формируем URL для запроса
      const webhookUrl = `${TEST_CONFIG.server.apiUrl}${TEST_CONFIG.server.bflWebhookPath}`

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
          const { data } = await testSupabase
            .from('model_trainings')
            .select('status')
            .eq('finetune_id', payload.task_id)
            .limit(1)
            .single()

          afterStatus = data?.status || null
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус BFL тренировки после теста',
            description: 'Failed to get BFL training status after test',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      const duration = Date.now() - startTime
      return {
        name: testName,
        success: true,
        message: `BFL вебхук успешно отправлен за ${duration}мс`,
        details: {
          responseData: response.data,
          databaseCheck: options.checkDatabase
            ? {
                beforeStatus,
                afterStatus,
                changed: beforeStatus !== afterStatus,
              }
            : null,
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке BFL вебхука',
        description: 'Error during BFL webhook test',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при отправке BFL вебхука',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      }
    }
  }

  /**
   * Тестирует успешное завершение тренировки в BFL
   */
  async testSuccessfulTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.bflTraining.samples.find(
      s => s.status === 'COMPLETED'
    )

    if (!sample) {
      return {
        name: 'BFL successful training webhook test',
        success: false,
        message: 'Нет примера успешной BFL тренировки в конфигурации',
        error: 'No sample found',
      }
    }

    logger.info({
      message: '🧪 Тест вебхука успешной BFL тренировки',
      description: 'BFL successful training webhook test',
      sample,
    })

    return this.sendWebhook(sample)
  }

  /**
   * Тестирует ошибку при тренировке в BFL
   */
  async testErrorTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.bflTraining.samples.find(
      s => s.status === 'ERROR'
    )

    if (!sample) {
      return {
        name: 'BFL error training webhook test',
        success: false,
        message: 'Нет примера ошибочной BFL тренировки в конфигурации',
        error: 'No sample found',
      }
    }

    logger.info({
      message: '🧪 Тест вебхука ошибочной BFL тренировки',
      description: 'BFL error training webhook test',
      sample,
    })

    return this.sendWebhook(sample)
  }

  /**
   * Тестирует в процессе тренировки в BFL
   */
  async testPendingTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.bflTraining.samples.find(
      s => s.status === 'PENDING'
    )

    if (!sample) {
      return {
        name: 'BFL pending training webhook test',
        success: false,
        message: 'Нет примера ожидающей BFL тренировки в конфигурации',
        error: 'No sample found',
      }
    }

    logger.info({
      message: '🧪 Тест вебхука ожидающей BFL тренировки',
      description: 'BFL pending training webhook test',
      sample,
    })

    return this.sendWebhook(sample)
  }

  /**
   * Запускает все тесты последовательно
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []

    // Успешная тренировка
    results.push(await this.testSuccessfulTraining())

    // Ошибочная тренировка
    results.push(await this.testErrorTraining())

    // Ожидающая тренировка
    results.push(await this.testPendingTraining())

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
    options = { checkDatabase: true, useDebugEndpoint: false }
  ): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `Neurophoto webhook test: ${payload.status}`

    try {
      logger.info({
        message: '🧪 Тест отправки вебхука нейрофото',
        description: 'Neurophoto webhook send test',
        status: payload.status,
        taskId: payload.task_id,
        useDebugEndpoint: options.useDebugEndpoint,
      })

      // Проверяем данные в базе перед запросом, если нужно
      let beforeData: any = null
      if (options.checkDatabase) {
        try {
          const { data } = await testSupabase
            .from('prompt_history')
            .select('*')
            .eq('task_id', payload.task_id)
            .limit(1)
            .single()

          beforeData = data || null
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить данные промпта до теста',
            description: 'Failed to get prompt data before test',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Формируем URL для запроса
      const endpoint = options.useDebugEndpoint
        ? '/webhooks/neurophoto-debug'
        : TEST_CONFIG.server.neurophotoWebhookPath
      const webhookUrl = `${TEST_CONFIG.server.apiUrl}${endpoint}`

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
      let afterData: any = null
      if (options.checkDatabase) {
        // Ждем, чтобы изменения успели примениться
        await new Promise(resolve => setTimeout(resolve, 1000))

        try {
          const { data } = await testSupabase
            .from('prompt_history')
            .select('*')
            .eq('task_id', payload.task_id)
            .limit(1)
            .single()

          afterData = data || null
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить данные промпта после теста',
            description: 'Failed to get prompt data after test',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      const duration = Date.now() - startTime
      return {
        name: testName,
        success: true,
        message: `Вебхук нейрофото успешно отправлен за ${duration}мс`,
        details: {
          responseData: response.data,
          databaseCheck: options.checkDatabase
            ? {
                beforeData,
                afterData,
                changed:
                  JSON.stringify(beforeData) !== JSON.stringify(afterData),
              }
            : null,
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке вебхука нейрофото',
        description: 'Error during neurophoto webhook test',
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при отправке вебхука нейрофото',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      }
    }
  }

  /**
   * Тестирует успешное завершение генерации изображения
   */
  async testSuccessfulGeneration(): Promise<TestResult> {
    // Используем предустановленный пример из конфигурации
    const sample = TEST_CONFIG.neurophoto.samples.find(
      s => s.status === 'COMPLETED'
    )

    if (!sample) {
      return {
        name: 'Successful neurophoto generation webhook test',
        success: false,
        message: 'Нет примера успешной генерации нейрофото в конфигурации',
        error: 'No sample found',
      }
    }

    // Создаем уникальный task_id для теста
    const taskId = `${sample.task_id}-${Date.now()}`

    // Сначала добавим запись в базу данных для тестирования
    try {
      const { error } = await testSupabase.from('prompt_history').insert({
        task_id: taskId,
        telegramId: TEST_CONFIG.users.default.telegramId,
        bot_name: TEST_CONFIG.bots.default,
        language_code: 'ru',
        prompt: 'Тестовый промпт для нейрофото',
        status: 'processing',
      })

      if (error) {
        logger.error({
          message: '❌ Ошибка при создании тестовой записи',
          description: 'Error creating test record',
          error: error instanceof Error ? error.message : 'Unknown error',
        })

        return {
          name: 'Successful neurophoto generation webhook test',
          success: false,
          message: 'Не удалось создать тестовую запись в базе данных',
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    } catch (error) {
      return {
        name: 'Successful neurophoto generation webhook test',
        success: false,
        message: 'Не удалось создать тестовую запись в базе данных',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    logger.info({
      message: '🧪 Тест вебхука успешной генерации изображения',
      description: 'Successful neurophoto generation webhook test',
      taskId,
    })

    // Формируем пейлоад для успешного вебхука
    const payload = {
      task_id: taskId,
      status: sample.status,
      result: sample.result,
    }

    return this.sendWebhook(payload)
  }

  /**
   * Тестирует обработку задачи в процессе выполнения
   */
  async testProcessingStatus(): Promise<TestResult> {
    // Используем предустановленный пример из конфигурации
    const sample = TEST_CONFIG.neurophoto.samples.find(
      s => s.status === 'processing'
    )

    if (!sample) {
      return {
        name: 'Processing neurophoto webhook test',
        success: false,
        message: 'Нет примера processing статуса в конфигурации',
        error: 'No sample found',
      }
    }

    // Создаем уникальный task_id для теста
    const taskId = `${sample.task_id}-${Date.now()}`

    // Сначала добавим запись в базу данных для тестирования
    try {
      const { error } = await testSupabase.from('prompt_history').insert({
        task_id: taskId,
        telegramId: TEST_CONFIG.users.default.telegramId,
        bot_name: TEST_CONFIG.bots.default,
        language_code: 'ru',
        prompt: 'Тестовый промпт для нейрофото в обработке',
        status: 'created',
      })

      if (error) {
        return {
          name: 'Processing neurophoto webhook test',
          success: false,
          message: 'Не удалось создать тестовую запись в базе данных',
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    } catch (error) {
      return {
        name: 'Processing neurophoto webhook test',
        success: false,
        message: 'Не удалось создать тестовую запись в базе данных',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    logger.info({
      message: '🧪 Тест вебхука нейрофото со статусом processing',
      description: 'Processing neurophoto webhook test',
      taskId,
    })

    // Формируем пейлоад для вебхука со статусом processing
    const payload = {
      task_id: taskId,
      status: sample.status,
    }

    return this.sendWebhook(payload)
  }

  /**
   * Тестирует обработку модерации контента
   */
  async testContentModeration(): Promise<TestResult> {
    // Используем предустановленный пример из конфигурации
    const sample = TEST_CONFIG.neurophoto.samples.find(
      s => s.status === 'Content Moderated'
    )

    if (!sample) {
      return {
        name: 'Content moderation neurophoto webhook test',
        success: false,
        message: 'Нет примера модерации в конфигурации',
        error: 'No sample found',
      }
    }

    // Создаем уникальный task_id для теста
    const taskId = `${sample.task_id}-${Date.now()}`

    // Сначала добавим запись в базу данных для тестирования
    try {
      const { error } = await testSupabase.from('prompt_history').insert({
        task_id: taskId,
        telegramId: TEST_CONFIG.users.default.telegramId,
        bot_name: TEST_CONFIG.bots.default,
        language_code: 'ru',
        prompt: 'Тестовый промпт для модерации нейрофото',
        status: 'processing',
      })

      if (error) {
        return {
          name: 'Content moderation neurophoto webhook test',
          success: false,
          message: 'Не удалось создать тестовую запись в базе данных',
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    } catch (error) {
      return {
        name: 'Content moderation neurophoto webhook test',
        success: false,
        message: 'Не удалось создать тестовую запись в базе данных',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    logger.info({
      message: '🧪 Тест вебхука нейрофото с модерацией контента',
      description: 'Content moderation neurophoto webhook test',
      taskId,
    })

    // Формируем пейлоад для вебхука с модерацией
    const payload = {
      task_id: taskId,
      status: sample.status,
    }

    return this.sendWebhook(payload)
  }

  /**
   * Запускает все тесты вебхуков нейрофото
   * @param options Параметры запуска тестов
   */
  async runAllTests(
    options = { checkDatabase: true, useDebugEndpoint: false }
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
        useDebugEndpoint: options.useDebugEndpoint,
      })

      // Используем примеры из конфигурации напрямую
      for (const sample of TEST_CONFIG.neurophoto.samples) {
        const taskId = `test-dryrun-${sample.task_id}-${Date.now()}`
        const payload = {
          task_id: taskId,
          status: sample.status,
          result: sample.result,
        }

        results.push(
          await this.sendWebhook(payload, {
            checkDatabase: false,
            useDebugEndpoint: options.useDebugEndpoint,
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

