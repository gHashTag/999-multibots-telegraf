import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  VIDEO_MODELS_CONFIG,
  type VideoModelConfig,
} from '@/modules/videoGenerator/config/models.config'
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import {
  downloadFileHelper,
  getUserHelper,
  processBalanceVideoOperationHelper,
  saveVideoUrlHelper,
  updateUserLevelHelper,
} from './helpers'
import { VIDEO_MODELS } from './config/videoModels'

/**
 * Основная функция для генерации видео из изображения или морфинга.
 * @param telegramId ID пользователя в Telegram
 * @param username Имя пользователя
 * @param isRu Флаг, указывающий на русский язык
 * @param botName Имя бота
 * @param videoModel Модель для генерации видео
 * @param imageUrl URL изображения для стандартного режима
 * @param prompt Текстовый промпт
 * @param isMorphing Флаг режима морфинга
 * @param imageAUrl URL первого изображения для морфинга
 * @param imageBUrl URL второго изображения для морфинга
 * @param telegram Telegram API для отправки сообщений
 * @param chatId ID чата для отправки сообщений
 * @param dependencies Зависимости для модуля генерации видео
 */
export async function generateImageToVideo(
  telegramId: string,
  username: string,
  isRu: boolean,
  botName: string,
  videoModel: string,
  imageUrl: string | null,
  prompt: string | null,
  isMorphing: boolean,
  imageAUrl: string | null,
  imageBUrl: string | null,
  telegram: Telegraf<MyContext>['telegram'],
  chatId: number,
  dependencies: any
): Promise<void> {
  try {
    logger.info('[generateImageToVideo] Starting video generation', {
      telegramId,
      videoModel,
      isMorphing,
    })

    // Проверка модели и режима
    if (!(videoModel in VIDEO_MODELS)) {
      throw new Error(`Unsupported video model: ${videoModel}`)
    }
    const modelConfig = VIDEO_MODELS[videoModel]
    if (isMorphing && !modelConfig.canMorph) {
      throw new Error(`Model ${modelConfig.name} does not support morphing`)
    }

    // Проверка входных данных
    if (isMorphing) {
      if (!imageAUrl || !imageBUrl) {
        throw new Error('Both Image A and Image B are required for morphing')
      }
    } else {
      if (!imageUrl) {
        throw new Error('Image URL is required for standard video generation')
      }
    }

    // Отправка сообщения о начале генерации
    await telegram.sendMessage(
      chatId,
      isRu ? '🕒 Генерация видео началась...' : '🕒 Video generation started...'
    )

    // Здесь будет логика генерации видео через API (например, Replicate)
    // Пока используем заглушку
    const videoUrl = 'mocked_video_url'
    const videoPath = '/mocked/path/to/video.mp4'

    // Отправка результата
    const caption = isRu
      ? `Ваше видео (${modelConfig.name}) готово!`
      : `Your video (${modelConfig.name}) is ready!`
    await telegram.sendVideo(chatId, { source: videoPath }, { caption })

    logger.info('[generateImageToVideo] Video generation completed', {
      telegramId,
      videoModel,
      isMorphing,
    })
  } catch (error) {
    logger.error('[generateImageToVideo] Error during video generation', {
      error,
      telegramId,
      videoModel,
      isMorphing,
    })
    const errorMessage = isRu
      ? '❌ Ошибка при генерации видео.'
      : '❌ Error during video generation.'
    await telegram.sendMessage(chatId, errorMessage)
    throw error
  }
}
