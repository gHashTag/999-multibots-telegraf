import { logger } from '@/utils/logger'
import { TEST_CONFIG } from './test-config'
import axios from 'axios'
import { elevenlabs } from '@/core/elevenlabs'
import { Readable } from 'stream'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { createWriteStream } from 'fs'
import { getBotByName } from '@/core/bot'
import { ModeEnum } from '@/interfaces/modes'

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
 * Интерфейс для параметров text-to-speech
 */
interface TextToSpeechParams {
  text: string
  voice_id: string
  telegram_id: string
  is_ru: boolean
  bot_name: string
  username?: string
}

/**
 * Интерфейс для параметров платежа
 */
interface PaymentParams {
  telegram_id: string
  amount: number
  stars?: number
  type:
    | 'money_income'
    | 'money_expense'
    | 'subscription_purchase'
    | 'subscription_renewal'
    | 'refund'
    | 'bonus'
    | 'referral'
    | 'system'
  description: string
  bot_name: string
  service_type: ModeEnum
  inv_id?: string
  metadata?: Record<string, any>
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
      bot_name: TEST_CONFIG.user.botName,
      is_ru: TEST_CONFIG.user.isRussian,
      modelName: 'test_training_model',
      steps: 1500,
      telegram_id: TEST_CONFIG.user.telegramId,
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
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
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
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
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
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
    }

    logger.info({
      message: '🧪 Тест функции генерации текст-в-изображение',
      description: 'Text to image generation function test',
      generationData: {
        ...generationData,
        prompt: generationData.prompt.substring(0, 20) + '...',
      },
    })

    return this.sendEvent('text-to-image/generate', generationData)
  }

  /**
   * Тестирует функцию генерации текст-в-видео
   */
  async testTextToVideo(): Promise<TestResult> {
    const generationData = {
      prompt: 'A beautiful sunset over mountains with a lake',
      model: 'zeroscope_v2_xl',
      num_images: 1,
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
    }

    logger.info({
      message: '🧪 Тест функции генерации текст-в-видео',
      description: 'Text to video generation function test',
      generationData: {
        ...generationData,
        prompt: generationData.prompt.substring(0, 20) + '...',
      },
    })

    return this.sendEvent('text-to-video/generate', generationData)
  }

  /**
   * Тестирует функцию генерации текст-в-видео напрямую
   */
  async testTextToVideoDirectInvoke(): Promise<TestResult> {
    const generationData = {
      prompt: 'A beautiful sunset over mountains with a lake',
      model: 'zeroscope_v2_xl',
      num_images: 1,
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
    }

    logger.info({
      message: '🧪 Прямой тест функции генерации текст-в-видео',
      description: 'Direct text to video generation function test',
      generationData: {
        ...generationData,
        prompt: generationData.prompt.substring(0, 20) + '...',
      },
    })

    return this.invokeFunction('text-to-video-function', generationData)
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
      bot_name: TEST_CONFIG.user.botName,
      is_ru: TEST_CONFIG.user.isRussian,
      modelName: 'test_training_model',
      steps: 1500,
      telegram_id: TEST_CONFIG.user.telegramId,
      triggerWord: 'person_test',
      zipUrl: 'https://example.com/training-images.zip',
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
      bot_name: TEST_CONFIG.user.botName,
      is_ru: TEST_CONFIG.user.isRussian,
      modelName: 'test_training_model',
      steps: 1500,
      telegram_id: TEST_CONFIG.user.telegramId,
      triggerWord: 'person_test',
      zipUrl: 'https://example.com/training-images.zip',
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
      bot_name: TEST_CONFIG.user.botName,
      is_ru: TEST_CONFIG.user.isRussian,
      modelName: 'test_training_model',
      steps: 1500,
      telegram_id: TEST_CONFIG.user.telegramId,
      triggerWord: 'person_test',
      zipUrl: 'https://example.com/training-images.zip',
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
      prompt: 'Stylish portrait in evening urban setting with neon lights',
      num_images: 1,
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
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
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
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
   * Тестирует функцию создания голосового аватара через ElevenLabs
   */
  async testVoiceAvatarCreation(): Promise<TestResult> {
    const generationData = {
      prompt: 'A beautiful sunset over mountains with a lake',
      model: 'stable-diffusion-xl',
      num_images: 1,
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
    }

    logger.info({
      message: '🧪 Тест функции создания голосового аватара',
      description: 'Voice avatar creation function test',
      voiceAvatarData: {
        ...generationData,
        prompt: 'A beautiful sunset over mountains with a lake',
      },
    })

    return this.sendEvent('voice-avatar.requested', generationData)
  }

  /**
   * Напрямую вызывает функцию создания голосового аватара через ElevenLabs
   */
  async testVoiceAvatarDirectInvoke(): Promise<TestResult> {
    const generationData = {
      prompt: 'A beautiful sunset over mountains with a lake',
      model: 'stable-diffusion-xl',
      num_images: 1,
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
    }

    logger.info({
      message: '🧪 Тест прямого вызова функции создания голосового аватара',
      description: 'Direct invocation of voice avatar creation function test',
      voiceAvatarData: {
        ...generationData,
        prompt: 'A beautiful sunset over mountains with a lake',
      },
    })

    return this.invokeFunction('voice-avatar-creation', generationData)
  }

  /**
   * Запускает тесты функции преобразования текста в речь
   */
  async runTextToSpeechTests(): Promise<TestResult[]> {
    const results: TestResult[] = []

    logger.info({
      message: '🧪 Запуск тестов text-to-speech',
      description: 'Starting text-to-speech tests',
    })

    try {
      // Тест 1: Короткий текст
      const shortTextResult = await this.testTextToSpeech({
        text: 'Привет!',
        voice_id: 'ljyyJh982fsUinaSQPvv',
        telegram_id: TEST_CONFIG.user.telegramId,
        username: 'test_user',
        is_ru: TEST_CONFIG.user.isRussian,
        bot_name: TEST_CONFIG.user.botName,
      })
      results.push({
        ...shortTextResult,
        testName: 'Text-to-speech short text test',
      })

      // Тест 2: Длинный текст
      const longTextResult = await this.testTextToSpeech({
        text: 'Это длинный тестовый текст для проверки работы функции преобразования текста в речь. Он содержит несколько предложений, чтобы проверить обработку длинных текстов.',
        voice_id: 'ljyyJh982fsUinaSQPvv',
        telegram_id: TEST_CONFIG.user.telegramId,
        username: 'test_user',
        is_ru: TEST_CONFIG.user.isRussian,
        bot_name: TEST_CONFIG.user.botName,
      })
      results.push({
        ...longTextResult,
        testName: 'Text-to-speech long text test',
      })

      // Тест 3: Неправильный ID голоса
      const invalidVoiceResult = await this.testTextToSpeech({
        text: 'Тест с неправильным ID голоса',
        voice_id: 'invalid_voice_id',
        telegram_id: TEST_CONFIG.user.telegramId,
        username: 'test_user',
        is_ru: TEST_CONFIG.user.isRussian,
        bot_name: TEST_CONFIG.user.botName,
      })
      results.push({
        ...invalidVoiceResult,
        testName: 'Text-to-speech invalid voice ID test',
      })

      // Тест 4: Прямой вызов функции
      const directInvokeResult = await this.testTextToSpeechDirectInvoke()
      results.push({
        ...directInvokeResult,
        testName: 'Text-to-speech direct invocation test',
      })

      // Тесты реальной генерации аудио
      logger.info({
        message: '🧪 Запуск тестов генерации аудио',
        description: 'Starting audio generation tests',
      })

      // Тест короткого текста
      const shortTextAudioResult = await this.testAudioGeneration(
        'Привет! Это тестовое сообщение.',
        'ljyyJh982fsUinaSQPvv'
      )
      results.push({
        testName: 'Audio generation - short text',
        ...shortTextAudioResult,
      })

      // Тест длинного текста
      const longTextAudioResult = await this.testAudioGeneration(
        'Это длинный тестовый текст, который должен быть преобразован в аудио. Проверяем работу с большими текстами и таймауты.'.repeat(
          3
        ),
        'ljyyJh982fsUinaSQPvv'
      )
      results.push({
        testName: 'Audio generation - long text',
        ...longTextAudioResult,
      })

      // Тест с неправильным voice_id
      const invalidVoiceAudioResult = await this.testAudioGeneration(
        'Тест с неправильным ID голоса',
        'invalid_voice_id'
      )
      results.push({
        testName: 'Audio generation - invalid voice ID',
        ...invalidVoiceAudioResult,
      })

      logger.info({
        message: '✅ Завершены тесты text-to-speech',
        description: 'Text-to-speech tests completed',
        results: results.map(r => ({
          testName: r.testName,
          success: r.success,
          message: r.message,
        })),
      })

      return results
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при выполнении тестов text-to-speech',
        description: 'Error in text-to-speech tests',
        error: error instanceof Error ? error.message : String(error),
      })

      results.push({
        testName: 'Text-to-speech tests error',
        success: false,
        message: 'Произошла ошибка при выполнении тестов text-to-speech',
        error: error instanceof Error ? error.message : String(error),
      })

      return results
    }
  }

  /**
   * Тестирует функцию преобразования текста в речь
   */
  private async testTextToSpeech(
    data?: Partial<TextToSpeechParams>
  ): Promise<TestResult> {
    const textToSpeechData = {
      text: data?.text || 'Это тестовый текст для преобразования в речь.',
      voice_id: data?.voice_id || 'ljyyJh982fsUinaSQPvv',
      telegram_id: data?.telegram_id || TEST_CONFIG.user.telegramId,
      username: data?.username || 'test_user',
      is_ru: data?.is_ru ?? TEST_CONFIG.user.isRussian,
      bot_name: data?.bot_name || TEST_CONFIG.user.botName,
    }

    logger.info({
      message: '🧪 Тест функции преобразования текст-в-речь',
      description: 'Text to speech function test',
      textToSpeechData: {
        ...textToSpeechData,
        text: textToSpeechData.text.substring(0, 20) + '...',
      },
    })

    return this.sendEvent('text-to-speech.requested', textToSpeechData)
  }

  /**
   * Напрямую вызывает функцию преобразования текста в речь
   */
  async testTextToSpeechDirectInvoke(): Promise<TestResult> {
    const textToSpeechData = {
      text: 'Это тестовый текст для прямого вызова функции преобразования в речь.',
      voice_id: 'ljyyJh982fsUinaSQPvv',
      telegram_id: TEST_CONFIG.user.telegramId,
      username: 'test_user',
      is_ru: TEST_CONFIG.user.isRussian,
      bot_name: TEST_CONFIG.user.botName,
    }

    logger.info({
      message: '🧪 Прямой вызов функции текст-в-речь',
      description: 'Text to speech direct invocation test',
      textToSpeechData: {
        ...textToSpeechData,
        text: textToSpeechData.text.substring(0, 20) + '...',
      },
    })

    return this.invokeFunction('text-to-speech', textToSpeechData)
  }

  /**
   * Запускает все тесты
   */
  async runAllTests(): Promise<TestResult[]> {
    const startTime = Date.now()
    logger.info({
      message: '🧪 Запуск всех тестов Inngest функций',
      description: 'Running all Inngest function tests',
    })

    const results: TestResult[] = []

    try {
      // Тесты генерации изображений
      const imageResults = await this.runImageGenerationTests()
      results.push(...imageResults)

      // Тесты генерации видео
      const videoResults = await this.runTextToVideoTests()
      results.push(...videoResults)

      // Тесты голосовых функций
      const voiceResults = await this.runVoiceAvatarTests()
      results.push(...voiceResults)

      // Тесты тренировки моделей
      const trainingResults = await this.runModelTrainingTests()
      results.push(...trainingResults)

      // Тесты платежной системы
      const paymentResults = await this.runPaymentProcessorTests()
      results.push(...paymentResults)

      // Вычисляем статистику
      const successTests = results.filter(r => r.success).length
      const totalTests = results.length
      const duration = Date.now() - startTime

      logger.info({
        message: `✅ Все тесты завершены: ${successTests}/${totalTests} успешно за ${duration}мс`,
        description: 'All tests completed',
        success: successTests,
        total: totalTests,
        duration,
      })
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при выполнении тестов',
        description: 'Error running tests',
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return results
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
   * Запускает тесты функции создания голосового аватара
   */
  async runVoiceAvatarTests(): Promise<TestResult[]> {
    const results: TestResult[] = []

    // Отправляем событие для запуска создания голосового аватара
    const voiceAvatarResult = await this.testVoiceAvatarCreation()
    results.push(voiceAvatarResult)

    // Прямой вызов функции создания голосового аватара
    const directInvokeResult = await this.testVoiceAvatarDirectInvoke()
    results.push(directInvokeResult)

    logger.info({
      message: '✅ Завершены тесты голосового аватара',
      description: 'Voice avatar tests completed',
      results: results.map(r => ({
        testName: r.testName,
        success: r.success,
        message: r.message,
      })),
    })

    return results
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
      let textToSpeechResult: TestResult
      let directInvokeTextToSpeechResult: TestResult

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
            telegram_ids: [TEST_CONFIG.user.telegramId],
            bot_name: TEST_CONFIG.user.botName,
          })
          results.push(broadcastResult)
          break

        case 'payment':
          paymentResult = await this.sendEvent('payment/process', {
            amount: 100,
            telegram_id: TEST_CONFIG.user.telegramId,
            username: 'test_user',
            bot_name: TEST_CONFIG.user.botName,
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

        case 'voice-avatar':
          directInvokeResult = await this.testVoiceAvatarCreation()
          results.push(directInvokeResult)
          break

        case 'text-to-speech':
          textToSpeechResult = await this.testTextToSpeech()
          results.push(textToSpeechResult)

          directInvokeTextToSpeechResult =
            await this.testTextToSpeechDirectInvoke()
          results.push(directInvokeTextToSpeechResult)
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

  async testAudioGeneration(
    text: string,
    voice_id: string
  ): Promise<Omit<TestResult, 'testName'>> {
    logger.info({
      message: '🎯 Тест генерации аудио',
      description: 'Testing audio generation',
      text,
      voice_id,
    })

    try {
      const startTime = Date.now()
      const audioStream = await elevenlabs.generate({
        voice: voice_id,
        model_id: 'eleven_turbo_v2_5',
        text: text,
      })
      const duration = Date.now() - startTime

      if (!isReadableStream(audioStream)) {
        logger.error({
          message: '❌ Аудио поток не получен или неверного формата',
          description: 'Audio stream not received or invalid format',
          streamType: typeof audioStream,
          isStream: isReadableStream(audioStream),
        })
        return {
          success: false,
          message: 'Ошибка: аудио поток не получен или неверного формата',
          duration,
        }
      }

      logger.info({
        message: '✅ Аудио успешно сгенерировано',
        description: 'Audio successfully generated',
        streamType: typeof audioStream,
        duration,
      })

      return {
        success: true,
        message: `Аудио поток успешно получен за ${duration}мс`,
        duration,
      }
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при генерации аудио',
        description: 'Error generating audio',
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        message: `Ошибка: ${
          error instanceof Error ? error.message : String(error)
        }`,
        duration: 0,
      }
    }
  }

  async testAudioSending({
    text,
    voice_id,
    telegram_id,
    is_ru,
    bot_name,
  }: {
    text: string
    voice_id: string
    telegram_id: string
    is_ru: boolean
    bot_name: string
  }): Promise<TestResult> {
    const testName = 'audio-sending-test'

    logger.info({
      message: '🧪 Тест отправки аудио в Telegram',
      description: 'Testing audio sending to Telegram',
      telegram_id,
      text_length: text.length,
    })

    try {
      // Генерируем аудио
      const audioStream = await elevenlabs.generate({
        voice: voice_id,
        model_id: 'eleven_turbo_v2_5',
        text,
      })

      // Получаем бота
      const { bot } = getBotByName(bot_name)
      if (!bot) {
        throw new Error(`Bot ${bot_name} not found`)
      }

      // Создаем временный файл
      const audioUrl = path.join(os.tmpdir(), `test_audio_${Date.now()}.mp3`)
      const writeStream = createWriteStream(audioUrl)

      // Записываем аудио во временный файл
      await new Promise<void>((resolve, reject) => {
        audioStream.pipe(writeStream)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })

      // Отправляем аудио в Telegram
      await bot.telegram.sendAudio(
        telegram_id,
        { source: audioUrl },
        {
          reply_markup: {
            keyboard: [
              [
                {
                  text: is_ru ? '🎙️ Текст в голос' : '🎙️ Text to voice',
                },
                { text: is_ru ? '🏠 Главное меню' : '🏠 Main menu' },
              ],
            ],
          },
        }
      )

      // Удаляем временный файл
      fs.unlinkSync(audioUrl)

      logger.info({
        message: '✅ Тест отправки аудио успешно завершен',
        description: 'Audio sending test completed successfully',
        telegram_id,
      })

      return {
        success: true,
        message: 'Audio sent successfully',
        testName,
      }
    } catch (error) {
      logger.error({
        message: '❌ Ошибка в тесте отправки аудио',
        description: 'Error in audio sending test',
        telegram_id,
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        testName,
      }
    }
  }

  /**
   * Запускает все тесты для text-to-video
   */
  async runTextToVideoTests(): Promise<TestResult[]> {
    logger.info('🚀 Запуск тестов text-to-video', {
      description: 'Starting text-to-video tests',
    })

    const results: TestResult[] = []

    // Тест с корректными данными
    results.push(await this.testTextToVideo())

    // Тест с пустым промптом
    results.push(
      await this.sendEvent('text-to-video/generate', {
        prompt: '',
        videoModel: 'wan-text-to-video',
        telegram_id: TEST_CONFIG.user.telegramId,
        username: 'test_user',
        is_ru: TEST_CONFIG.user.isRussian,
        bot_name: TEST_CONFIG.user.botName,
      })
    )

    // Тест с несуществующей моделью
    results.push(
      await this.sendEvent('text-to-video/generate', {
        prompt: 'Test prompt',
        videoModel: 'non-existent-model',
        telegram_id: TEST_CONFIG.user.telegramId,
        username: 'test_user',
        is_ru: TEST_CONFIG.user.isRussian,
        bot_name: TEST_CONFIG.user.botName,
      })
    )

    // Прямой вызов функции
    results.push(await this.testTextToVideoDirectInvoke())

    return results
  }

  /**
   * Запускает тесты для тренировки моделей
   */
  async runModelTrainingTests(): Promise<TestResult[]> {
    logger.info('🚀 Запуск тестов тренировки моделей', {
      description: 'Starting model training tests',
    })

    const results: TestResult[] = []

    // Тест с корректными данными
    results.push(await this.testModelTraining())

    // Тест V2 с корректными данными
    results.push(await this.testModelTrainingV2())

    // Прямой вызов функции тренировки
    results.push(await this.testModelTrainingDirectInvoke())

    // Прямой вызов функции тренировки V2
    results.push(await this.testModelTrainingV2DirectInvoke())

    return results
  }

  /**
   * Тестирует функцию обработки платежа (пополнение)
   */
  async testPaymentProcessorIncome(): Promise<TestResult> {
    const paymentData: PaymentParams = {
      telegram_id: TEST_CONFIG.user.telegramId,
      amount: 100,
      stars: 100,
      type: TransactionType.MONEY_INCOME,
      description: 'Тестовое пополнение баланса',
      bot_name: TEST_CONFIG.user.botName,
      service_type: ModeEnum.TopUpBalance,
      metadata: {
        test: true,
        operation_id: `test-income-${Date.now()}`,
      },
    }

    logger.info({
      message: '🧪 Тест функции обработки платежа (пополнение)',
      description: 'Payment processor income test',
      paymentData: {
        ...paymentData,
        telegram_id: `${paymentData.telegram_id.substring(0, 3)}***`,
      },
    })

    return this.sendEvent('payment/process', paymentData)
  }

  /**
   * Тестирует функцию обработки платежа (списание)
   */
  async testPaymentProcessorExpense(): Promise<TestResult> {
    const paymentData: PaymentParams = {
      telegram_id: TEST_CONFIG.user.telegramId,
      amount: 50,
      stars: 50,
      type: TransactionType.MONEY_EXPENSE,
      description: 'Тестовое списание средств',
      bot_name: TEST_CONFIG.user.botName,
      service_type: ModeEnum.TextToImage,
      metadata: {
        test: true,
        operation_id: `test-expense-${Date.now()}`,
      },
    }

    logger.info({
      message: '🧪 Тест функции обработки платежа (списание)',
      description: 'Payment processor expense test',
      paymentData: {
        ...paymentData,
        telegram_id: `${paymentData.telegram_id.substring(0, 3)}***`,
      },
    })

    return this.sendEvent('payment/process', paymentData)
  }

  /**
   * Тестирует функцию обработки платежа напрямую
   */
  async testPaymentProcessorDirectInvoke(): Promise<TestResult> {
    const paymentData: PaymentParams = {
      telegram_id: TEST_CONFIG.user.telegramId,
      amount: 100,
      stars: 100,
      type: TransactionType.MONEY_INCOME,
      description: 'Тестовое пополнение баланса (прямой вызов)',
      bot_name: TEST_CONFIG.user.botName,
      service_type: ModeEnum.TopUpBalance,
      metadata: {
        test: true,
        direct_invoke: true,
        operation_id: `test-direct-${Date.now()}`,
      },
    }

    logger.info({
      message: '🧪 Тест прямого вызова функции обработки платежа',
      description: 'Direct invoke payment processor test',
      paymentData: {
        ...paymentData,
        telegram_id: `${paymentData.telegram_id.substring(0, 3)}***`,
      },
    })

    return this.invokeFunction('payment-processor', {
      name: 'payment/process',
      data: paymentData,
    })
  }

  /**
   * Запускает тесты платежной системы
   */
  async runPaymentProcessorTests(): Promise<TestResult[]> {
    logger.info({
      message: '🧪 Запуск тестов платежной системы',
      description: 'Running payment processor tests',
    })

    const results: TestResult[] = []

    try {
      // Тест пополнения баланса
      results.push(await this.testPaymentProcessorIncome())

      // Тест списания средств
      results.push(await this.testPaymentProcessorExpense())

      // Тест прямого вызова
      results.push(await this.testPaymentProcessorDirectInvoke())

      // Вычисляем статистику
      const successTests = results.filter(r => r.success).length
      const totalTests = results.length

      logger.info({
        message: `✅ Тесты платежной системы завершены: ${successTests}/${totalTests} успешно`,
        description: 'Payment processor tests completed',
        success: successTests,
        total: totalTests,
      })
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при выполнении тестов платежной системы',
        description: 'Error running payment processor tests',
        error: error instanceof Error ? error.message : String(error),
      })

      results.push({
        testName: 'Ошибка выполнения тестов платежной системы',
        success: false,
        message: 'Произошла ошибка при выполнении тестов',
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return results
  }
}

// Функция для проверки, является ли объект потоком
function isReadableStream(obj: any): obj is Readable {
  return obj && typeof obj.pipe === 'function' && typeof obj.read === 'function'
}
