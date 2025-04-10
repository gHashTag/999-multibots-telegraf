import { InngestTester } from '../inngest/inngest-tests.test'
import { InngestFunctionTester as BaseInngestFunctionTester } from '../core/InngestFunctionTester'
import { logger } from '@/utils/logger'

/**
 * Возможные методы тестирования Inngest функций
 */
export enum InngestTestMethod {
  ModelTraining = 'testModelTraining',
  ModelTrainingV2 = 'testModelTrainingV2',
  NeuroImageGeneration = 'testNeuroImageGeneration',
  NeuroPhotoV2Generation = 'testNeuroPhotoV2Generation',
  TextToImage = 'testTextToImage',
  TextToVideo = 'testTextToVideo',
  VoiceAvatarCreation = 'testVoiceAvatarCreation',
  TextToSpeech = 'testTextToSpeech',
  PaymentProcessorIncome = 'testPaymentProcessorIncome',
  PaymentProcessorExpense = 'testPaymentProcessorExpense',
  RunAllTests = 'runAllTests',
}

/**
 * Результат выполнения теста Inngest функции
 */
export interface InngestTestResult {
  success: boolean
  message?: string
  data?: unknown
  error?: Error | string
  duration?: number
}

/**
 * Дополнительные данные для теста
 */
export interface InngestTestData {
  [key: string]: unknown
}

/**
 * Интерфейс для входных данных тестера Inngest функций
 */
export interface InngestFunctionTestInput {
  method?: InngestTestMethod | string
  data?: InngestTestData
}

/**
 * Опции для создания тестера Inngest функций
 */
export interface InngestFunctionTesterOptions {
  name?: string
  verbose?: boolean
  timeout?: number
}

/**
 * Тестер для Inngest функций
 *
 * Обертка над существующим InngestTester для интеграции в новую систему тестирования
 */
export class InngestFunctionTester extends BaseInngestFunctionTester<
  InngestFunctionTestInput,
  InngestTestResult
> {
  private inngestTester: InngestTester;

  // Определяем индексную сигнатуру для доступа к методам по строковому ключу
  [key: string]: unknown

  constructor(options: Partial<InngestFunctionTesterOptions> = {}) {
    super('inngest/function.test', {
      name: options.name || 'Inngest Function Tester',
      verbose: options.verbose || false,
    })

    this.inngestTester = new InngestTester()
  }

  /**
   * Тест функции тренировки модели
   */
  async testModelTraining(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции тренировки модели',
      description: 'Testing model training function',
    })

    try {
      const result = await this.inngestTester.testModelTraining()
      return {
        success: true,
        message: 'Тест тренировки модели успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции тренировки модели',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции тренировки модели V2
   */
  async testModelTrainingV2(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции тренировки модели V2',
      description: 'Testing model training V2 function',
    })

    try {
      const result = await this.inngestTester.testModelTrainingV2()
      return {
        success: true,
        message: 'Тест тренировки модели V2 успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции тренировки модели V2',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции генерации нейрофото
   */
  async testNeuroImageGeneration(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции генерации изображений',
      description: 'Testing neuro image generation function',
    })

    try {
      const result = await this.inngestTester.testNeuroImageGeneration()
      return {
        success: true,
        message: 'Тест генерации нейрофото успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции генерации нейрофото',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции генерации нейрофото V2
   */
  async testNeuroPhotoV2Generation(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции генерации нейрофото V2',
      description: 'Testing neurophoto V2 generation function',
    })

    try {
      const result = await this.inngestTester.testNeuroPhotoV2Generation()
      return {
        success: true,
        message: 'Тест генерации нейрофото V2 успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции генерации нейрофото V2',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции генерации текст-в-изображение
   */
  async testTextToImage(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции генерации текст-в-изображение',
      description: 'Testing text to image function',
    })

    try {
      const result = await this.inngestTester.testTextToImage()
      return {
        success: true,
        message: 'Тест генерации текст-в-изображение успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message:
          'Ошибка при тестировании функции генерации текст-в-изображение',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции генерации текст-в-видео
   */
  async testTextToVideo(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции генерации текст-в-видео',
      description: 'Testing text to video function',
    })

    try {
      const result = await this.inngestTester.testTextToVideo()
      return {
        success: true,
        message: 'Тест генерации текст-в-видео успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции генерации текст-в-видео',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции создания голосового аватара
   */
  async testVoiceAvatarCreation(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции создания голосового аватара',
      description: 'Testing voice avatar creation function',
    })

    try {
      const result = await this.inngestTester.testVoiceAvatarCreation()
      return {
        success: true,
        message: 'Тест создания голосового аватара успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции создания голосового аватара',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции текст-в-речь
   */
  async testTextToSpeech(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции текст-в-речь',
      description: 'Testing text to speech function',
    })

    try {
      const results = await this.inngestTester.runTextToSpeechTests()
      return {
        success: true,
        message: 'Тест генерации текст-в-речь успешно выполнен',
        data: results[0], // Возвращаем результат первого теста
      }
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции текст-в-речь',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции обработки платежа (пополнение)
   */
  async testPaymentProcessorIncome(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции обработки платежа (пополнение)',
      description: 'Testing payment processor income function',
    })

    try {
      const result = await this.inngestTester.testPaymentProcessorIncome()
      return {
        success: true,
        message: 'Тест обработки платежа (пополнение) успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message:
          'Ошибка при тестировании функции обработки платежа (пополнение)',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции обработки платежа (списание)
   */
  async testPaymentProcessorExpense(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест функции обработки платежа (списание)',
      description: 'Testing payment processor expense function',
    })

    try {
      const result = await this.inngestTester.testPaymentProcessorExpense()
      return {
        success: true,
        message: 'Тест обработки платежа (списание) успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message: 'Ошибка при тестировании функции обработки платежа (списание)',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Тест функции обработки платежа (прямой вызов)
   */
  async testPaymentProcessorDirectInvoke(): Promise<InngestTestResult> {
    logger.info({
      message: '🧪 Тест прямого вызова функции обработки платежа',
      description: 'Testing direct invoke payment processor function',
    })

    try {
      const result = await this.inngestTester.testPaymentProcessorDirectInvoke()
      return {
        success: true,
        message: 'Тест прямого вызова обработки платежа успешно выполнен',
        data: result,
      }
    } catch (error) {
      return {
        success: false,
        message:
          'Ошибка при тестировании прямого вызова функции обработки платежа',
        error: error instanceof Error ? error : String(error),
      }
    }
  }

  /**
   * Запуск всех тестов обработки платежей
   */
  async testAllPaymentProcessorFunctions(): Promise<InngestTestResult[]> {
    logger.info({
      message: '🧪 Запуск всех тестов функций обработки платежей',
      description: 'Running all payment processor function tests',
    })

    const results: InngestTestResult[] = []

    try {
      // Тест пополнения баланса
      const incomeResult = await this.testPaymentProcessorIncome()
      results.push(incomeResult)

      // Тест списания средств
      const expenseResult = await this.testPaymentProcessorExpense()
      results.push(expenseResult)

      // Тест прямого вызова
      const directResult = await this.testPaymentProcessorDirectInvoke()
      results.push(directResult)

      return results
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при выполнении тестов функций обработки платежей',
        description: 'Error running payment processor function tests',
        error: error instanceof Error ? error.message : String(error),
      })

      return [
        {
          success: false,
          message: 'Ошибка при выполнении тестов функций обработки платежей',
          error: error instanceof Error ? error : String(error),
        },
      ]
    }
  }

  /**
   * Запуск всех тестов (обновленный для включения тестов платежей)
   */
  async runAllTests(): Promise<InngestTestResult[]> {
    logger.info({
      message: '🧪 Запуск всех тестов Inngest функций',
      description: 'Running all Inngest function tests',
    })

    const results: InngestTestResult[] = []

    try {
      // Стандартные тесты
      const standardResults = await this.inngestTester.runAllTests()
      for (const result of standardResults) {
        results.push({
          success: result.success,
          message: result.message,
          data: result.details,
          error: result.error,
          duration: result.duration,
        })
      }

      // Тесты обработки платежей (уже включены в runAllTests в InngestTester)

      return results
    } catch (error) {
      return [
        {
          success: false,
          message: 'Ошибка при выполнении всех тестов',
          error: error instanceof Error ? error : String(error),
        },
      ]
    }
  }

  /**
   * Выполнение теста
   */
  protected async executeTest(
    input: InngestFunctionTestInput
  ): Promise<InngestTestResult> {
    const methodName = input.method || InngestTestMethod.RunAllTests

    if (typeof this[methodName] === 'function') {
      try {
        return await this[methodName](input.data)
      } catch (error) {
        return {
          success: false,
          message: `Ошибка при выполнении метода ${methodName}`,
          error: error instanceof Error ? error : String(error),
        }
      }
    }

    return {
      success: false,
      message: `Метод ${methodName} не найден`,
      error: new Error(`Method ${methodName} not found`),
    }
  }
}
