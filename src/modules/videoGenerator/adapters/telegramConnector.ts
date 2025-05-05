import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { generateImageToVideo } from '../generateImageToVideo'
import { logger } from '@/utils/logger'
import { isRussian } from '@/helpers/language'

/**
 * TelegramConnector - адаптер для связи между Telegram-ботом и модулем генерации видео.
 * Этот класс отвечает за обработку взаимодействий с Telegram API и передачу данных в модуль.
 */
export class TelegramConnector {
  private telegram: Telegraf<MyContext>['telegram']
  private chatId: number
  private isRu: boolean

  constructor(
    telegram: Telegraf<MyContext>['telegram'],
    chatId: number,
    isRu: boolean
  ) {
    this.telegram = telegram
    this.chatId = chatId
    this.isRu = isRu
  }

  /**
   * Запускает процесс генерации видео, передавая данные из Telegram в модуль.
   * @param telegramId ID пользователя в Telegram
   * @param username Имя пользователя
   * @param botName Имя бота
   * @param videoModel Модель для генерации видео
   * @param imageUrl URL изображения для стандартного режима
   * @param prompt Текстовый промпт
   * @param isMorphing Флаг режима морфинга
   * @param imageAUrl URL первого изображения для морфинга
   * @param imageBUrl URL второго изображения для морфинга
   * @param dependencies Зависимости для модуля генерации видео
   */
  async startVideoGeneration(
    telegramId: string,
    username: string,
    botName: string,
    videoModel: string,
    imageUrl: string | null,
    prompt: string | null,
    isMorphing: boolean,
    imageAUrl: string | null,
    imageBUrl: string | null,
    dependencies: any
  ): Promise<void> {
    try {
      logger.info('[TelegramConnector] Starting video generation', {
        telegramId,
        videoModel,
        isMorphing,
      })
      await this.telegram.sendMessage(
        this.chatId,
        this.isRu
          ? '✅ Запрос принят! Начинаю генерацию видео... Это может занять некоторое время.'
          : '✅ Request accepted! Starting video generation... This might take a while.'
      )

      await generateImageToVideo(
        telegramId,
        username,
        this.isRu,
        botName,
        videoModel,
        imageUrl,
        prompt,
        isMorphing,
        imageAUrl,
        imageBUrl,
        this.telegram,
        this.chatId,
        dependencies
      )
    } catch (error) {
      logger.error('[TelegramConnector] Error starting video generation', {
        error,
        telegramId,
      })
      await this.telegram.sendMessage(
        this.chatId,
        this.isRu
          ? '❌ Ошибка при запуске генерации видео.'
          : '❌ Error starting video generation.'
      )
    }
  }

  /**
   * Отправляет сообщение об ошибке пользователю.
   * @param errorMessage Текст ошибки
   */
  async onError(errorMessage: string): Promise<void> {
    await this.telegram.sendMessage(this.chatId, errorMessage)
  }

  /**
   * Отправляет сообщение о начале генерации.
   */
  async onGenerationStart(): Promise<void> {
    await this.telegram.sendMessage(
      this.chatId,
      this.isRu
        ? '🕒 Генерация видео началась...'
        : '🕒 Video generation started...'
    )
  }

  /**
   * Отправляет сообщение о завершении генерации и видео.
   * @param videoPath Путь к сгенерированному видео
   * @param caption Подпись к видео
   */
  async onGenerationComplete(
    videoPath: string,
    caption: string
  ): Promise<void> {
    await this.telegram.sendVideo(
      this.chatId,
      { source: videoPath },
      { caption }
    )
  }
}

logger.info('⚡️ TelegramConnector initialized for video generation module')
