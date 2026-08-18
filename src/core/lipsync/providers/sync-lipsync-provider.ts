import axios from 'axios'
import { logger } from '@/utils/logger'
import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import type { ILipSyncProvider } from '../interfaces/lipsync-provider.interface'
import type {
  UniversalLipSyncInput,
  LipSyncOutput,
  LipSyncError,
  LipSyncModelConfig,
  SyncLipSyncInput,
} from '../schemas/lipsync-schemas'

/**
 * Провайдер для Sync LipSync-2 модели
 * Реализует стандартный интерфейс ILipSyncProvider
 */
export class SyncLipSyncProvider implements ILipSyncProvider {
  readonly providerId = 'sync' as const
  readonly providerName = 'Sync LipSync-2'
  readonly supportedModels = ['sync_v2']

  private config: {
    baseUrl: string
    timeout: number
    retryAttempts: number
  }

  constructor(config?: Partial<typeof SyncLipSyncProvider.prototype.config>) {
    if (!process.env.SYNC_API_KEY) {
      logger.warn(
        'SYNC_API_KEY не установлен. Sync LipSync-2 будет недоступен.'
      )
    }

    this.config = {
      baseUrl: 'https://api.sync.so',
      timeout: 600000, // 10 минут
      retryAttempts: 2,
      ...config,
    }

    logger.info('⭐ Sync LipSync Provider инициализирован', {
      supportedModels: this.supportedModels,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
    })
  }

  /**
   * Генерирует lip-sync видео через Sync API
   */
  async generate(
    input: UniversalLipSyncInput
  ): Promise<LipSyncOutput | LipSyncError> {
    try {
      // Проверяем, что это входные данные для Sync
      if (input.provider !== 'sync' || input.modelId !== 'sync/lipsync-2') {
        return {
          message: 'Invalid input for Sync LipSync provider',
          error: `Expected provider: sync, modelId: sync/lipsync-2`,
          code: 'INVALID_INPUT',
          provider: 'sync',
          modelId: input.modelId,
        }
      }

      if (!process.env.SYNC_API_KEY) {
        return {
          message: 'Sync API key not configured',
          error: 'SYNC_API_KEY environment variable is not set',
          code: 'CONFIGURATION_ERROR',
          provider: 'sync',
          modelId: input.modelId,
        }
      }

      const syncInput = input as SyncLipSyncInput

      logger.info('🎬 Запуск Sync LipSync-2 генерации', {
        telegramId: syncInput.telegramId,
        modelId: syncInput.modelId,
        hasParameters: !!syncInput.parameters,
      })

      // Подготавливаем данные для Sync API
      const syncApiData = {
        model: 'lipsync-2',
        input: {
          face: syncInput.videoUrl,
          audio: syncInput.audioUrl,
          ...syncInput.parameters,
        },
      }

      logger.debug('📡 Отправка запроса к Sync API', {
        telegramId: syncInput.telegramId,
        apiData: {
          model: syncApiData.model,
          inputKeys: Object.keys(syncApiData.input),
        },
      })

      // Отправляем запрос к Sync API
      const response = await axios.post(
        `${this.config.baseUrl}/predictions`,
        syncApiData,
        {
          headers: {
            Authorization: `Bearer ${process.env.SYNC_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: this.config.timeout,
        }
      )

      const prediction = response.data

      logger.info('✅ Получен ответ от Sync API', {
        telegramId: syncInput.telegramId,
        predictionId: prediction.id,
        status: prediction.status,
      })

      // Если у нас сразу есть результат (синхронный режим)
      if (
        prediction &&
        prediction.output &&
        typeof prediction.output === 'string'
      ) {
        const resultUrl = prediction.output

        logger.info('✅ Получен готовый результат от Sync LipSync-2', {
          resultUrl: resultUrl.substring(0, 100) + '...',
        })

        // Сохраняем в Supabase
        const uniqueId = `sync_lipsync2_${Date.now()}_${syncInput.telegramId}`
        await saveVideoUrlToSupabase({
          telegramId: syncInput.telegramId,
          publicUrl: resultUrl,
          type: 'sync_lipsync2',
          botName: syncInput.bot_name,
        })

        return {
          id: uniqueId,
          status: 'succeeded',
          output: resultUrl,
          modelUsed: this.providerName,
          costEstimate: this.calculateCost(10, 'sync_v2'), // Предполагаем 10 секунд
        }
      }

      // Асинхронный режим - возвращаем информацию о задаче
      return {
        id: prediction.id,
        status: prediction.status || 'starting',
        modelUsed: this.providerName,
        costEstimate: this.calculateCost(10, 'sync_v2'),
        metadata: {
          urls: prediction.urls,
        },
      }
    } catch (error: any) {
      logger.error('❌ Ошибка Sync LipSync-2 генерации', {
        telegramId: (input as SyncLipSyncInput).telegramId,
        error: error.message,
        stack: error.stack,
      })

      return {
        message: 'Ошибка при генерации Sync LipSync-2',
        error: error.message || 'Unknown error',
        code: 'SYNC_ERROR',
        provider: 'sync',
        modelId: input.modelId,
      }
    }
  }

  /**
   * Получает статус обработки
   */
  async getStatus(predictionId: string): Promise<LipSyncOutput | LipSyncError> {
    try {
      if (!process.env.SYNC_API_KEY) {
        return {
          message: 'Sync API key not configured',
          error: 'SYNC_API_KEY environment variable is not set',
          code: 'CONFIGURATION_ERROR',
          provider: 'sync',
        }
      }

      logger.info('🔍 Проверка статуса Sync LipSync-2', {
        predictionId,
      })

      const response = await axios.get(
        `${this.config.baseUrl}/predictions/${predictionId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.SYNC_API_KEY}`,
          },
          timeout: 30000,
        }
      )

      const prediction = response.data

      logger.info('✅ Получен статус Sync LipSync-2', {
        predictionId,
        status: prediction.status,
        hasOutput: !!prediction.output,
      })

      return {
        id: prediction.id,
        status: prediction.status,
        output: prediction.output,
        error: prediction.error,
        modelUsed: this.providerName,
        costEstimate: this.calculateCost(10, 'sync_v2'),
      }
    } catch (error: any) {
      logger.error('❌ Ошибка получения статуса Sync LipSync-2', {
        predictionId,
        error: error.message,
      })

      return {
        message: 'Ошибка при получении статуса Sync LipSync-2',
        error: error.message || 'Unknown error',
        code: 'STATUS_ERROR',
        provider: 'sync',
      }
    }
  }

  /**
   * Проверяет доступность Sync API
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!process.env.SYNC_API_KEY) {
        return false
      }

      // Простая проверка доступности API
      const response = await axios.get(`${this.config.baseUrl}/health`, {
        headers: {
          Authorization: `Bearer ${process.env.SYNC_API_KEY}`,
        },
        timeout: 10000,
      })

      return response.status === 200
    } catch (error) {
      logger.warn('⚠️ Sync API недоступен', {
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
        id: 'sync_v2',
        name: '⭐ Sync LipSync-2',
        description:
          'Премиум модель с сохранением уникального стиля говорящего. Лучшее качество для профессионалов.',
        provider: 'sync',
        modelId: 'sync/lipsync-2',
        costPerSecond: 0.05, // $0.05 per second
        maxDuration: 60,
        quality: 'premium',
        isAvailable: true,
        features: [
          'Сохранение уникального стиля речи',
          'Премиум качество',
          'Улучшенная работа с зубами',
          'Устойчивость к поворотам головы',
          'Работа с бородой и усами',
        ],
        supportedFormats: {
          video: ['mp4', 'avi', 'mov', 'webm'],
          audio: ['mp3', 'wav', 'aac', 'm4a'],
        },
        limitations: {
          maxFileSize: 100 * 1024 * 1024, // 100MB
          maxResolution: '4096x4096',
          minDuration: 1,
          maxDuration: 60,
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

    return 0.05 * durationSeconds // $0.05 per second
  }

  /**
   * Отмена не поддерживается Sync API
   */
  async cancel(predictionId: string): Promise<boolean> {
    logger.warn('⚠️ Отмена не поддерживается Sync API', { predictionId })
    return false
  }

  /**
   * Генерирует lip-sync (для совместимости с интерфейсом)
   */
  async generateLipSync(params: any): Promise<any> {
    return this.generate(params)
  }

  /**
   * ✅ Получает статус обработки (для fallback polling) - дублирующий метод
   * Sync Labs API не поддерживает проверку статуса, так как использует синхронный режим
   */
  async getStatusFallback(predictionId: string): Promise<any> {
    logger.warn('⚠️ [SYNC PROVIDER] getStatus не поддерживается - Sync Labs работает синхронно', {
      predictionId,
    })

    return {
      message: 'Status check not supported for Sync Labs',
      error: 'Sync Labs uses synchronous API, status checking not available',
      code: 'NOT_SUPPORTED',
      provider: 'sync',
      modelId: 'sync-lipsync',
    }
  }
}
