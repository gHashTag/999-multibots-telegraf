import { fal } from '@fal-ai/client'
import { logger } from '@/utils/logger'
import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import type { ILipSyncProvider } from '../interfaces/lipsync-provider.interface'
import type {
  UniversalLipSyncInput,
  LipSyncOutput,
  LipSyncError,
  LipSyncModelConfig,
} from '../schemas/lipsync-schemas'
import {
  LIPSYNC_MODELS,
  getLipSyncModelById,
} from '@/config/lipsync-models.config'
import { MARKUP_MULTIPLIER, STAR_COST_USD } from '@/price/constants'

/**
 * Провайдер для Fal.ai моделей lip-sync
 * Поддерживает: Veed Fabric 1.0 Fast, LatentSync, Hummingbird-0
 */
export class FalVeedFabricProvider implements ILipSyncProvider {
  readonly providerId = 'fal' as const
  readonly providerName = 'Fal.ai Lip-Sync'
  readonly supportedModels = [
    'fal-veed-fabric-1.0-fast',
    'fal-ai/latentsync',
    'fal-ai/tavus/hummingbird-lipsync/v0',
  ]

  private config: {
    baseUrl: string
    timeout: number
    retryAttempts: number
    defaultResolution: '480p' | '720p'
  }

  constructor(config?: Partial<typeof FalVeedFabricProvider.prototype.config>) {
    if (!process.env.FAL_KEY) {
      logger.warn('FAL_KEY не установлен. Fal.ai Veed Fabric будет недоступен.')
    }

    this.config = {
      baseUrl: 'https://fal.run',
      timeout: 300000, // 5 минут
      retryAttempts: 2,
      defaultResolution: '720p',
      ...config,
    }

    logger.info('🎭 Fal.ai Veed Fabric Provider инициализирован', {
      supportedModels: this.supportedModels,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      defaultResolution: this.config.defaultResolution,
    })
  }

  /**
   * Генерирует lip-sync видео через Fal.ai API
   * Поддерживает: Veed Fabric, LatentSync, Hummingbird-0
   */
  async generate(
    input: UniversalLipSyncInput
  ): Promise<LipSyncOutput | LipSyncError> {
    try {
      // Проверяем, что это входные данные для Fal
      if (input.provider !== 'fal' || !this.supportsModel(input.modelId)) {
        return {
          message: 'Invalid input for Fal.ai provider',
          error: `Expected provider: fal, supported models: ${this.supportedModels.join(', ')}`,
          code: 'INVALID_INPUT',
          provider: 'fal',
          modelId: input.modelId,
        }
      }

      if (!process.env.FAL_KEY) {
        return {
          message: 'Fal API key not configured',
          error: 'FAL_KEY environment variable is not set',
          code: 'CONFIGURATION_ERROR',
          provider: 'fal',
          modelId: input.modelId,
        }
      }

      const falInput = input as FalLipSyncInput

      logger.info('🎬 Запуск Fal.ai Lip-Sync генерации', {
        telegramId: falInput.telegramId,
        modelId: falInput.modelId,
        videoUrl: falInput.videoUrl?.substring(0, 100) + '...',
        imageUrl: falInput.imageUrl?.substring(0, 100) + '...',
        audioUrl: falInput.audioUrl?.substring(0, 100) + '...',
        resolution: falInput.resolution,
      })

      // Определяем какую модель использовать и подготавливаем данные
      const { falModelEndpoint, falApiData, modelName } =
        this.prepareModelInput(falInput)

      console.log(
        '🚨 [FAL PROVIDER] CRITICAL DEBUG: Отправка запроса к Fal.ai API',
        {
          telegramId: falInput.telegramId,
          modelEndpoint: falModelEndpoint,
          modelName,
          apiData: {
            video_url: falApiData.video_url?.substring(0, 50) + '...',
            image_url: falApiData.image_url?.substring(0, 50) + '...',
            audio_url: falApiData.audio_url?.substring(0, 50) + '...',
          },
          hasFalKey: !!process.env.FAL_KEY,
        }
      )

      logger.debug('📡 Отправка запроса к Fal.ai API', {
        telegramId: falInput.telegramId,
        modelEndpoint: falModelEndpoint,
        apiData: falApiData,
      })

      // Вызываем Fal.ai API
      const result = await fal.subscribe(falModelEndpoint, {
        input: falApiData,
        logs: true,
        onQueueUpdate: update => {
          if (update.status === 'IN_PROGRESS') {
            update.logs.map(log => log.message).forEach(console.log)
          }
        },
      })

      console.log(
        '🚨 [FAL PROVIDER] CRITICAL DEBUG: Получен ответ от Fal.ai API',
        {
          telegramId: falInput.telegramId,
          modelEndpoint: falModelEndpoint,
          hasData: !!result.data,
          hasRequestId: !!result.requestId,
          dataKeys: Object.keys(result.data || {}),
        }
      )

      logger.info('✅ Получен ответ от Fal.ai API', {
        telegramId: falInput.telegramId,
        modelEndpoint: falModelEndpoint,
        hasVideo: !!result.data?.video,
        videoUrl: result.data?.video?.url?.substring(0, 100) + '...',
        requestId: result.requestId,
      })

      // Извлекаем URL видео (разные модели возвращают по-разному)
      const videoUrl = this.extractVideoUrl(result.data, falInput.modelId)

      if (!videoUrl) {
        return {
          message: 'No video generated by Fal.ai API',
          error: 'Missing video output in API response',
          code: 'NO_VIDEO_OUTPUT',
          provider: 'fal',
          modelId: input.modelId,
        }
      }

      // Сохраняем в Supabase
      const modelPrefix = this.getModelPrefix(falInput.modelId)
      const uniqueId = `${modelPrefix}_${Date.now()}_${falInput.telegramId}`
      await saveVideoUrlToSupabase({
        telegramId: falInput.telegramId,
        publicUrl: videoUrl,
        type: modelPrefix,
        botName: falInput.bot_name,
      })

      logger.info(`✅ Fal.ai ${modelName} видео успешно сгенерировано`, {
        telegramId: falInput.telegramId,
        uniqueId,
        modelName,
        videoUrl: videoUrl.substring(0, 100) + '...',
      })

      return {
        id: uniqueId,
        status: 'succeeded',
        output: videoUrl,
        modelUsed: modelName,
        costEstimate: this.calculateModelCost(
          falInput.modelId,
          falInput.durationSeconds || 10,
          falInput.resolution
        ),
        metadata: {
          resolution: falInput.resolution,
          contentType: result.data?.video?.content_type || 'video/mp4',
          provider: 'fal',
          modelId: falModelEndpoint,
        },
      }
    } catch (error: any) {
      console.log(
        '🚨 [FAL PROVIDER] CRITICAL DEBUG: Ошибка в Fal.ai провайдере',
        {
          telegramId: input.telegramId,
          error: error.message,
          errorName: error.name,
          errorCode: error.code,
          status: error.status,
          body: error.body,
          hasBody: !!error.body,
        }
      )

      logger.error('❌ Ошибка генерации Fal.ai Lip-Sync', {
        telegramId: input.telegramId,
        error: error.message,
        stack: error.stack,
        provider: 'fal',
        modelId: input.modelId,
        status: error.status,
        body: error.body,
      })

      // Специальная обработка для ошибки баланса
      if (
        error.status === 403 &&
        error.body?.detail?.includes('Exhausted balance')
      ) {
        return {
          message:
            'Fal.ai account balance exhausted. Please top up your balance.',
          error: 'Fal.ai account locked due to insufficient balance',
          code: 'BALANCE_EXHAUSTED',
          provider: 'fal',
          modelId: input.modelId,
        }
      }

      // Обработка других ошибок API
      if (error.status === 401) {
        return {
          message:
            'Fal.ai API authentication failed. Please check your API key.',
          error: 'Invalid or expired Fal.ai API key',
          code: 'AUTHENTICATION_ERROR',
          provider: 'fal',
          modelId: input.modelId,
        }
      }

      return {
        message: 'Failed to generate video with Fal.ai Lip-Sync',
        error: error.message,
        code: 'GENERATION_ERROR',
        provider: 'fal',
        modelId: input.modelId,
      }
    }
  }

  /**
   * Подготавливает входные данные для конкретной модели
   */
  private prepareModelInput(input: FalLipSyncInput): {
    falModelEndpoint: string
    falApiData: any
    modelName: string
  } {
    switch (input.modelId) {
      case 'fal-veed-fabric-1.0-fast':
        return {
          falModelEndpoint: 'veed/fabric-1.0/fast',
          falApiData: {
            image_url: input.imageUrl,
            audio_url: input.audioUrl,
            resolution: input.resolution || this.config.defaultResolution,
          },
          modelName: 'Fal.ai Veed Fabric 1.0 Fast',
        }

      case 'fal-ai/latentsync':
        return {
          falModelEndpoint: 'fal-ai/latentsync',
          falApiData: {
            video_url: input.videoUrl,
            audio_url: input.audioUrl,
            // LatentSync v1.5 параметры
            guidance_scale: input.guidanceScale || 1.0,
          },
          modelName: 'LatentSync (ByteDance)',
        }

      case 'fal-ai/tavus/hummingbird-lipsync/v0':
        return {
          falModelEndpoint: 'fal-ai/tavus/hummingbird-lipsync/v0',
          falApiData: {
            video_url: input.videoUrl,
            audio_url: input.audioUrl,
          },
          modelName: 'Hummingbird-0 (Tavus)',
        }

      default:
        throw new Error(`Unsupported model: ${input.modelId}`)
    }
  }

  /**
   * Извлекает URL видео из ответа API (разные модели возвращают по-разному)
   */
  private extractVideoUrl(data: any, modelId: string): string | null {
    // Veed Fabric возвращает data.video.url
    if (data?.video?.url) {
      return data.video.url
    }

    // LatentSync и Hummingbird могут возвращать data.video (строка)
    if (typeof data?.video === 'string') {
      return data.video
    }

    // Некоторые модели возвращают data.output.video
    if (data?.output?.video?.url) {
      return data.output.video.url
    }

    if (typeof data?.output?.video === 'string') {
      return data.output.video
    }

    // Fallback: data.output (если это строка URL)
    if (typeof data?.output === 'string' && data.output.startsWith('http')) {
      return data.output
    }

    return null
  }

  /**
   * Получает префикс для идентификатора результата
   */
  private getModelPrefix(modelId: string): string {
    switch (modelId) {
      case 'fal-veed-fabric-1.0-fast':
        return 'fal_veed_fabric'
      case 'fal-ai/latentsync':
        return 'fal_latentsync'
      case 'fal-ai/tavus/hummingbird-lipsync/v0':
        return 'fal_hummingbird'
      default:
        return 'fal_lipsync'
    }
  }

  /**
   * Рассчитывает стоимость для конкретной модели
   */
  private calculateModelCost(
    modelId: string,
    durationSeconds: number,
    resolution?: string
  ): number {
    switch (modelId) {
      case 'fal-veed-fabric-1.0-fast': {
        const baseCost = resolution === '720p' ? 0.2 : 0.1
        return baseCost * MARKUP_MULTIPLIER * durationSeconds
      }

      case 'fal-ai/latentsync': {
        // $0.20 за первые 40 сек, потом $0.005/сек
        const baseCost = 0.2
        const extraSeconds = Math.max(0, durationSeconds - 40)
        const totalCostUSD = baseCost + extraSeconds * 0.005
        return totalCostUSD * MARKUP_MULTIPLIER
      }

      case 'fal-ai/tavus/hummingbird-lipsync/v0': {
        // $2.10/мин = $0.035/сек
        return 0.035 * MARKUP_MULTIPLIER * durationSeconds
      }

      default:
        return 0.1 * durationSeconds
    }
  }

  /**
   * Проверяет статус задачи (для совместимости с интерфейсом)
   */
  async getStatus(taskId: string): Promise<any> {
    try {
      logger.info('🔍 [FAL PROVIDER] Checking task status', {
        taskId,
        provider: 'fal',
      })

      // Fal.ai API синхронный, поэтому всегда возвращаем success
      // Но добавляем проверку на валидность taskId
      if (!taskId || taskId.length < 3) {
        throw new Error('Invalid task ID')
      }

      return {
        id: taskId,
        taskId: taskId,
        status: 'completed',
        output: '', // Fal.ai синхронный, результат уже получен
        modelUsed: 'Fal.ai Veed Fabric 1.0 Fast',
        provider: 'fal',
        message: 'Fal.ai Veed Fabric is synchronous',
      }
    } catch (error: any) {
      logger.error('❌ [FAL PROVIDER] Error checking status', {
        taskId,
        error: error.message,
        provider: 'fal',
      })

      return {
        status: 'failed',
        message: 'Failed to check task status',
        error: error.message,
        code: 'STATUS_CHECK_FAILED',
      }
    }
  }

  /**
   * Рассчитывает стоимость генерации с централизованной наценкой
   * @param durationSeconds - Duration in seconds (for interface compatibility)
   * @param modelId - Model identifier
   * @returns Cost estimate
   */
  calculateCost(durationSeconds: number, modelId: string): number {
    const model = getLipSyncModelById('fal_veed_fabric_fast')
    if (!model) {
      // Fallback to default calculation
      const baseCost480p = 0.1 // $0.10 per second for 480p
      const baseCost720p = 0.2 // $0.20 per second for 720p
      const costWithMarkup = baseCost720p * 1.5 // Default to 720p
      return costWithMarkup * durationSeconds
    }
    return model.costPerSecond * durationSeconds
  }

  /**
   * Internal cost calculation for backward compatibility
   */
  private calculateCostByResolution(resolution: string): number {
    // ✅ ИСПРАВЛЕНО: Реальные цены Fal.ai Veed Fabric 1.0 Fast с наценкой
    const baseCost480p = 0.1 // $0.10 за секунду для 480p (базовая цена)
    const baseCost720p = 0.2 // $0.20 за секунду для 720p (базовая цена)

    // Применяем централизованную наценку 50% (MARKUP_MULTIPLIER = 1.5)
    const costWithMarkup =
      resolution === '720p' ? baseCost720p * 1.5 : baseCost480p * 1.5

    return costWithMarkup
  }

  /**
   * Генерирует lip-sync (для совместимости с интерфейсом)
   */
  async generateLipSync(params: any): Promise<any> {
    return this.generate(params)
  }

  /**
   * Проверяет доступность провайдера
   */
  async isAvailable(): Promise<boolean> {
    return !!process.env.FAL_KEY
  }

  /**
   * Проверяет поддержку модели
   */
  supportsModel(modelId: string): boolean {
    return this.supportedModels.includes(modelId)
  }

  /**
   * Получает конфигурацию моделей
   */
  getModelsConfig(): LipSyncModelConfig[] {
    const model = getLipSyncModelById('fal_veed_fabric_fast')
    return model ? [model] : []
  }
}

/**
 * Входные данные для всех Fal.ai Lip-Sync моделей
 */
export interface FalLipSyncInput extends UniversalLipSyncInput {
  provider: 'fal'
  modelId:
    | 'fal-veed-fabric-1.0-fast'
    | 'fal-ai/latentsync'
    | 'fal-ai/tavus/hummingbird-lipsync/v0'
  telegramId: string
  audioUrl: string
  // Для Veed Fabric (image to video)
  imageUrl?: string
  resolution?: '480p' | '720p'
  // Для LatentSync и Hummingbird (video to video)
  videoUrl?: string
  durationSeconds?: number
  // LatentSync специфичные параметры
  guidanceScale?: number
}

/**
 * @deprecated Use FalLipSyncInput instead
 */
export type FalVeedFabricInput = FalLipSyncInput
