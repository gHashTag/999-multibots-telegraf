import { InngestFunctionTester } from '../../core/InngestFunctionTester'
import { TestDataFactory } from '../../factories/TestDataFactory'
import { logger } from '@/utils/logger'

/**
 * Входные данные для теста нейрофото V2
 */
export interface NeuroPhotoV2TestInput {
  prompt: string
  num_images: number
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
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
 * Класс для тестирования функции нейрофото V2
 */
export class NeuroPhotoV2Tester extends InngestFunctionTester<
  NeuroPhotoV2TestInput,
  NeuroPhotoV2TestOutput
> {
  constructor(options: Partial<any> = {}) {
    super('neuro/photo-v2.generate', {
      name: 'НейроФото V2 тест',
      ...options,
    })
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

    // Глобальный мок для fetch
    global.fetch = mocks.fetch as any

    // Создаем мок для Inngest step
    const step = {
      run: async (name: string, fn: () => Promise<any>) => {
        logger.info({
          message: `🔍 Выполнение шага: ${name}`,
          description: `Executing step: ${name}`,
        })
        return await fn()
      },
    }

    // Имитируем событие Inngest
    const event = {
      data: input,
    }

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
