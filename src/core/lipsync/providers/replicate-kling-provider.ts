const Replicate = require('replicate')
import { logger } from '@/utils/logger'
import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import type { ILipSyncProvider } from '../interfaces/lipsync-provider.interface'
import type {
  UniversalLipSyncInput,
  LipSyncOutput,
  LipSyncError,
  LipSyncModelConfig,
  KlingLipSyncInput,
} from '../schemas/lipsync-schemas'

/**
 * Провайдер для Replicate Kling Lip-Sync модели
 * Реализует стандартный интерфейс ILipSyncProvider
 */
export class ReplicateKlingProvider implements ILipSyncProvider {
  readonly providerId = 'replicate' as const
  readonly providerName = 'Replicate Kling Lip-Sync'
  readonly supportedModels = ['kling']

  private replicate: typeof Replicate
  private config: {
    timeout: number
    retryAttempts: number
    webhookUrl?: string
  }

  constructor(
    config?: Partial<typeof ReplicateKlingProvider.prototype.config>
  ) {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN is not set')
    }

    this.replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    })

    this.config = {
      timeout: 300000, // 5 минут
      retryAttempts: 3,
      webhookUrl: undefined,
      ...config,
    }

    logger.info('🚀 Replicate Kling Provider инициализирован', {
      supportedModels: this.supportedModels,
      timeout: this.config.timeout,
    })
  }

  /**
   * Генерирует lip-sync видео через Replicate
   */
  async generate(
    input: UniversalLipSyncInput
  ): Promise<LipSyncOutput | LipSyncError> {
    try {
      // Проверяем, что это входные данные для Kling
      if (
        input.provider !== 'replicate' ||
        input.modelId !== 'kwaivgi/kling-lip-sync'
      ) {
        return {
          message: 'Invalid input for Replicate Kling provider',
          error: `Expected provider: replicate, modelId: kwaivgi/kling-lip-sync`,
          code: 'INVALID_INPUT',
          provider: 'replicate',
          modelId: input.modelId,
        }
      }

      const klingInput = input as KlingLipSyncInput

      logger.info('🎬 Запуск Replicate Kling генерации', {
        telegramId: klingInput.telegramId,
        modelId: klingInput.modelId,
        hasParameters: !!klingInput.parameters,
      })

      // Подготавливаем данные для Replicate API
      const replicateInput = {
        input: {
          video_url: klingInput.videoUrl,
          audio_url: klingInput.audioUrl,
        },
      }

      // Добавляем webhook если настроен
      const options: any = {}
      if (this.config.webhookUrl || klingInput.parameters?.webhookUrl) {
        options.webhook =
          this.config.webhookUrl || klingInput.parameters?.webhookUrl
      }

      const prediction = await this.replicate.run(
        'kwaivgi/kling-lip-sync',
        replicateInput,
        options
      )

      logger.info('✅ Получен ответ от Replicate', {
        predictionId: (prediction as any)?.id || 'unknown',
        hasOutput: !!prediction,
      })

      // Если у нас сразу есть результат (синхронный режим)
      if (prediction && typeof prediction === 'string') {
        const resultUrl = prediction

        // Сохраняем в Supabase
        if (klingInput.parameters?.saveOutput !== false) {
          const uniqueId = `kling_lipsync_${Date.now()}_${
            klingInput.telegramId
          }`
          await saveVideoUrlToSupabase(
            klingInput.telegramId,
            uniqueId,
            resultUrl,
            'kling_lipsync'
          )
        }

        return {
          id: `kling_${Date.now()}_${klingInput.telegramId}`,
          status: 'succeeded',
          output: resultUrl,
          modelUsed: this.providerName,
          costEstimate: this.calculateCost(10, 'kling'), // Предполагаем 10 секунд
        }
      }

      // Асинхронный режим
      const predictionId = (prediction as any)?.id || `kling_${Date.now()}`
      return {
        id: predictionId,
        status: 'starting',
        modelUsed: this.providerName,
        costEstimate: this.calculateCost(10, 'kling'),
      }
    } catch (error) {
      logger.error('❌ Ошибка Replicate Kling генерации', {
        error: error instanceof Error ? error.message : String(error),
        telegramId: (input as KlingLipSyncInput).telegramId,
      })

      return {
        message: 'Ошибка при генерации видео с липсинком',
        error: error instanceof Error ? error.message : String(error),
        code: 'REPLICATE_ERROR',
        provider: 'replicate',
        modelId: input.modelId,
      }
    }
  }

  /**
   * Получает статус обработки
   */
  async getStatus(predictionId: string): Promise<LipSyncOutput | LipSyncError> {
    try {
      logger.info('🔍 Проверка статуса Replicate', { predictionId })

      const prediction = await this.replicate.predictions.get(predictionId)

      return {
        id: prediction.id,
        status: prediction.status as any,
        output: prediction.output as string,
        error: prediction.error as string,
        modelUsed: this.providerName,
        costEstimate: this.calculateCost(10, 'kling'),
      }
    } catch (error) {
      logger.error('❌ Ошибка получения статуса Replicate', {
        predictionId,
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        message: 'Ошибка при получении статуса',
        error: error instanceof Error ? error.message : String(error),
        code: 'STATUS_ERROR',
        provider: 'replicate',
      }
    }
  }

  /**
   * Проверяет доступность Replicate
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Простая проверка - попытка получить информацию о модели
      await this.replicate.models.get('kwaivgi', 'kling-lip-sync')
      return true
    } catch (error) {
      logger.warn('⚠️ Replicate недоступен', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Проверяет поддержку модели
   */
  supportsModel(modelId: string): boolean {
    return this.supportedModels.includes(modelId)
  }

  /**
   * Получает конфигурацию модели
   */
  getModelsConfig(): LipSyncModelConfig[] {
    return [
      {
        id: 'kling',
        name: '🚀 Kling Lip-Sync',
        description:
          'Быстрая и точная модель от Replicate. Отличное качество по доступной цене.',
        provider: 'replicate',
        modelId: 'kwaivgi/kling-lip-sync',
        costPerSecond: 0.014, // $0.014 per second
        maxDuration: 30,
        quality: 'high',
        isAvailable: true,
        features: [
          'Высокая скорость обработки',
          'Точная синхронизация',
          'Поддержка различных типов лиц',
          'Экономичная цена',
        ],
        supportedFormats: {
          video: ['mp4', 'avi', 'mov'],
          audio: ['mp3', 'wav', 'aac'],
        },
        limitations: {
          maxFileSize: 50 * 1024 * 1024, // 50MB
          maxResolution: '1920x1080',
          minDuration: 1,
          maxDuration: 30,
        },
      },
    ]
  }

  /**
   * Рассчитывает стоимость
   */
  calculateCost(durationSeconds: number, modelId: string): number {
    if (!this.supportsModel(modelId)) {
      throw new Error(`Model ${modelId} not supported by this provider`)
    }

    return 0.014 * durationSeconds // $0.014 per second
  }

  /**
   * Отменяет обработку (если поддерживается)
   */
  async cancel(predictionId: string): Promise<boolean> {
    try {
      await this.replicate.predictions.cancel(predictionId)
      logger.info('✅ Replicate предсказание отменено', { predictionId })
      return true
    } catch (error) {
      logger.error('❌ Не удалось отменить Replicate предсказание', {
        predictionId,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }
}
