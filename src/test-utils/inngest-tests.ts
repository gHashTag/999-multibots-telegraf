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
   * Тестирует функцию генерации нейрофото V2
   */
  async testNeuroPhotoV2Generation(): Promise<TestResult> {
    const generationData = {
      prompt: 'Stylish portrait in evening urban setting with neon lights',
      num_images: 1,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
    }

    logger.info({
      message: '🧪 Тест функции генерации нейрофото V2',
      description: 'NeuroPhoto V2 generation function test',
      generationData: {
        ...generationData,
        prompt: generationData.prompt.substring(0, 20) + '...',
      },
    })

    return this.sendEvent('neuro/photo-v2.generate', generationData)
  }

  /**
   * Тестирует функцию генерации текст-в-изображение
   */
  async testTextToImage(): Promise<TestResult> {
    const generationData = {
      prompt: 'A beautiful sunset over mountains with a lake',
      model: 'stable-diffusion-xl',
      num_images: 1,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
    }

    logger.info({
      message: '🧪 Тест функции генерации текст-в-изображение',
      description: 'Text to image generation function test',
      generationData: {
        ...generationData,
        prompt: generationData.prompt.substring(0, 20) + '...',
      },
    })

    return this.sendEvent('text-to-image.requested', generationData)
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
   * Тестирует функцию тренировки модели V2
   */
  async testModelTrainingV2(): Promise<TestResult> {
    const trainingData = {
      bot_name: TEST_CONFIG.users.main.botName,
      is_ru: TEST_CONFIG.users.main.isRussian,
      modelName: 'test_training_model_v2',
      steps: 1500,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      triggerWord: 'person_test_v2',
      zipUrl: 'https://example.com/training-images-v2.zip',
    }

    logger.info({
      message: '🧪 Тест функции тренировки модели V2',
      description: 'Model training V2 function test',
      trainingData,
    })

    return this.sendEvent('model-training-v2/start', trainingData)
  }

  /**
   * Напрямую вызывает функцию тренировки модели
   */
  async testModelTrainingDirectInvoke(): Promise<TestResult> {
    const trainingData = {
      bot_name: TEST_CONFIG.users.main.botName,
      is_ru: TEST_CONFIG.users.main.isRussian,
      modelName: 'test_training_model_direct',
      steps: 1500,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      triggerWord: 'person_test_direct',
      zipUrl: 'https://example.com/training-images-direct.zip',
    }

    logger.info({
      message: '🧪 Прямой вызов функции тренировки модели',
      description: 'Model training function direct invocation',
      trainingData,
    })

    return this.invokeFunction('model-training-function', trainingData)
  }

  /**
   * Напрямую вызывает функцию тренировки модели V2
   */
  async testModelTrainingV2DirectInvoke(): Promise<TestResult> {
    const trainingData = {
      bot_name: TEST_CONFIG.users.main.botName,
      is_ru: TEST_CONFIG.users.main.isRussian,
      modelName: 'test_training_model_v2_direct',
      steps: 1500,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      triggerWord: 'person_test_v2_direct',
      zipUrl: 'https://example.com/training-images-v2-direct.zip',
    }

    logger.info({
      message: '🧪 Прямой вызов функции тренировки модели V2',
      description: 'Model training V2 function direct invocation',
      trainingData,
    })

    return this.invokeFunction('model-training-v2-function', trainingData)
  }

  /**
   * Напрямую вызывает функцию NeuroPhoto V2
   */
  async testNeuroPhotoV2DirectInvoke(): Promise<TestResult> {
    const generationData = {
      prompt: 'Professional portrait in natural light with bokeh effect',
      num_images: 1,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      username: 'test_user_direct',
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
    }

    logger.info({
      message: '🧪 Прямой вызов функции NeuroPhoto V2',
      description: 'NeuroPhoto V2 function direct invocation',
      generationData: {
        ...generationData,
        prompt: generationData.prompt.substring(0, 20) + '...',
      },
    })

    return this.invokeFunction(
      'neurophoto-v2-generation-function',
      generationData
    )
  }

  /**
   * Напрямую вызывает функцию текст-в-изображение
   */
  async testTextToImageDirectInvoke(): Promise<TestResult> {
    const generationData = {
      prompt: 'A beautiful sunset over mountains with a lake',
      model: 'stable-diffusion-xl',
      num_images: 1,
      telegram_id: TEST_CONFIG.users.main.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.users.main.botName,
    }

    logger.info({
      message: '🧪 Прямой вызов функции текст-в-изображение',
      description: 'Text to image direct invocation test',
      generationData: {
        ...generationData,
        prompt: generationData.prompt.substring(0, 20) + '...',
      },
    })

    return this.invokeFunction('text-to-image', generationData)
  }

  /**
   * Запускает все тесты
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []

    try {
      // Тест отправки события тренировки модели
      const modelTrainingResult = await this.testModelTraining()
      results.push(modelTrainingResult)

      // Тест отправки события тренировки модели V2
      const modelTrainingV2Result = await this.testModelTrainingV2()
      results.push(modelTrainingV2Result)

      // Тест отправки события генерации изображения
      const neuroImageResult = await this.testNeuroImageGeneration()
      results.push(neuroImageResult)

      // Тест отправки события генерации нейрофото V2
      const neuroPhotoV2Result = await this.testNeuroPhotoV2Generation()
      results.push(neuroPhotoV2Result)

      // Тест отправки события генерации текст-в-изображение
      const textToImageResult = await this.testTextToImage()
      results.push(textToImageResult)

      // Прямой вызов функции тренировки модели
      const directInvokeResult = await this.testModelTrainingDirectInvoke()
      results.push(directInvokeResult)

      // Прямой вызов функции тренировки модели V2
      const directInvokeV2Result = await this.testModelTrainingV2DirectInvoke()
      results.push(directInvokeV2Result)

      // Прямой вызов функции нейрофото V2
      const directInvokeNeuroPhotoV2Result =
        await this.testNeuroPhotoV2DirectInvoke()
      results.push(directInvokeNeuroPhotoV2Result)

      // Прямой вызов функции текст-в-изображение
      const directInvokeTextToImageResult =
        await this.testTextToImageDirectInvoke()
      results.push(directInvokeTextToImageResult)

      return results
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при выполнении всех тестов',
        description: 'Error running all tests',
        error: error.message,
      })

      results.push({
        testName: 'Error in runAllTests',
        success: false,
        message: 'Произошла ошибка при выполнении всех тестов',
        error: error.message,
      })

      return results
    }
  }

  /**
   * Запускает тесты генерации изображений
   */
  async runImageGenerationTests(): Promise<TestResult[]> {
    const results: TestResult[] = []

    try {
      // Тест отправки события генерации изображения
      const neuroImageResult = await this.testNeuroImageGeneration()
      results.push(neuroImageResult)

      // Тест отправки события генерации нейрофото V2
      const neuroPhotoV2Result = await this.testNeuroPhotoV2Generation()
      results.push(neuroPhotoV2Result)

      // Тест отправки события генерации текст-в-изображение
      const textToImageResult = await this.testTextToImage()
      results.push(textToImageResult)

      // Прямой вызов функции нейрофото V2
      const directInvokeNeuroPhotoV2Result =
        await this.testNeuroPhotoV2DirectInvoke()
      results.push(directInvokeNeuroPhotoV2Result)

      // Прямой вызов функции текст-в-изображение
      const directInvokeTextToImageResult =
        await this.testTextToImageDirectInvoke()
      results.push(directInvokeTextToImageResult)

      return results
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при выполнении тестов генерации изображений',
        description: 'Error running image generation tests',
        error: error.message,
      })

      results.push({
        testName: 'Error in runImageGenerationTests',
        success: false,
        message: 'Произошла ошибка при выполнении тестов генерации изображений',
        error: error.message,
      })

      return results
    }
  }

  /**
   * Запускает тесты конкретной функции Inngest
   */
  async runSpecificFunctionTests(functionName: string): Promise<TestResult[]> {
    logger.info({
      message: `🧪 Запуск тестов функции ${functionName}`,
      description: `Running ${functionName} function tests`,
    })

    const results: TestResult[] = []

    try {
      // Предварительно объявляем все необходимые переменные
      let helloWorldResult: TestResult
      let broadcastResult: TestResult
      let paymentResult: TestResult
      let modelTrainingResult: TestResult
      let directInvokeResult: TestResult
      let modelTrainingV2Result: TestResult
      let directInvokeV2Result: TestResult
      let neuroResult: TestResult
      let neuroPhotoV2Result: TestResult
      let directInvokeNeuroPhotoV2Result: TestResult

      switch (functionName) {
        case 'hello-world':
          helloWorldResult = await this.sendEvent('hello-world/greeting', {
            message: 'Hello from Test Runner!',
          })
          results.push(helloWorldResult)
          break

        case 'broadcast':
          broadcastResult = await this.sendEvent('broadcast/send', {
            message: 'Test broadcast message',
            telegram_ids: [TEST_CONFIG.users.main.telegramId],
            bot_name: TEST_CONFIG.users.main.botName,
          })
          results.push(broadcastResult)
          break

        case 'payment':
          paymentResult = await this.sendEvent('payment/process', {
            amount: 100,
            telegram_id: TEST_CONFIG.users.main.telegramId,
            username: 'test_user',
            bot_name: TEST_CONFIG.users.main.botName,
          })
          results.push(paymentResult)
          break

        case 'model-training':
          modelTrainingResult = await this.testModelTraining()
          results.push(modelTrainingResult)

          directInvokeResult = await this.testModelTrainingDirectInvoke()
          results.push(directInvokeResult)
          break

        case 'model-training-v2':
          modelTrainingV2Result = await this.testModelTrainingV2()
          results.push(modelTrainingV2Result)

          directInvokeV2Result = await this.testModelTrainingV2DirectInvoke()
          results.push(directInvokeV2Result)
          break

        case 'neuro':
          neuroResult = await this.testNeuroImageGeneration()
          results.push(neuroResult)
          break

        case 'neurophoto-v2':
          neuroPhotoV2Result = await this.testNeuroPhotoV2Generation()
          results.push(neuroPhotoV2Result)

          directInvokeNeuroPhotoV2Result =
            await this.testNeuroPhotoV2DirectInvoke()
          results.push(directInvokeNeuroPhotoV2Result)
          break

        case 'text-to-image':
          directInvokeResult = await this.testTextToImageDirectInvoke()
          results.push(directInvokeResult)
          break

        default:
          throw new Error(`Неизвестная функция: ${functionName}`)
      }

      return results
    } catch (error) {
      logger.error({
        message: `❌ Ошибка при запуске тестов функции ${functionName}`,
        description: `Error running ${functionName} function tests`,
        error: error.message,
      })

      return [
        {
          testName: `Тест функции ${functionName}`,
          success: false,
          message: `Ошибка при запуске тестов функции ${functionName}`,
          error: error.message,
        },
      ]
    }
  }
}
