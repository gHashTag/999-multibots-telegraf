import axios from 'axios'
import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'

/**
 * Интерфейс для результатов теста
 */
interface TestResult {
  testName: string
  success: boolean
  message: string
  details?: any
  error?: string
  duration?: number
}

/**
 * Класс для тестирования Inngest функций
 */
export class InngestTester {
  private inngestDevUrl: string
  private eventKey: string

  constructor() {
    this.inngestDevUrl = process.env.INNGEST_DEV_URL || 'http://localhost:8288'
    this.eventKey = process.env.INNGEST_EVENT_KEY || 'test-event-key'
  }

  /**
   * Отправляет событие в Inngest Dev Server
   */
  async sendEvent(name: string, data: any): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `Inngest event test: ${name}`

    try {
      logger.info({
        message: '🧪 Тест отправки события Inngest',
        description: 'Inngest event send test',
        eventName: name,
      })

      // Отправляем событие в Inngest Dev Server
      const response = await axios.post(
        `${this.inngestDevUrl}/e/${this.eventKey}`,
        {
          name,
          data,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const duration = Date.now() - startTime
      return {
        testName,
        success: response.status === 200,
        message: `Событие "${name}" успешно отправлено за ${duration}мс`,
        details: {
          eventName: name,
          responseStatus: response.status,
          responseData: response.data,
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при отправке события Inngest',
        description: 'Error during Inngest event test',
        error: error.message,
        eventName: name,
      })

      return {
        testName,
        success: false,
        message: `Ошибка при отправке события "${name}"`,
        error: error.message,
        duration,
      }
    }
  }

  /**
   * Тестирует функцию тренировки модели
   */
  async testModelTraining(): Promise<TestResult> {
    const trainingData = {
      bot_name: TEST_CONFIG.users.main.botName,
      is_ru: TEST_CONFIG.users.main.isRussian,
      modelName: 'test_training_model',
      steps: 1500,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      triggerWord: 'person_test',
      zipUrl: 'https://example.com/training-images.zip',
    }

    logger.info({
      message: '🧪 Тест функции тренировки модели',
      description: 'Model training function test',
      trainingData,
    })

    return this.sendEvent('model-training/start', trainingData)
  }

  /**
   * Тестирует функцию генерации изображений
   */
  async testNeuroImageGeneration(): Promise<TestResult> {
    const generationData = {
      prompt: 'Beautiful snowy mountain landscape at sunset',
      model_url:
        'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
      numImages: 1,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
    }

    logger.info({
      message: '🧪 Тест функции генерации изображений',
      description: 'Neuro image generation function test',
      generationData: {
        ...generationData,
        prompt: generationData.prompt.substring(0, 20) + '...',
      },
    })

    return this.sendEvent('neuro/photo.generate', generationData)
  }

  /**
   * Напрямую вызывает функцию через Inngest Dev Server
   */
  async invokeFunction(
    functionId: string,
    eventData: any
  ): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `Inngest function invoke: ${functionId}`

    try {
      logger.info({
        message: '🧪 Прямой вызов функции Inngest',
        description: 'Inngest function direct invocation',
        functionId,
      })

      // Формируем URL для прямого вызова функции
      const invokeUrl = `${this.inngestDevUrl}/fn/${functionId}/invoke`

      // Отправляем запрос на прямой вызов функции
      const response = await axios.post(
        invokeUrl,
        { event: { data: eventData } },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const duration = Date.now() - startTime
      return {
        testName,
        success: response.status === 200,
        message: `Функция "${functionId}" успешно вызвана за ${duration}мс`,
        details: {
          functionId,
          responseStatus: response.status,
          responseData: response.data,
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при прямом вызове функции Inngest',
        description: 'Error during Inngest function invocation',
        error: error.message,
        functionId,
      })

      return {
        testName,
        success: false,
        message: `Ошибка при вызове функции "${functionId}"`,
        error: error.message,
        duration,
      }
    }
  }

  /**
   * Тестирует вызов функции тренировки модели напрямую
   */
  async testModelTrainingDirectInvoke(): Promise<TestResult> {
    const trainingData = {
      bot_name: TEST_CONFIG.users.main.botName,
      is_ru: TEST_CONFIG.users.main.isRussian,
      modelName: 'test_direct_invoke_model',
      steps: 1000,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      triggerWord: 'direct_invoke_test',
      zipUrl: 'https://example.com/direct-invoke-images.zip',
    }

    logger.info({
      message: '🧪 Прямой вызов функции тренировки модели',
      description: 'Direct invocation of model training function',
      trainingData,
    })

    return this.invokeFunction('model-training', trainingData)
  }

  /**
   * Тестирует вызов функции генерации изображений напрямую
   */
  async testNeuroImageGenerationDirectInvoke(): Promise<TestResult> {
    const generationData = {
      prompt: 'Futuristic cityscape with flying cars and neon lights',
      model_url:
        'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
      numImages: 1,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
    }

    logger.info({
      message: '🧪 Прямой вызов функции генерации изображений',
      description: 'Direct invocation of neuro image generation function',
      generationData: {
        ...generationData,
        prompt: generationData.prompt.substring(0, 20) + '...',
      },
    })

    return this.invokeFunction('neuro-image-generation', generationData)
  }

  /**
   * Тестирует функцию HelloWorld
   */
  async testHelloWorld(): Promise<TestResult> {
    const testData = {
      message: 'Тестовое сообщение',
      timestamp: new Date().toISOString(),
      userId: TEST_CONFIG.users.main.telegramId,
    }

    logger.info({
      message: '🧪 Тест простой функции Hello World',
      description: 'Hello World function test',
      testData,
    })

    return this.sendEvent('test/hello.world', testData)
  }

  /**
   * Тестирует прямой вызов функции HelloWorld
   */
  async testHelloWorldDirectInvoke(): Promise<TestResult> {
    const testData = {
      message: 'Прямой вызов функции Hello World',
      timestamp: new Date().toISOString(),
      userId: TEST_CONFIG.users.main.telegramId,
    }

    logger.info({
      message: '🧪 Прямой вызов функции Hello World',
      description: 'Direct invocation of Hello World function',
      testData,
    })

    return this.invokeFunction('hello-world-handler', testData)
  }

  /**
   * Тестирует функцию рассылки сообщений
   */
  async testBroadcastMessage(): Promise<TestResult> {
    const broadcastData = {
      textRu: 'Тестовое сообщение для рассылки',
      textEn: 'Test broadcast message',
      bot_name: TEST_CONFIG.users.main.botName,
      sender_telegram_id: TEST_CONFIG.users.main.telegramId,
      test_mode: true,
      test_telegram_id: TEST_CONFIG.users.main.telegramId,
      contentType: 'photo',
      imageUrl: 'https://example.com/test-image.jpg',
      parse_mode: 'Markdown',
    }

    logger.info({
      message: '🧪 Тест функции рассылки сообщений',
      description: 'Broadcast message function test',
      broadcastData: {
        ...broadcastData,
        textRu: broadcastData.textRu.substring(0, 20) + '...',
      },
    })

    return this.sendEvent('broadcast/send-message', broadcastData)
  }

  /**
   * Тестирует прямой вызов функции рассылки сообщений
   */
  async testBroadcastMessageDirectInvoke(): Promise<TestResult> {
    const broadcastData = {
      textRu: 'Прямой тест рассылки',
      textEn: 'Direct broadcast test',
      bot_name: TEST_CONFIG.users.main.botName,
      sender_telegram_id: TEST_CONFIG.users.main.telegramId,
      test_mode: true,
      test_telegram_id: TEST_CONFIG.users.main.telegramId,
      contentType: 'post_link',
      postLink: 'https://example.com/test-post',
    }

    logger.info({
      message: '🧪 Прямой вызов функции рассылки',
      description: 'Direct invocation of broadcast function',
      broadcastData: {
        ...broadcastData,
        textRu: broadcastData.textRu.substring(0, 20) + '...',
      },
    })

    return this.invokeFunction('broadcast-message', broadcastData)
  }

  /**
   * Тестирует функцию обработки платежей (пополнение баланса)
   */
  async testPaymentProcessorIncomeTransaction(): Promise<TestResult> {
    const paymentData = {
      telegram_id: TEST_CONFIG.users.main.telegramId,
      paymentAmount: 100, // Тестовая сумма пополнения
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
      description: 'Тестовое пополнение баланса',
      operation_id: `test-income-${Date.now()}`,
      type: 'income', // Тип операции - пополнение
      metadata: {
        payment_method: 'test',
        test_transaction: true,
      },
    }

    logger.info({
      message: '🧪 Тест функции обработки платежей (пополнение)',
      description: 'Payment processor function test (income)',
      paymentData,
    })

    return this.sendEvent('payment/process', paymentData)
  }

  /**
   * Тестирует функцию обработки платежей (списание средств)
   */
  async testPaymentProcessorOutcomeTransaction(): Promise<TestResult> {
    const paymentData = {
      telegram_id: TEST_CONFIG.users.main.telegramId,
      paymentAmount: 10, // Тестовая сумма списания
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
      description: 'Тестовое списание средств',
      operation_id: `test-outcome-${Date.now()}`,
      type: 'outcome', // Тип операции - списание
      metadata: {
        service_type: 'Test',
        test_transaction: true,
      },
    }

    logger.info({
      message: '🧪 Тест функции обработки платежей (списание)',
      description: 'Payment processor function test (outcome)',
      paymentData,
    })

    return this.sendEvent('payment/process', paymentData)
  }

  /**
   * Тестирует прямой вызов функции обработки платежей
   */
  async testPaymentProcessorDirectInvoke(): Promise<TestResult> {
    const paymentData = {
      telegram_id: TEST_CONFIG.users.main.telegramId,
      paymentAmount: 5, // Тестовая минимальная сумма
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
      description: 'Прямой тест платежной функции',
      operation_id: `test-direct-${Date.now()}`,
      type: 'outcome',
      metadata: {
        service_type: 'DirectTest',
        test_transaction: true,
      },
    }

    logger.info({
      message: '🧪 Прямой вызов функции обработки платежей',
      description: 'Direct invocation of payment processor function',
      paymentData,
    })

    return this.invokeFunction('payment-processor', paymentData)
  }

  /**
   * Тестирует функцию тренировки модели V2
   */
  async testModelTrainingV2(): Promise<TestResult> {
    const trainingData = {
      zipUrl: 'https://example.com/training-images-v2.zip',
      triggerWord: 'person_test_v2',
      modelName: 'test_model_v2',
      steps: 1000,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
    }

    logger.info({
      message: '🧪 Тест функции тренировки модели V2',
      description: 'Model training V2 function test',
      trainingData,
    })

    return this.sendEvent('model-training/v2/requested', trainingData)
  }

  /**
   * Тестирует прямой вызов функции тренировки модели V2
   */
  async testModelTrainingV2DirectInvoke(): Promise<TestResult> {
    const trainingData = {
      zipUrl: 'https://example.com/direct-invoke-v2-images.zip',
      triggerWord: 'direct_v2_test',
      modelName: 'test_direct_v2_model',
      steps: 800,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
    }

    logger.info({
      message: '🧪 Прямой вызов функции тренировки модели V2',
      description: 'Direct invocation of model training V2 function',
      trainingData,
    })

    return this.invokeFunction('model-training-v2', trainingData)
  }

  /**
   * Запускает все тесты Inngest функций
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []
    logger.info({
      message: '🧪 Запуск всех тестов Inngest функций',
      description: 'Running all Inngest function tests',
    })

    try {
      // Тест отправки события тренировки модели
      const trainingEventResult = await this.testModelTraining()
      results.push(trainingEventResult)

      // Тест прямого вызова функции тренировки модели
      const trainingInvokeResult = await this.testModelTrainingDirectInvoke()
      results.push(trainingInvokeResult)

      // Тест отправки события генерации изображений
      const imageEventResult = await this.testNeuroImageGeneration()
      results.push(imageEventResult)

      // Тест прямого вызова функции генерации изображений
      const imageInvokeResult =
        await this.testNeuroImageGenerationDirectInvoke()
      results.push(imageInvokeResult)

      // Тестируем функцию HelloWorld
      const helloWorldResult = await this.testHelloWorld()
      results.push(helloWorldResult)

      // Тестируем прямой вызов функции HelloWorld
      const helloWorldDirectInvokeResult =
        await this.testHelloWorldDirectInvoke()
      results.push(helloWorldDirectInvokeResult)

      // Тестируем функцию рассылки сообщений
      const broadcastMessageResult = await this.testBroadcastMessage()
      results.push(broadcastMessageResult)

      // Тестируем прямой вызов функции рассылки сообщений
      const broadcastMessageDirectInvokeResult =
        await this.testBroadcastMessageDirectInvoke()
      results.push(broadcastMessageDirectInvokeResult)

      // Тестируем функцию обработки платежей (пополнение)
      const incomeTransactionResult =
        await this.testPaymentProcessorIncomeTransaction()
      results.push(incomeTransactionResult)

      // Тестируем функцию обработки платежей (списание)
      const outcomeTransactionResult =
        await this.testPaymentProcessorOutcomeTransaction()
      results.push(outcomeTransactionResult)

      // Тестируем прямой вызов функции обработки платежей
      const paymentProcessorResult =
        await this.testPaymentProcessorDirectInvoke()
      results.push(paymentProcessorResult)

      // Тестируем функцию тренировки модели V2
      const modelTrainingV2Result = await this.testModelTrainingV2()
      results.push(modelTrainingV2Result)

      // Тестируем прямой вызов функции тренировки модели V2
      const modelTrainingV2DirectInvokeResult =
        await this.testModelTrainingV2DirectInvoke()
      results.push(modelTrainingV2DirectInvokeResult)

      // Считаем общую статистику
      const successful = results.filter(r => r.success).length
      const total = results.length

      logger.info({
        message: `🏁 Тесты Inngest функций завершены: ${successful}/${total} успешно`,
        description: 'Inngest function tests completed',
        successCount: successful,
        totalCount: total,
      })

      return results
    } catch (error) {
      logger.error({
        message: '❌ Критическая ошибка при выполнении тестов Inngest функций',
        description: 'Critical error during Inngest function tests',
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Запускает только тесты для генерации изображений
   */
  async runImageGenerationTests(): Promise<TestResult[]> {
    const results: TestResult[] = []
    logger.info({
      message: '🧪 Запуск тестов генерации изображений',
      description: 'Running image generation function tests',
    })

    try {
      // Тест отправки события генерации изображений
      const imageEventResult = await this.testNeuroImageGeneration()
      results.push(imageEventResult)

      // Тест прямого вызова функции генерации изображений
      const imageInvokeResult =
        await this.testNeuroImageGenerationDirectInvoke()
      results.push(imageInvokeResult)

      // Тестируем функцию HelloWorld
      const helloWorldResult = await this.testHelloWorld()
      results.push(helloWorldResult)

      // Тестируем прямой вызов функции HelloWorld
      const helloWorldDirectInvokeResult =
        await this.testHelloWorldDirectInvoke()
      results.push(helloWorldDirectInvokeResult)

      // Тестируем функцию рассылки сообщений
      const broadcastMessageResult = await this.testBroadcastMessage()
      results.push(broadcastMessageResult)

      // Тестируем прямой вызов функции рассылки сообщений
      const broadcastMessageDirectInvokeResult =
        await this.testBroadcastMessageDirectInvoke()
      results.push(broadcastMessageDirectInvokeResult)

      // Тестируем функцию обработки платежей (пополнение)
      const incomeTransactionResult =
        await this.testPaymentProcessorIncomeTransaction()
      results.push(incomeTransactionResult)

      // Тестируем функцию обработки платежей (списание)
      const outcomeTransactionResult =
        await this.testPaymentProcessorOutcomeTransaction()
      results.push(outcomeTransactionResult)

      // Тестируем прямой вызов функции обработки платежей
      const paymentProcessorResult =
        await this.testPaymentProcessorDirectInvoke()
      results.push(paymentProcessorResult)

      // Тестируем функцию тренировки модели V2
      const modelTrainingV2Result = await this.testModelTrainingV2()
      results.push(modelTrainingV2Result)

      // Тестируем прямой вызов функции тренировки модели V2
      const modelTrainingV2DirectInvokeResult =
        await this.testModelTrainingV2DirectInvoke()
      results.push(modelTrainingV2DirectInvokeResult)

      // Считаем общую статистику
      const successful = results.filter(r => r.success).length
      const total = results.length

      logger.info({
        message: `🏁 Тесты генерации изображений завершены: ${successful}/${total} успешно`,
        description: 'Image generation tests completed',
        successCount: successful,
        totalCount: total,
      })

      return results
    } catch (error) {
      logger.error({
        message:
          '❌ Критическая ошибка при выполнении тестов генерации изображений',
        description: 'Critical error during image generation tests',
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Запускает все тесты для конкретных функций
   */
  async runSpecificFunctionTests(functionName: string): Promise<TestResult[]> {
    const results: TestResult[] = []
    logger.info({
      message: `🧪 Запуск тестов для функции: ${functionName}`,
      description: `Running tests for specific function: ${functionName}`,
    })

    try {
      switch (functionName) {
        case 'hello-world':
          results.push(await this.testHelloWorld())
          results.push(await this.testHelloWorldDirectInvoke())
          break
        case 'broadcast':
          results.push(await this.testBroadcastMessage())
          results.push(await this.testBroadcastMessageDirectInvoke())
          break
        case 'payment':
          results.push(await this.testPaymentProcessorIncomeTransaction())
          results.push(await this.testPaymentProcessorOutcomeTransaction())
          results.push(await this.testPaymentProcessorDirectInvoke())
          break
        case 'model-training':
          results.push(await this.testModelTraining())
          results.push(await this.testModelTrainingDirectInvoke())
          break
        case 'model-training-v2':
          results.push(await this.testModelTrainingV2())
          results.push(await this.testModelTrainingV2DirectInvoke())
          break
        case 'neuro':
          results.push(await this.testNeuroImageGeneration())
          results.push(await this.testNeuroImageGenerationDirectInvoke())
          break
        default:
          throw new Error(`Неизвестная функция: ${functionName}`)
      }

      // Считаем общую статистику
      const successful = results.filter(r => r.success).length
      const total = results.length

      logger.info({
        message: `🏁 Тесты функции ${functionName} завершены: ${successful}/${total} успешно`,
        description: `Function tests completed for ${functionName}`,
        successCount: successful,
        totalCount: total,
      })

      return results
    } catch (error) {
      logger.error({
        message: `❌ Критическая ошибка при выполнении тестов функции ${functionName}`,
        description: `Critical error during function tests for ${functionName}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }
}
