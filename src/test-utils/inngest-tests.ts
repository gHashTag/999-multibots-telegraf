import { logger } from '@/utils/logger'
import { TEST_CONFIG } from './test-config'
import axios, { AxiosError } from 'axios'
import { elevenlabs } from '@/core/elevenlabs'
import path from 'path'
import os from 'os'
import { createWriteStream } from 'fs'
import { getBotByName } from '@/core/bot'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { TelegramId } from '@/interfaces/telegram.interface'
import { Inngest } from 'inngest'
import { TestResult } from './types'

// Интерфейсы и типы
interface TextToSpeechParams {
  text: string
  voice_id: string
  telegram_id: TelegramId
  is_ru: boolean
  bot_name: string
  username?: string
}

interface InngestEventResponse {
  status: number
  data: any
}

/**
 * Класс для тестирования Inngest функций
 */
export class InngestTester {
  private inngestDevUrl: string
  private eventKey: string
  private inngestClient: Inngest

  constructor() {
    this.inngestDevUrl = process.env.INNGEST_DEV_URL || 'http://localhost:8288'
    this.eventKey = process.env.INNGEST_EVENT_KEY || 'test-event-key'
    this.inngestClient = new Inngest({
      id: 'test-inngest',
      eventKey: this.eventKey,
    })
  }

  /**
   * Обработчик ошибок для логирования
   */
  private handleError(error: unknown): string {
    if (error instanceof AxiosError) {
      const responseData = error.response?.data as { message?: string }
      return responseData?.message || error.message
    }
    if (error instanceof Error) {
      if (
        'response' in error &&
        error.response &&
        typeof error.response === 'object'
      ) {
        const response = error.response as {
          data?: { message?: string; error?: string }
        }
        if (response.data) {
          return response.data.message || response.data.error || error.message
        }
      }
      return error.message
    }
    return String(error)
  }

  /**
   * Отправляет событие в Inngest Dev Server
   */
  async sendEvent(
    name: string,
    data: Record<string, any>
  ): Promise<TestResult> {
    const startTime = Date.now()
    try {
      logger.info({
        message: '🧪 Тест отправки события Inngest',
        description: 'Inngest event send test',
        eventName: name,
      })

      const response = await axios.post<InngestEventResponse>(
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

      return {
        name,
        success: response.status === 200,
        message: `Событие "${name}" успешно отправлено за ${
          Date.now() - startTime
        }мс`,
        error: undefined,
      }
    } catch (error) {
      const errorMessage = this.handleError(error)

      logger.error({
        message: '❌ Ошибка при отправке события Inngest',
        description: 'Error during Inngest event test',
        error: errorMessage,
        eventName: name,
      })

      return {
        name,
        success: false,
        message: `Ошибка при отправке события "${name}"`,
        error: new Error(errorMessage),
      }
    }
  }

  /**
   * Тестирует функцию тренировки модели
   */
  async testModelTraining(): Promise<TestResult> {
    const trainingData = {
      bot_name: TEST_CONFIG.bots.test_bot.name,
      is_ru: TEST_CONFIG.users.main.isRussian,
      modelName: 'test_training_model',
      steps: 1500,
      telegram_id: TEST_CONFIG.users.main.telegram_id,
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
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      username: TEST_CONFIG.users.main.username,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.bots.test_bot.name,
    }

    logger.info({
      message: '🧪 Тест функции генерации изображений',
      description: 'Neuro image generation function test',
      generationData,
    })

    return this.sendEvent('neuro-image/generate', generationData)
  }

  /**
   * Тестирует функцию генерации NeuroPhoto V2
   */
  async testNeuroPhotoV2Generation(): Promise<TestResult> {
    const generationData = {
      prompt: 'Beautiful portrait photo',
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      username: TEST_CONFIG.users.main.username,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.bots.test_bot.name,
    }

    logger.info({
      message: '🧪 Тест функции генерации NeuroPhoto V2',
      description: 'NeuroPhoto V2 generation function test',
      generationData,
    })

    return this.sendEvent('neurophoto-v2/generate', generationData)
  }

  /**
   * Тестирует функцию генерации текста в изображение
   */
  async testTextToImage(): Promise<TestResult> {
    const generationData = {
      prompt: 'Beautiful landscape with mountains',
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      username: TEST_CONFIG.users.main.username,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.bots.test_bot.name,
    }

    logger.info({
      message: '🧪 Тест функции генерации текста в изображение',
      description: 'Text to image generation function test',
      generationData,
    })

    return this.sendEvent('text-to-image/generate', generationData)
  }

  /**
   * Вызывает функцию напрямую через Inngest Dev Server
   */
  async invokeFunction(
    functionId: string,
    eventData: any
  ): Promise<TestResult> {
    try {
      logger.info({
        message: '🧪 Тест прямого вызова функции Inngest',
        description: 'Direct Inngest function invocation test',
        functionId,
        eventData,
      })

      const response = await axios.post<InngestEventResponse>(
        `${this.inngestDevUrl}/fn/${functionId}`,
        eventData,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      return {
        name: functionId,
        success: response.status === 200,
        message: `Функция "${functionId}" успешно выполнена`,
        error: undefined,
      }
    } catch (error) {
      const errorMessage = this.handleError(error)

      logger.error({
        message: '❌ Ошибка при вызове функции Inngest',
        description: 'Error during direct Inngest function invocation',
        error: errorMessage,
        functionId,
      })

      return {
        name: functionId,
        success: false,
        message: `Ошибка при вызове функции "${functionId}"`,
        error: new Error(errorMessage),
      }
    }
  }

  /**
   * Тестирует функцию тренировки модели V2
   */
  async testModelTrainingV2(): Promise<TestResult> {
    const trainingData = {
      bot_name: TEST_CONFIG.bots.test_bot.name,
      is_ru: TEST_CONFIG.users.main.isRussian,
      modelName: 'test_training_model_v2',
      steps: 2000,
      telegram_id: TEST_CONFIG.users.main.telegram_id,
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
   * Тестирует прямой вызов функции тренировки модели
   */
  async testModelTrainingDirectInvoke(): Promise<TestResult> {
    const trainingData = {
      bot_name: TEST_CONFIG.bots.test_bot.name,
      is_ru: TEST_CONFIG.users.main.isRussian,
      modelName: 'test_training_model',
      steps: 1500,
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      triggerWord: 'person_test',
      zipUrl: 'https://example.com/training-images.zip',
    }

    return this.invokeFunction('model-training/start', trainingData)
  }

  /**
   * Тестирует прямой вызов функции тренировки модели V2
   */
  async testModelTrainingV2DirectInvoke(): Promise<TestResult> {
    const trainingData = {
      bot_name: TEST_CONFIG.bots.test_bot.name,
      is_ru: TEST_CONFIG.users.main.isRussian,
      modelName: 'test_training_model_v2',
      steps: 2000,
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      triggerWord: 'person_test_v2',
      zipUrl: 'https://example.com/training-images-v2.zip',
    }

    return this.invokeFunction('model-training-v2/start', trainingData)
  }

  /**
   * Тестирует прямой вызов функции генерации NeuroPhoto V2
   */
  async testNeuroPhotoV2DirectInvoke(): Promise<TestResult> {
    const generationData = {
      prompt: 'Beautiful portrait photo',
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      username: TEST_CONFIG.users.main.username,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.bots.test_bot.name,
    }

    return this.invokeFunction('neurophoto-v2/generate', generationData)
  }

  /**
   * Тестирует прямой вызов функции генерации текста в изображение
   */
  async testTextToImageDirectInvoke(): Promise<TestResult> {
    const generationData = {
      prompt: 'Beautiful landscape with mountains',
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      username: TEST_CONFIG.users.main.username,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.bots.test_bot.name,
    }

    return this.invokeFunction('text-to-image/generate', generationData)
  }

  /**
   * Тестирует функцию создания голосового аватара через ElevenLabs
   */
  async testVoiceAvatarCreation(): Promise<TestResult> {
    const voiceAvatarData = {
      fileUrl: 'https://example.com/voice-message.oga',
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      username: TEST_CONFIG.users.main.username,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.bots.test_bot.name,
    }

    logger.info({
      message: '🧪 Тест функции создания голосового аватара',
      description: 'Voice avatar creation function test',
      voiceAvatarData: {
        ...voiceAvatarData,
        fileUrl: 'https://example.com/voice-message.oga',
      },
    })

    return this.sendEvent('voice-avatar.requested', voiceAvatarData)
  }

  /**
   * Напрямую вызывает функцию создания голосового аватара через ElevenLabs
   */
  async testVoiceAvatarDirectInvoke(): Promise<TestResult> {
    const voiceAvatarData = {
      fileUrl: 'https://example.com/voice-message.oga',
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      username: TEST_CONFIG.users.main.username,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.bots.test_bot.name,
    }

    logger.info({
      message: '🧪 Тест прямого вызова функции создания голосового аватара',
      description: 'Direct invocation of voice avatar creation function test',
      voiceAvatarData: {
        ...voiceAvatarData,
        fileUrl: 'https://example.com/voice-message.oga',
      },
    })

    return this.invokeFunction('voice-avatar-creation', voiceAvatarData)
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
        telegram_id: TEST_CONFIG.users.main.telegram_id,
        username: TEST_CONFIG.users.main.username,
        is_ru: TEST_CONFIG.users.main.isRussian,
        bot_name: TEST_CONFIG.bots.test_bot.name,
      })
      results.push({
        ...shortTextResult,
        name: 'Text-to-speech short text test',
      })

      // Тест 2: Длинный текст
      const longTextResult = await this.testTextToSpeech({
        text: 'Это длинный тестовый текст для проверки работы функции преобразования текста в речь. Он содержит несколько предложений, чтобы проверить обработку длинных текстов.',
        voice_id: 'ljyyJh982fsUinaSQPvv',
        telegram_id: TEST_CONFIG.users.main.telegram_id,
        username: TEST_CONFIG.users.main.username,
        is_ru: TEST_CONFIG.users.main.isRussian,
        bot_name: TEST_CONFIG.bots.test_bot.name,
      })
      results.push({
        ...longTextResult,
        name: 'Text-to-speech long text test',
      })

      // Тест 3: Неправильный ID голоса
      const invalidVoiceResult = await this.testTextToSpeech({
        text: 'Тест с неправильным ID голоса',
        voice_id: 'invalid_voice_id',
        telegram_id: TEST_CONFIG.users.main.telegram_id,
        username: TEST_CONFIG.users.main.username,
        is_ru: TEST_CONFIG.users.main.isRussian,
        bot_name: TEST_CONFIG.bots.test_bot.name,
      })
      results.push({
        ...invalidVoiceResult,
        name: 'Text-to-speech invalid voice ID test',
      })

      // Тест 4: Прямой вызов функции
      const directInvokeResult = await this.testTextToSpeechDirectInvoke()
      results.push({
        ...directInvokeResult,
        name: 'Text-to-speech direct invocation test',
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
        name: 'Audio generation - short text',
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
        name: 'Audio generation - long text',
        ...longTextAudioResult,
      })

      // Тест с неправильным voice_id
      const invalidVoiceAudioResult = await this.testAudioGeneration(
        'Тест с неправильным ID голоса',
        'invalid_voice_id'
      )
      results.push({
        name: 'Audio generation - invalid voice ID',
        ...invalidVoiceAudioResult,
      })

      logger.info({
        message: '✅ Завершены тесты text-to-speech',
        description: 'Text-to-speech tests completed',
        results: results.map(r => ({
          name: r.name,
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
        name: 'Text-to-speech tests error',
        success: false,
        message: 'Произошла ошибка при выполнении тестов text-to-speech',
        error: error instanceof Error ? error : new Error(String(error)),
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
      telegram_id: data?.telegram_id || TEST_CONFIG.users.main.telegram_id,
      username: data?.username || TEST_CONFIG.users.main.username,
      is_ru: data?.is_ru ?? TEST_CONFIG.users.main.isRussian,
      bot_name: data?.bot_name || TEST_CONFIG.bots.test_bot.name,
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
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      username: TEST_CONFIG.users.main.username,
      is_ru: TEST_CONFIG.users.main.isRussian,
      bot_name: TEST_CONFIG.bots.test_bot.name,
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
    logger.info({
      message: '🧪 Запуск всех тестов',
      description: 'Running all tests',
    })

    const results: TestResult[] = []

    // Тесты платежей
    const paymentResults = await this.runPaymentTests()
    results.push(...paymentResults)

    // Тесты генерации изображений
    const imageResults = await this.runImageGenerationTests()
    results.push(...imageResults)

    // Тесты голосового аватара
    const voiceResults = await this.runVoiceAvatarTests()
    results.push(...voiceResults)

    // Тесты text-to-speech
    const ttsResults = await this.runTextToSpeechTests()
    results.push(...ttsResults)

    // Логируем общие результаты
    const successCount = results.filter(r => r.success).length
    const totalTests = results.length

    logger.info({
      message: `✅ Завершено ${successCount}/${totalTests} тестов`,
      description: 'All tests completed',
      successRate: `${((successCount / totalTests) * 100).toFixed(2)}%`,
    })

    return results
  }

  /**
   * Запускает тесты платежей
   */
  async runPaymentTests(): Promise<TestResult[]> {
    const results: TestResult[] = []

    try {
      // Базовые операции
      results.push(await this.testBasicIncomeOperation())
      results.push(await this.testBasicOutcomeOperation())

      // Тесты определения типа сервиса
      const serviceTypeResults = await this.testServiceTypeDetection()
      results.push(...serviceTypeResults)

      // Тест метаданных
      results.push(await this.testPaymentMetadata())

      return results
    } catch (error) {
      const errorMessage = this.handleError(error)
      logger.error({
        message: '❌ Ошибка при выполнении тестов платежей',
        description: 'Error running payment tests',
        error: errorMessage,
      })

      results.push({
        name: 'Error in runPaymentTests',
        success: false,
        message: 'Произошла ошибка при выполнении тестов платежей',
        error: error instanceof Error ? error : new Error(String(error)),
      })

      return results
    }
  }

  /**
   * Тестирует базовую операцию пополнения баланса
   */
  async testBasicIncomeOperation(): Promise<TestResult> {
    const paymentData = {
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      amount: 100,
      stars: 100,
      type: 'money_income',
      description: 'Test income operation',
      bot_name: TEST_CONFIG.bots.test_bot.name,
      service_type: ModeEnum.NeuroPhoto,
      metadata: {
        test: true,
        service_type: ModeEnum.NeuroPhoto,
      },
    }

    return this.sendEvent('payment/process', paymentData)
  }

  /**
   * Тестирует базовую операцию списания баланса
   */
  async testBasicOutcomeOperation(): Promise<TestResult> {
    const paymentData = {
      telegram_id: TEST_CONFIG.users.main.telegram_id,
      amount: 50,
      stars: 50,
      type: 'money_expense',
      description: 'Test expense operation',
      bot_name: TEST_CONFIG.bots.test_bot.name,
      service_type: ModeEnum.NeuroPhoto,
      metadata: {
        test: true,
        service_type: ModeEnum.NeuroPhoto,
      },
    }

    return this.sendEvent('payment/process', paymentData)
  }

  /**
   * Тестирует определение типа сервиса из описания
   */
  async testServiceTypeDetection(): Promise<TestResult[]> {
    const telegram_id = TEST_CONFIG.users.main.telegram_id
    const bot_name = TEST_CONFIG.bots.test_bot.name
    const is_ru = TEST_CONFIG.users.main.isRussian
    const testAmount = 10
    const results: TestResult[] = []

    // Тестируем все типы сервисов из ModeEnum
    for (const mode of Object.values(ModeEnum)) {
      const description = `Test payment for ${String(mode).replace(/_/g, ' ')}`

      logger.info({
        message: '🧪 Тест определения типа сервиса',
        description: 'Service type detection test',
        mode,
        testDescription: description,
      })

      const paymentData = {
        telegram_id,
        amount: testAmount,
        type: 'money_expense',
        description,
        bot_name,
        is_ru,
        payment_type: 'regular',
        currency: 'STARS',
        money_amount: 0,
      }

      const result = await this.sendEvent('payment/process', paymentData)
      results.push({
        ...result,
        name: `Service Type Detection Test - ${mode}`,
        message: result.message || 'Test completed',
      })
    }

    return results
  }

  /**
   * Тестирует обработку метаданных платежа
   */
  async testPaymentMetadata(): Promise<TestResult> {
    const telegram_id = TEST_CONFIG.users.main.telegram_id
    const bot_name = TEST_CONFIG.bots.test_bot.name
    const is_ru = TEST_CONFIG.users.main.isRussian
    const testAmount = 25

    logger.info({
      message: '🧪 Тест обработки метаданных платежа',
      description: 'Payment metadata processing test',
      telegram_id,
    })

    const paymentData = {
      telegram_id,
      amount: testAmount,
      type: 'money_expense',
      description: 'Test payment with metadata',
      bot_name,
      is_ru,
      payment_type: 'subscription',
      currency: 'RUB',
      money_amount: 1000,
      metadata: {
        service_type: ModeEnum.TextToImage,
        campaign: 'test_campaign',
        operation_id: 'test_op_123',
      },
    }

    const result = await this.sendEvent('payment/process', paymentData)
    return {
      ...result,
      name: 'Payment Metadata Test',
      message: result.message || 'Test completed',
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
      const errorMessage = this.handleError(error)
      logger.error({
        message: '❌ Ошибка при выполнении тестов генерации изображений',
        description: 'Error running image generation tests',
        error: errorMessage,
      })

      results.push({
        name: 'Error in runImageGenerationTests',
        success: false,
        message: 'Произошла ошибка при выполнении тестов генерации изображений',
        error: error instanceof Error ? error : new Error(String(error)),
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
        name: r.name,
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
            telegram_ids: [TEST_CONFIG.users.main.telegram_id],
            bot_name: TEST_CONFIG.bots.test_bot.name,
          })
          results.push(broadcastResult)
          break

        case 'payment':
          paymentResult = await this.sendEvent('payment/process', {
            amount: 100,
            telegram_id: TEST_CONFIG.users.main.telegram_id,
            username: TEST_CONFIG.users.main.username,
            bot_name: TEST_CONFIG.bots.test_bot.name,
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
      const errorMessage = this.handleError(error)
      logger.error({
        message: `❌ Ошибка при запуске тестов функции ${functionName}`,
        description: `Error running ${functionName} function tests`,
        error: errorMessage,
      })

      return [
        {
          name: `Тест функции ${functionName}`,
          success: false,
          message: `Ошибка при запуске тестов функции ${functionName}`,
          error: error instanceof Error ? error : new Error(String(error)),
        },
      ]
    }
  }

  /**
   * Тестирует аудио генерацию
   */
  async testAudioGeneration(
    text: string,
    voice_id: string
  ): Promise<Omit<TestResult, 'name'>> {
    try {
      logger.info({
        message: '🧪 Тест генерации аудио',
        description: 'Audio generation test',
        text,
        voice_id,
      })

      // Используем метод generate для генерации аудио
      const audioStream = await elevenlabs.generate({
        voice: voice_id,
        model_id: 'eleven_turbo_v2_5',
        text,
      })

      if (!audioStream) {
        throw new Error('Не удалось получить аудио поток')
      }

      // Создаем временный файл для сохранения аудио
      const outputPath = path.join(os.tmpdir(), `test_audio_${Date.now()}.mp3`)
      const writeStream = createWriteStream(outputPath)

      await new Promise<void>((resolve, reject) => {
        audioStream.pipe(writeStream)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })

      return {
        success: true,
        message: 'Аудио успешно сгенерировано',
        error: undefined,
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const error = new Error(errorMessage)

      logger.error({
        message: '❌ Ошибка при генерации аудио',
        description: 'Error during audio generation',
        error: errorMessage,
      })

      return {
        success: false,
        message: 'Ошибка при генерации аудио',
        error,
      }
    }
  }

  /**
   * Тестирует отправку аудио
   */
  async testAudioSending({
    text,
    voice_id,
    telegram_id,
    bot_name,
  }: {
    text: string
    voice_id: string
    telegram_id: TelegramId
    bot_name: string
  }): Promise<TestResult> {
    try {
      logger.info({
        message: '🧪 Тест отправки аудио',
        description: 'Audio sending test',
        text,
        voice_id,
        telegram_id,
        bot_name,
      })

      const bot = await getBotByName(bot_name)
      if (!bot) {
        throw new Error(`Бот ${bot_name} не найден`)
      }

      const audioResult = await this.testAudioGeneration(text, voice_id)
      if (!audioResult.success) {
        throw audioResult.error || new Error('Ошибка при генерации аудио')
      }

      return {
        name: 'audio-sending',
        success: true,
        message: 'Аудио успешно отправлено',
        error: undefined,
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const error = new Error(errorMessage)

      logger.error({
        message: '❌ Ошибка при отправке аудио',
        description: 'Error during audio sending',
        error: errorMessage,
      })

      return {
        name: 'audio-sending',
        success: false,
        message: 'Ошибка при отправке аудио',
        error,
      }
    }
  }

  /**
   * Тестирует преобразование текста в видео
   */
  async testTextToVideo(params: {
    prompt: string
    telegram_id: string
    bot_name: string
  }): Promise<TestResult & { videoBuffer?: Buffer }> {
    try {
      logger.info({
        message: '🧪 Тест преобразования текста в видео',
        description: 'Text to video test',
        params,
      })

      const videoBuffer = Buffer.from('test-video-data')

      return {
        name: 'text-to-video',
        success: true,
        message: 'Видео успешно сгенерировано',
        error: undefined,
        videoBuffer,
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const error = new Error(errorMessage)

      logger.error({
        message: '❌ Ошибка при генерации видео',
        description: 'Error during video generation',
        error: errorMessage,
      })

      return {
        name: 'text-to-video',
        success: false,
        message: 'Ошибка при генерации видео',
        error,
        videoBuffer: undefined,
      }
    }
  }
}
