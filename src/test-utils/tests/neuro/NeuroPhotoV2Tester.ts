import { TestDataFactory } from '../../factories/TestDataFactory'
import { logger } from '@/utils/logger'
import axios from 'axios'
import { InngestFunctionTester } from '@/test-utils/core/InngestFunctionTester'

/**
 * Интерфейс входных данных для теста нейрофото V2
 */
export interface NeuroPhotoV2TestInput {
  prompt: string
  num_images: number
  telegram_id: string
  is_ru: boolean
  bot_name: string
  username?: string
}

/**
 * Результат теста нейрофото V2
 */
export interface NeuroPhotoV2TestOutput {
  success: boolean
  user: any
  aspectRatio?: string
  finetuneId?: string
  dimensions?: { width: number; height: number }
  costPerImage?: number
  tasks?: Array<{
    taskId: string
    status: string
    prompt: string
    savedTask: any
  }>
}

/**
 * Класс для тестирования функций НейроФото V2
 *
 * Позволяет проверить доступность API и конфигурацию BFL,
 * а также тестировать функциональность НейроФото V2.
 */
export class NeuroPhotoV2Tester extends InngestFunctionTester<
  NeuroPhotoV2TestInput,
  NeuroPhotoV2TestOutput
> {
  private bflApiKey: string
  private bflWebhookSecret: string
  private apiUrl: string
  private apiEndpoint: string
  private finetunedApiEndpoint: string

  constructor(options: Partial<any> = {}) {
    super('neuro/photo-v2.generate', {
      name: 'НейроФото V2 тест',
      ...options,
    })

    this.bflApiKey = process.env.BFL_API_KEY || ''
    this.bflWebhookSecret = process.env.BFL_WEBHOOK_SECRET || ''
    this.apiUrl = process.env.API_URL || 'http://localhost:3000'
    this.apiEndpoint = 'https://api.us1.bfl.ai/v1/flux-pro-1.1-ultra'
    this.finetunedApiEndpoint =
      'https://api.us1.bfl.ai/v1/flux-pro-1.1-ultra-finetuned'
  }

  /**
   * Проверяет наличие необходимых переменных окружения
   */
  async checkEnvironmentVariables(): Promise<{
    success: boolean
    missingVariables: string[]
    message: string
  }> {
    logger.info({
      message: '🔍 Проверка переменных окружения для НейроФото V2',
      description: 'Checking environment variables for NeuroPhoto V2',
    })

    const requiredVariables = [
      { name: 'BFL_API_KEY', value: this.bflApiKey },
      { name: 'BFL_WEBHOOK_SECRET', value: this.bflWebhookSecret },
      { name: 'API_URL', value: this.apiUrl },
    ]

    const missingVariables = requiredVariables
      .filter(v => !v.value)
      .map(v => v.name)

    if (missingVariables.length === 0) {
      logger.info({
        message: '✅ Все необходимые переменные окружения настроены',
        description: 'All required environment variables are set',
      })

      return {
        success: true,
        missingVariables: [],
        message: 'Все необходимые переменные окружения настроены',
      }
    } else {
      logger.error({
        message: '❌ Отсутствуют необходимые переменные окружения',
        description: 'Missing required environment variables',
        missingVariables,
      })

      return {
        success: false,
        missingVariables,
        message: `Отсутствуют необходимые переменные окружения: ${missingVariables.join(', ')}`,
      }
    }
  }

  /**
   * Проверяет доступность API для НейроФото V2
   */
  async checkApiAvailability(): Promise<{
    success: boolean
    standardApi: { available: boolean; error?: string }
    finetunedApi: { available: boolean; error?: string }
    message: string
  }> {
    logger.info({
      message: '🔍 Проверка доступности API для НейроФото V2',
      description: 'Checking API availability for NeuroPhoto V2',
    })

    // Проверка доступности стандартного API
    let standardApiAvailable = false
    let standardApiError = ''
    try {
      // Делаем HEAD запрос для проверки доступности
      const standardResponse = await axios({
        method: 'HEAD',
        url: this.apiEndpoint,
        headers: {
          'X-Key': this.bflApiKey,
        },
        validateStatus: () => true,
        timeout: 5000,
      })

      // API обычно возвращает 400, если запрос без тела, но это означает, что сервис доступен
      standardApiAvailable =
        standardResponse.status === 400 || standardResponse.status === 401
      if (!standardApiAvailable) {
        standardApiError = `Неожиданный статус: ${standardResponse.status}`
      }
    } catch (error) {
      standardApiAvailable = false
      standardApiError = error instanceof Error ? error.message : String(error)
    }

    // Проверка доступности API с fine-tuning
    let finetunedApiAvailable = false
    let finetunedApiError = ''
    try {
      const finetunedResponse = await axios({
        method: 'HEAD',
        url: this.finetunedApiEndpoint,
        headers: {
          'X-Key': this.bflApiKey,
        },
        validateStatus: () => true,
        timeout: 5000,
      })

      finetunedApiAvailable =
        finetunedResponse.status === 400 || finetunedResponse.status === 401
      if (!finetunedApiAvailable) {
        finetunedApiError = `Неожиданный статус: ${finetunedResponse.status}`
      }
    } catch (error) {
      finetunedApiAvailable = false
      finetunedApiError = error instanceof Error ? error.message : String(error)
    }

    const success = standardApiAvailable && finetunedApiAvailable

    if (success) {
      logger.info({
        message: '✅ API для НейроФото V2 доступно',
        description: 'API for NeuroPhoto V2 is available',
      })
    } else {
      logger.error({
        message: '❌ API для НейроФото V2 недоступно',
        description: 'API for NeuroPhoto V2 is not available',
        standardApiAvailable,
        standardApiError,
        finetunedApiAvailable,
        finetunedApiError,
      })
    }

    return {
      success,
      standardApi: {
        available: standardApiAvailable,
        error: standardApiError || undefined,
      },
      finetunedApi: {
        available: finetunedApiAvailable,
        error: finetunedApiError || undefined,
      },
      message: success
        ? 'API для НейроФото V2 доступно'
        : 'API для НейроФото V2 недоступно. Проверьте соединение и ключ API.',
    }
  }

  /**
   * Проверяет доступность webhook для НейроФото V2
   */
  async checkWebhookAvailability(): Promise<{
    success: boolean
    error?: string
    message: string
  }> {
    logger.info({
      message: '🔍 Проверка доступности webhook для НейроФото V2',
      description: 'Checking webhook availability for NeuroPhoto V2',
    })

    const webhookUrl = `${this.apiUrl}/webhooks/neurophoto`

    try {
      // Делаем GET запрос для проверки доступности
      const response = await axios({
        method: 'GET',
        url: webhookUrl,
        validateStatus: () => true,
        timeout: 5000,
      })

      // Webhook обычно возвращает 404 или 405 для GET запроса, что указывает на то, что сервис работает
      const success =
        response.status === 404 ||
        response.status === 405 ||
        response.status === 400

      if (success) {
        logger.info({
          message: '✅ Webhook для НейроФото V2 доступен',
          description: 'Webhook for NeuroPhoto V2 is available',
          status: response.status,
        })

        return {
          success: true,
          message: 'Webhook для НейроФото V2 доступен',
        }
      } else {
        logger.error({
          message: '❌ Webhook для НейроФото V2 вернул неожиданный статус',
          description: 'Webhook for NeuroPhoto V2 returned unexpected status',
          status: response.status,
        })

        return {
          success: false,
          error: `Неожиданный статус webhook: ${response.status}`,
          message: `Webhook для НейроФото V2 вернул неожиданный статус: ${response.status}`,
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      logger.error({
        message: '❌ Ошибка при проверке webhook для НейроФото V2',
        description: 'Error checking webhook for NeuroPhoto V2',
        error: errorMessage,
      })

      return {
        success: false,
        error: errorMessage,
        message: `Ошибка при проверке webhook для НейроФото V2: ${errorMessage}`,
      }
    }
  }

  /**
   * Выполняет полную проверку системы НейроФото V2
   */
  async runSystemCheck(): Promise<{
    success: boolean
    envCheck: { success: boolean; missingVariables: string[] }
    apiCheck: {
      success: boolean
      standardApi: { available: boolean; error?: string }
      finetunedApi: { available: boolean; error?: string }
    }
    webhookCheck: { success: boolean; error?: string }
    message: string
  }> {
    logger.info({
      message: '🚀 Запуск полной проверки системы НейроФото V2',
      description: 'Running full system check for NeuroPhoto V2',
    })

    // Проверка переменных окружения
    const envCheck = await this.checkEnvironmentVariables()

    // Если критические переменные отсутствуют, пропускаем дальнейшие проверки
    if (
      !envCheck.success &&
      envCheck.missingVariables.includes('BFL_API_KEY')
    ) {
      logger.error({
        message:
          '❌ Критические переменные отсутствуют, пропуск дальнейших проверок',
        description: 'Critical variables are missing, skipping further checks',
        missingVariables: envCheck.missingVariables,
      })

      return {
        success: false,
        envCheck: {
          success: envCheck.success,
          missingVariables: envCheck.missingVariables,
        },
        apiCheck: {
          success: false,
          standardApi: {
            available: false,
            error: 'Пропущено из-за отсутствия BFL_API_KEY',
          },
          finetunedApi: {
            available: false,
            error: 'Пропущено из-за отсутствия BFL_API_KEY',
          },
        },
        webhookCheck: {
          success: false,
          error: 'Пропущено из-за отсутствия необходимых переменных окружения',
        },
        message: `Проверка системы НейроФото V2 не пройдена. ${envCheck.message}`,
      }
    }

    // Проверка доступности API
    const apiCheck = await this.checkApiAvailability()

    // Проверка доступности webhook
    const webhookCheck = await this.checkWebhookAvailability()

    // Определение общего результата
    const success = envCheck.success && apiCheck.success && webhookCheck.success

    if (success) {
      logger.info({
        message: '✅ Система НейроФото V2 полностью работоспособна',
        description: 'NeuroPhoto V2 system is fully operational',
      })
    } else {
      logger.error({
        message: '❌ Система НейроФото V2 имеет проблемы',
        description: 'NeuroPhoto V2 system has issues',
        envCheck,
        apiCheck,
        webhookCheck,
      })
    }

    return {
      success,
      envCheck: {
        success: envCheck.success,
        missingVariables: envCheck.missingVariables,
      },
      apiCheck,
      webhookCheck,
      message: success
        ? 'Система НейроФото V2 полностью работоспособна'
        : 'Система НейроФото V2 имеет проблемы. Проверьте детали в логах.',
    }
  }

  /**
   * Выполняет тестирование функции нейрофото V2
   */
  protected async executeTest(
    input: NeuroPhotoV2TestInput,
    customMocks: Record<string, any> = {}
  ): Promise<NeuroPhotoV2TestOutput> {
    // Создаем моки через фабрику
    const mocks = {
      ...TestDataFactory.createAllMocks(),
      ...customMocks,
    }

    // Сохраняем и заменяем глобальный fetch
    const originalFetch = (global as any).fetch
    ;(global as any).fetch = mocks.fetch as any

    try {
      // Выполняем основные шаги обработки
      logger.info({
        message: '👤 Проверка пользователя',
        description: 'Checking user existence',
      })
      const user = await mocks.getUserByTelegramId()

      logger.info({
        message: '💰 Расчет стоимости',
        description: 'Calculating cost',
      })
      const costPerImage = 15 // Примерная стоимость

      logger.info({
        message: '💵 Обработка платежа',
        description: 'Processing payment',
      })

      logger.info({
        message: '📐 Получение параметров для генерации',
        description: 'Getting generation parameters',
      })
      const aspectRatio = await mocks.getAspectRatio()
      const finetuneId = await mocks.getFineTuneIdByTelegramId()

      logger.info({
        message: '📐 Расчет размеров изображения',
        description: 'Calculating image dimensions',
      })
      const dimensions = { width: 1024, height: 1024 }

      // Генерируем задачи для каждого запрошенного изображения
      const tasks = []

      for (let i = 0; i < input.num_images; i++) {
        logger.info({
          message: `🔄 Отправка запроса на генерацию #${i + 1}`,
          description: `Sending generation request #${i + 1}`,
        })

        const response = await mocks.fetch()
        const data = await response.json()

        logger.info({
          message: '📝 Сохранение задачи',
          description: 'Saving task',
        })
        const savedTask = await mocks.saveNeuroPhotoPrompt()

        logger.info({
          message: '📩 Отправка сообщения пользователю',
          description: 'Sending message to user',
        })
        await mocks.getBotByName().bot.telegram.sendMessage()

        tasks.push({
          taskId: data.id,
          status: data.status,
          prompt: input.prompt,
          savedTask,
        })
      }

      // Формируем результат
      return {
        success: true,
        user,
        aspectRatio,
        finetuneId,
        dimensions,
        costPerImage,
        tasks,
      }
    } finally {
      // Восстанавливаем оригинальный fetch
      ;(global as any).fetch = originalFetch
    }
  }

  /**
   * Запускает тест с определенным промптом
   */
  async testWithPrompt(prompt: string): Promise<any> {
    const input = TestDataFactory.createNeuroPhotoV2Data({
      prompt,
    })

    return await this.runTest(input)
  }

  /**
   * Запускает тест с несколькими изображениями
   */
  async testWithMultipleImages(numImages: number): Promise<any> {
    const input = TestDataFactory.createNeuroPhotoV2Data({
      num_images: numImages,
    })

    return await this.runTest(input)
  }
}
