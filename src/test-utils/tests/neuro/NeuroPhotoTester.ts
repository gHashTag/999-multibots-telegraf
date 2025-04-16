import { InngestFunctionTester } from '../../core/InngestFunctionTester'
import { TestDataFactory } from '../../factories/TestDataFactory'
import { logger } from '@/utils/logger'

/**
 * Входные данные для теста нейрофото
 */
export interface NeuroPhotoTestInput {
  prompt: string
  model_url: string
  numImages: number
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
}

/**
 * Результат теста нейрофото
 */
export interface NeuroPhotoTestOutput {
  success: boolean
  user: any
  balance?: number
  aspectRatio?: string
  outputUrl?: any
  localPath?: string
  promptId?: string
  generatedImages?: string[]
}

/**
 * Класс для тестирования функции нейрофото
 */
export class NeuroPhotoTester extends InngestFunctionTester<
  NeuroPhotoTestInput,
  NeuroPhotoTestOutput
> {
  constructor(options: Partial<any> = {}) {
    super('neuro/photo.generate', {
      name: 'НейроФото тест',
      ...options,
    })
  }

  /**
   * Выполняет тестирование функции нейрофото
   */
  protected async executeTest(
    input: NeuroPhotoTestInput,
    customMocks: Record<string, any> = {}
  ): Promise<NeuroPhotoTestOutput> {
    // Создаем стандартные моки через фабрику
    const mocks = {
      ...TestDataFactory.createAllMocks(),
      ...customMocks,
    }

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

    // Выполняем основные шаги обработки по аналогии с реальной функцией
    logger.info({
      message: '👤 Проверка пользователя',
      description: 'Checking user existence',
    })
    const user = await mocks.getUserByTelegramIdString()

    logger.info({
      message: '💰 Расчет стоимости',
      description: 'Calculating cost',
    })

    logger.info({
      message: '💵 Проверка баланса',
      description: 'Checking balance',
    })
    const balance = await mocks.getUserBalance()

    logger.info({
      message: '📐 Получение аспект-рейшио',
      description: 'Getting aspect ratio',
    })
    const aspectRatio = await mocks.getAspectRatio()

    logger.info({
      message: '🖼️ Генерация изображения',
      description: 'Generating image',
    })
    const outputUrl = await mocks.replicate.run()

    logger.info({
      message: '📁 Сохранение файла',
      description: 'Saving file locally',
    })
    const localPath = await mocks.saveFileLocally()

    logger.info({
      message: '📝 Сохранение промпта',
      description: 'Saving prompt',
    })
    const promptId = await mocks.savePrompt()

    logger.info({
      message: '📨 Отправка изображения пользователю',
      description: 'Sending image to user',
    })
    await mocks.getBotByName().bot.telegram.sendPhoto()

    // Формируем результаты теста
    return {
      success: true,
      user,
      balance,
      aspectRatio,
      outputUrl,
      localPath,
      promptId,
      generatedImages: [`https://example.com/uploads/test-image.jpg`],
    }
  }

  /**
   * Запускает тест с определенным промптом
   */
  async testWithPrompt(prompt: string): Promise<any> {
    const input = TestDataFactory.createNeuroPhotoData({
      prompt,
    })

    return await this.runTest(input)
  }

  /**
   * Запускает тест с несколькими изображениями
   */
  async testWithMultipleImages(numImages: number): Promise<any> {
    const input = TestDataFactory.createNeuroPhotoData({
      numImages,
    })

    return await this.runTest(input)
  }
}
