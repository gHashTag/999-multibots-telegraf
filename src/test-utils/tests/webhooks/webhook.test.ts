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
            .from('bfl_trainings')
            .select('status')
            .eq('replicate_training_id', payload.id)
            .limit(1)
            .single()

          beforeStatus = data?.status || null
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус тренировки до теста',
            description: 'Failed to get training status before test',
            error: error instanceof Error ? error.message : String(error),
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
            .from('bfl_trainings')
            .select('status')
            .eq('replicate_training_id', payload.id)
            .limit(1)
            .single()

          afterStatus = data?.status || null
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус тренировки после теста',
            description: 'Failed to get training status after test',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const duration = Date.now() - startTime
      return {
        name: testName,
        passed: true,
        success: true,
        message: `Вебхук успешно отправлен за ${duration}мс`,
        details: [
          `Response status: ${response.status}`,
          `Database check: ${options.checkDatabase ? 'enabled' : 'disabled'}`,
          `Before status: ${beforeStatus || 'unknown'}`,
          `After status: ${afterStatus || 'unknown'}`,
          `Status changed: ${beforeStatus !== afterStatus}`,
        ],
        duration,
        testName: 'ReplicateWebhookTest',
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке вебхука',
        description: 'Error during webhook test',
        error: error instanceof Error ? error.message : String(error),
        payload,
      })

      return {
        name: 'Тест вебхука Replicate',
        passed: false,
        success: false,
        message: 'Ошибка при обработке вебхука',
        error: error instanceof Error ? error.message : String(error),
        duration,
        testName: 'ReplicateWebhookTest',
        details: { error },
      }
    }
  }

  /**
   * Тестирует успешное завершение тренировки
   */
  async testSuccessfulTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.bflTraining.samples.find(
      s => s.status === 'COMPLETED'
    )

    if (!sample) {
      return {
        name: 'Successful training webhook test',
        passed: false,
        success: false,
        message: 'Нет примера успешной тренировки в конфигурации',
        error: 'No sample found',
        duration: 0,
        testName: 'ReplicateWebhookTest',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука успешной тренировки',
      description: 'Successful training webhook test',
      sample,
    })

    // Формируем правильную структуру пейлоада для вебхука
    const payload = {
      id: sample.task_id,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'COMPLETED',
      output: {
        uri: sample.result,
        version: '1.0.0',
      },
      metrics: {
        predict_time: 1.5,
      },
    }

    return this.sendWebhook(payload)
  }

  /**
   * Тестирует неудачное завершение тренировки
   */
  async testFailedTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.bflTraining.samples.find(
      s => s.status === 'ERROR'
    )

    if (!sample) {
      return {
        name: 'Failed training webhook test',
        passed: false,
        success: false,
        message: 'Нет примера неудачной тренировки в конфигурации',
        error: 'No sample found',
        duration: 0,
        testName: 'ReplicateWebhookTest',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука неудачной тренировки',
      description: 'Failed training webhook test',
      sample,
    })

    // Формируем правильную структуру пейлоада для вебхука
    const payload = {
      id: sample.task_id,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'ERROR',
      error: sample.result ? sample.result : undefined,
    }

    return this.sendWebhook(payload)
  }

  /**
   * Тестирует отмену тренировки
   */
  async testCanceledTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.bflTraining.samples.find(
      s => s.status === 'PENDING'
    )

    if (!sample) {
      return {
        name: 'Canceled training webhook test',
        passed: false,
        success: false,
        message: 'Нет примера отмененной тренировки в конфигурации',
        error: 'No sample found',
        duration: 0,
        testName: 'ReplicateWebhookTest',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука отмененной тренировки',
      description: 'Canceled training webhook test',
      sample,
    })

    // Формируем правильную структуру пейлоада для вебхука
    const payload = {
      id: sample.task_id,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'PENDING',
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
    const startTime = Date.now()
    const testName = `BFL Webhook test: ${payload.status}`

    try {
      logger.info({
        message: '🧪 Тест отправки BFL вебхука',
        description: 'BFL webhook send test',
        status: payload.status,
        trainingId: payload.id,
      })

      // Проверяем статус тренировки в базе перед запросом, если нужно
      let beforeStatus: string | null = null
      if (options.checkDatabase) {
        try {
          const { data } = await testSupabase
            .from('bfl_trainings')
            .select('status')
            .eq('replicate_training_id', payload.id)
            .limit(1)
            .single()

          beforeStatus = data?.status || null
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус тренировки до теста',
            description: 'Failed to get training status before test',
            error: error instanceof Error ? error.message : String(error),
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
            .from('bfl_trainings')
            .select('status')
            .eq('replicate_training_id', payload.id)
            .limit(1)
            .single()

          afterStatus = data?.status || null
        } catch (error) {
          logger.warn({
            message: '⚠️ Не удалось получить статус тренировки после теста',
            description: 'Failed to get training status after test',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const duration = Date.now() - startTime
      return {
        name: testName,
        passed: true,
        success: true,
        message: `BFL вебхук успешно отправлен за ${duration}мс`,
        details: [
          `Response status: ${response.status}`,
          `Database check: ${options.checkDatabase ? 'enabled' : 'disabled'}`,
          `Before status: ${beforeStatus || 'unknown'}`,
          `After status: ${afterStatus || 'unknown'}`,
          `Status changed: ${beforeStatus !== afterStatus}`,
        ],
        duration,
        testName: 'BFLWebhookTest',
      }
    } catch (error) {
      const duration = Date.now() - startTime
      return {
        name: 'Тест вебхука BFL',
        passed: false,
        success: false,
        message: 'Ошибка при обработке вебхука',
        error: error instanceof Error ? error.message : String(error),
        duration,
        testName: 'BFLWebhookTest',
        details: { error: error instanceof Error ? error.message : String(error) },
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
        name: 'Successful BFL training webhook test',
        passed: false,
        success: false,
        message: 'Нет примера успешной тренировки в конфигурации',
        error: 'No sample found',
        duration: 0,
        testName: 'BFLWebhookTest',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука успешной BFL тренировки',
      description: 'Successful BFL training webhook test',
      sample,
    })

    // Формируем правильную структуру пейлоада для вебхука
    const payload = {
      id: sample.task_id,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'COMPLETED',
      output: {
        uri: sample.result,
        version: '1.0.0',
      },
      metrics: {
        predict_time: 1.5,
      },
    }

    return this.sendWebhook(payload)
  }

  /**
   * Тестирует ошибку при тренировке в BFL
   */
  async testFailedTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.bflTraining.samples.find(
      s => s.status === 'ERROR'
    )

    if (!sample) {
      return {
        name: 'Failed BFL training webhook test',
        passed: false,
        success: false,
        message: 'Нет примера неудачной тренировки в конфигурации',
        error: 'No sample found',
        duration: 0,
        testName: 'BFLWebhookTest',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука неудачной BFL тренировки',
      description: 'Failed BFL training webhook test',
      sample,
    })

    // Формируем правильную структуру пейлоада для вебхука
    const payload = {
      id: sample.task_id,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'ERROR',
      error: sample.result ? sample.result : undefined,
    }

    return this.sendWebhook(payload)
  }

  /**
   * Тестирует в процессе тренировки в BFL
   */
  async testCanceledTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.bflTraining.samples.find(
      s => s.status === 'PENDING'
    )

    if (!sample) {
      return {
        name: 'Canceled BFL training webhook test',
        passed: false,
        success: false,
        message: 'Нет примера отмененной тренировки в конфигурации',
        error: 'No sample found',
        duration: 0,
        testName: 'BFLWebhookTest',
        details: { error: 'No sample found' },
      }
    }

    logger.info({
      message: '🧪 Тест вебхука отмененной BFL тренировки',
      description: 'Canceled BFL training webhook test',
      sample,
    })

    // Формируем правильную структуру пейлоада для вебхука
    const payload = {
      id: sample.task_id,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: 'PENDING',
    }

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
    const startTime = Date.now()
    const testName = 'Neurophoto webhook test'

    try {
      logger.info({
        message: '🚀 Отправка вебхука для нейрофото',
        description: 'Sending neurophoto webhook',
        payload,
      })

      // Проверяем статус в базе данных до запроса
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
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      // Отправляем вебхук
      const response = await fetch(TEST_CONFIG.server.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      // Проверяем статус ответа
      if (response.status !== 200) {
        throw new Error(`Unexpected status code: ${response.status}`)
      }

      const responseData = await response.json()

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
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const duration = Date.now() - startTime
      return {
        name: testName,
        passed: true,
        success: true,
        message: `Вебхук нейрофото успешно отправлен за ${duration}мс`,
        details: [
          `Ответ сервера: ${JSON.stringify(responseData)}`,
          options.checkDatabase
            ? `Проверка базы данных: ${JSON.stringify({
                beforeData,
                afterData,
                changed:
                  JSON.stringify(beforeData) !== JSON.stringify(afterData),
              })}`
            : 'Проверка базы данных не требуется',
        ],
        duration,
        testName: 'NeurophotoWebhookTest',
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке вебхука нейрофото',
        description: 'Error during neurophoto webhook test',
        error: error instanceof Error ? error.message : String(error),
        payload,
      })

      return {
        name: 'Тест вебхука нейрофото',
        passed: false,
        success: false,
        message: 'Ошибка при обработке вебхука',
        error: error instanceof Error ? error.message : String(error),
        duration,
        testName: 'NeurophotoWebhookTest',
        details: { error },
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
        passed: false,
        success: false,
        message: 'Нет примера успешной генерации нейрофото в конфигурации',
        error: 'No sample found',
        duration: 0,
        testName: 'NeurophotoWebhookTest',
        details: { error: 'No sample found' },
      }
    }

    // Создаем уникальный task_id для теста
    const taskId = `${sample.task_id}-${Date.now()}`

    // Сначала добавим запись в базу данных для тестирования
    try {
      const { error } = await testSupabase.from('prompt_history').insert({
        task_id: taskId,
        telegram_id: TEST_CONFIG.user.telegramId,
        username: TEST_CONFIG.user.telegramId,
        bot_name: TEST_CONFIG.bot.name,
        language_code: 'ru',
        prompt: 'Тестовый промпт для нейрофото',
        status: 'processing',
      })

      if (error) {
        logger.error({
          message: '❌ Ошибка при создании тестовой записи',
          description: 'Error creating test record',
          error: error instanceof Error ? error.message : String(error),
        })

        return {
          name: 'Successful neurophoto generation webhook test',
          passed: false,
          success: false,
          message: 'Не удалось создать тестовую запись в базе данных',
          error: error instanceof Error ? error.message : String(error),
          duration: 0,
          testName: 'NeurophotoWebhookTest',
          details: { error: 'No sample found' },
        }
      }
    } catch (error) {
      return {
        name: 'Successful neurophoto generation webhook test',
        passed: false,
        success: false,
        message: 'Не удалось создать тестовую запись в базе данных',
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
        testName: 'NeurophotoWebhookTest',
        details: { error: 'No sample found' },
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
      result: 'result' in sample ? sample.result : undefined,
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
        passed: false,
        success: false,
        message: 'Нет примера processing статуса в конфигурации',
        error: 'No sample found',
        duration: 0,
        testName: 'NeurophotoWebhookTest',
        details: { error: 'No sample found' },
      }
    }

    // Создаем уникальный task_id для теста
    const taskId = `${sample.task_id}-${Date.now()}`

    // Сначала добавим запись в базу данных для тестирования
    try {
      const { error } = await testSupabase.from('prompt_history').insert({
        task_id: taskId,
        telegram_id: TEST_CONFIG.user.telegramId,
        username: TEST_CONFIG.user.telegramId,
        bot_name: TEST_CONFIG.bot.name,
        language_code: 'ru',
        prompt: 'Тестовый промпт для нейрофото в обработке',
        status: 'created',
      })

      if (error) {
        return {
          name: 'Processing neurophoto webhook test',
          passed: false,
          success: false,
          message: 'Не удалось создать тестовую запись в базе данных',
          error: error instanceof Error ? error.message : String(error),
          duration: 0,
          testName: 'NeurophotoWebhookTest',
          details: { error: 'No sample found' },
        }
      }
    } catch (error) {
      return {
        name: 'Processing neurophoto webhook test',
        passed: false,
        success: false,
        message: 'Не удалось создать тестовую запись в базе данных',
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
        testName: 'NeurophotoWebhookTest',
        details: { error: 'No sample found' },
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
        passed: false,
        success: false,
        message: 'Нет примера модерации в конфигурации',
        error: 'No sample found',
        duration: 0,
        testName: 'NeurophotoWebhookTest',
        details: { error: 'No sample found' },
      }
    }

    // Создаем уникальный task_id для теста
    const taskId = `${sample.task_id}-${Date.now()}`

    // Сначала добавим запись в базу данных для тестирования
    try {
      const { error } = await testSupabase.from('prompt_history').insert({
        task_id: taskId,
        telegram_id: TEST_CONFIG.user.telegramId,
        username: TEST_CONFIG.user.telegramId,
        bot_name: TEST_CONFIG.bot.name,
        language_code: 'ru',
        prompt: 'Тестовый промпт для модерации нейрофото',
        status: 'processing',
      })

      if (error) {
        return {
          name: 'Content moderation neurophoto webhook test',
          passed: false,
          success: false,
          message: 'Не удалось создать тестовую запись в базе данных',
          error: error instanceof Error ? error.message : String(error),
          duration: 0,
          testName: 'NeurophotoWebhookTest',
          details: { error: 'No sample found' },
        }
      }
    } catch (error) {
      return {
        name: 'Content moderation neurophoto webhook test',
        passed: false,
        success: false,
        message: 'Не удалось создать тестовую запись в базе данных',
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
        testName: 'NeurophotoWebhookTest',
        details: { error: 'No sample found' },
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
      for (const sample of TEST_CONFIG.neurophoto.samples) {
        const payload = {
          task_id: sample.task_id,
          status: sample.status,
        }

        results.push(await this.sendWebhook(payload, { checkDatabase: false }))
      }
    }

    return results
  }
}
