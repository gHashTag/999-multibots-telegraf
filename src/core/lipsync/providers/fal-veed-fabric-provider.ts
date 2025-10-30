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

/**
 * Провайдер для Fal.ai Veed Fabric 1.0 Fast модели
 * Более стабильная альтернатива для lip-sync генерации
 */
export class FalVeedFabricProvider implements ILipSyncProvider {
  readonly providerId = 'fal' as const
  readonly providerName = 'Fal.ai Veed Fabric 1.0 Fast'
  readonly supportedModels = ['fal-veed-fabric-1.0-fast']

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
   */
  async generate(
    input: UniversalLipSyncInput
  ): Promise<LipSyncOutput | LipSyncError> {
    try {
      // Проверяем, что это входные данные для Fal
      if (
        input.provider !== 'fal' ||
        input.modelId !== 'fal-veed-fabric-1.0-fast'
      ) {
        return {
          message: 'Invalid input for Fal Veed Fabric provider',
          error: `Expected provider: fal, modelId: fal-veed-fabric-1.0-fast`,
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

      const falInput = input as FalVeedFabricInput

      logger.info('🎬 Запуск Fal.ai Veed Fabric 1.0 Fast генерации', {
        telegramId: falInput.telegramId,
        modelId: falInput.modelId,
        imageUrl: falInput.imageUrl?.substring(0, 100) + '...',
        audioUrl: falInput.audioUrl?.substring(0, 100) + '...',
        resolution: falInput.resolution,
      })

      // Подготавливаем данные для Fal.ai API
      const falApiData = {
        image_url: falInput.imageUrl,
        audio_url: falInput.audioUrl,
        resolution: falInput.resolution || this.config.defaultResolution,
      }

      console.log(
        '🚨 [FAL PROVIDER] CRITICAL DEBUG: Отправка запроса к Fal.ai API',
        {
          telegramId: falInput.telegramId,
          apiData: {
            image_url: falApiData.image_url?.substring(0, 50) + '...',
            audio_url: falApiData.audio_url?.substring(0, 50) + '...',
            resolution: falApiData.resolution,
          },
          baseUrl: this.config.baseUrl,
          timeout: this.config.timeout,
          hasFalKey: !!process.env.FAL_KEY,
        }
      )

      logger.debug('📡 Отправка запроса к Fal.ai API', {
        telegramId: falInput.telegramId,
        apiData: {
          image_url: falApiData.image_url?.substring(0, 50) + '...',
          audio_url: falApiData.audio_url?.substring(0, 50) + '...',
          resolution: falApiData.resolution,
        },
      })

      console.log('🚨 [FAL PROVIDER] CRITICAL DEBUG: Вызываем fal.subscribe', {
        telegramId: falInput.telegramId,
        modelId: 'veed/fabric-1.0/fast',
        inputData: falApiData,
      })

      // ✅ ИСПРАВЛЕНИЕ: Используем @fal-ai/client вместо axios
      const result = await fal.subscribe('veed/fabric-1.0/fast', {
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
          hasData: !!result.data,
          hasRequestId: !!result.requestId,
          dataKeys: Object.keys(result.data || {}),
        }
      )

      logger.info('✅ Получен ответ от Fal.ai API', {
        telegramId: falInput.telegramId,
        hasVideo: !!result.data?.video,
        videoUrl: result.data?.video?.url?.substring(0, 100) + '...',
        requestId: result.requestId,
      })

      // Проверяем результат
      if (!result.data?.video || !result.data.video.url) {
        return {
          message: 'No video generated by Fal.ai API',
          error: 'Missing video output in API response',
          code: 'NO_VIDEO_OUTPUT',
          provider: 'fal',
          modelId: input.modelId,
        }
      }

      const videoUrl = result.data.video.url

      // Сохраняем в Supabase
      const uniqueId = `fal_veed_fabric_${Date.now()}_${falInput.telegramId}`
      await saveVideoUrlToSupabase(
        falInput.telegramId,
        uniqueId,
        videoUrl,
        'fal_veed_fabric'
      )

      logger.info('✅ Fal.ai Veed Fabric видео успешно сгенерировано', {
        telegramId: falInput.telegramId,
        uniqueId,
        videoUrl: videoUrl.substring(0, 100) + '...',
        resolution: falApiData.resolution,
      })

      // ✅ ИСПРАВЛЕНИЕ: Возвращаем результат в формате, ожидаемом асинхронным менеджером
      return {
        id: uniqueId,
        status: 'succeeded',
        output: videoUrl,
        modelUsed: 'Fal.ai Veed Fabric 1.0 Fast',
        costEstimate: this.calculateCost(60, input.modelId),
        metadata: {
          resolution: falApiData.resolution,
          contentType: result.data?.video?.content_type || 'video/mp4',
          provider: 'fal',
          modelId: 'veed/fabric-1.0/fast',
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

      logger.error('❌ Ошибка генерации Fal.ai Veed Fabric', {
        telegramId: input.telegramId,
        error: error.message,
        stack: error.stack,
        provider: 'fal',
        modelId: input.modelId,
        status: error.status,
        body: error.body,
      })

      // Специальная обработка для ошибки баланса
      // @fal-ai/client возвращает error.body.detail, а не error.response.data.detail
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
        message: 'Failed to generate video with Fal.ai Veed Fabric',
        error: error.message,
        code: 'GENERATION_ERROR',
        provider: 'fal',
        modelId: input.modelId,
      }
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
   */
  calculateCost(durationSeconds: number, modelId: string): number {
    // ✅ ИСПРАВЛЕНО: Реальные цены Fal.ai Veed Fabric 1.0 Fast с наценкой
    const baseCost480p = 0.1 // $0.10 за секунду для 480p (базовая цена)
    const baseCost720p = 0.2 // $0.20 за секунду для 720p (базовая цена)

    // Применяем централизованную наценку 50% (MARKUP_MULTIPLIER = 1.5)
    const costWithMarkup =
      this.config.defaultResolution === '720p' ? baseCost720p * 1.5 : baseCost480p * 1.5

    return costWithMarkup * durationSeconds
  }

  getModelsConfig(): LipSyncModelConfig[] {
    return this.supportedModels.map(modelId => ({
      id: modelId,
      provider: this.providerId,
      isAvailable: true, // Fal.ai обычно доступен
      title: 'Veed Fabric 1.0 Fast',
      description: 'Быстрая и стабильная модель для lip-sync от Fal.ai',
      maxDuration: 60,
    }))
  }

  supportsModel(modelId: string): boolean {
    return this.supportedModels.includes(modelId)
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.FAL_KEY
  }

  /**
   * Генерирует lip-sync (для совместимости с интерфейсом)
   */
  async generateLipSync(params: any): Promise<any> {
    return this.generate(params)
  }
}

/**
 * Входные данные для Fal.ai Veed Fabric
 */
export interface FalVeedFabricInput extends UniversalLipSyncInput {
  provider: 'fal'
  modelId: 'fal-veed-fabric-1.0-fast'
  imageUrl: string
  audioUrl: string
  resolution?: '480p' | '720p'
  telegramId: string
}
