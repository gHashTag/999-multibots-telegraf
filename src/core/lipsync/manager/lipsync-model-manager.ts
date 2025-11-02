import { logger } from '@/utils/logger'
import type {
  ILipSyncProvider,
  ProviderOperationResult,
  ICacheManager,
  ILipSyncMonitor,
} from '../interfaces/lipsync-provider.interface'
import type {
  UniversalLipSyncInput,
  LipSyncOutput,
  LipSyncError,
  LipSyncModelConfig,
  LipSyncModelManagerConfig,
  LipSyncProvider,
} from '../schemas/lipsync-schemas'
import {
  validateLipSyncInput,
  LipSyncValidationError,
  LipSyncModelManagerConfigSchema,
} from '../schemas/lipsync-schemas'

/**
 * Централизованный менеджер для управления всеми lip-sync моделями
 * Обеспечивает единую точку входа, валидацию, кэширование и мониторинг
 */
export class LipSyncModelManager {
  private providers = new Map<LipSyncProvider, ILipSyncProvider>()
  private config: LipSyncModelManagerConfig
  private cacheManager?: ICacheManager
  private monitor?: ILipSyncMonitor

  constructor(
    config: Partial<LipSyncModelManagerConfig> = {},
    cacheManager?: ICacheManager,
    monitor?: ILipSyncMonitor
  ) {
    this.config = LipSyncModelManagerConfigSchema.parse(
      config
    ) as LipSyncModelManagerConfig
    this.cacheManager = cacheManager
    this.monitor = monitor

    logger.info('🎭 LipSync Model Manager инициализирован', {
      defaultModel: this.config.defaultModel,
      enableCaching: this.config.enableCaching,
      retryAttempts: this.config.retryAttempts,
    })
  }

  /**
   * Регистрирует новый провайдер
   */
  registerProvider(provider: ILipSyncProvider): void {
    this.providers.set(provider.providerId as LipSyncProvider, provider)

    logger.info('📝 Зарегистрирован новый провайдер', {
      providerId: provider.providerId,
      providerName: provider.providerName,
      supportedModels: provider.supportedModels,
    })
  }

  /**
   * Получает список всех доступных моделей
   */
  getAvailableModels(): LipSyncModelConfig[] {
    const models: LipSyncModelConfig[] = []

    for (const provider of this.providers.values()) {
      models.push(...provider.getModelsConfig())
    }

    return models.filter(model => model.isAvailable)
  }

  /**
   * Находит модель по ID
   */
  getModelById(modelId: string): LipSyncModelConfig | undefined {
    const allModels = this.getAvailableModels()
    return allModels.find(model => model.id === modelId)
  }

  /**
   * Получает провайдер для указанной модели
   */
  private getProviderForModel(modelId: string): ILipSyncProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.supportsModel(modelId)) {
        return provider
      }
    }
    return undefined
  }

  /**
   * Получает модель по умолчанию
   */
  getDefaultModel(): LipSyncModelConfig {
    const defaultModel = this.getModelById(this.config.defaultModel)

    if (!defaultModel) {
      throw new Error(`Default model '${this.config.defaultModel}' not found`)
    }

    return defaultModel
  }

  /**
   * Генерирует lip-sync видео с автоматическим выбором провайдера
   */
  async generate(
    input: unknown,
    modelId?: string
  ): Promise<ProviderOperationResult<LipSyncOutput>> {
    const startTime = Date.now()

    try {
      // Валидация входных данных
      const validatedInput = validateLipSyncInput(input)

      // Определяем модель
      const targetModelId = modelId || this.config.defaultModel
      const model = this.getModelById(targetModelId)

      if (!model) {
        throw new Error(`Model '${targetModelId}' not found`)
      }

      // Логируем начало операции
      this.monitor?.logRequest(validatedInput)

      logger.info('🎬 Начинаем генерацию lip-sync', {
        modelId: targetModelId,
        provider: model.provider,
        telegramId: (validatedInput as any).telegramId,
      })

      // Проверяем кэш (если включен)
      if (this.config.enableCaching && this.cacheManager) {
        const cacheKey = this.cacheManager.generateKey(validatedInput)
        const cachedResult = await this.cacheManager.get(cacheKey)

        if (cachedResult) {
          logger.info('💾 Найден результат в кэше', {
            modelId: targetModelId,
            cacheKey,
          })

          return {
            success: true,
            data: cachedResult,
            metadata: {
              provider: model.provider,
              modelId: targetModelId,
              timestamp: new Date(),
              processingTime: Date.now() - startTime,
            },
          }
        }
      }

      // Получаем провайдер
      const provider = this.getProviderForModel(targetModelId)

      if (!provider) {
        throw new Error(`No provider found for model '${targetModelId}'`)
      }

      // Проверяем доступность провайдера
      const isAvailable = await provider.isAvailable()
      if (!isAvailable) {
        throw new Error(`Provider '${provider.providerId}' is not available`)
      }

      // Выполняем генерацию с повторными попытками
      let lastError: any

      for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
        try {
          logger.info(`🔄 Попытка ${attempt}/${this.config.retryAttempts}`, {
            modelId: targetModelId,
            provider: provider.providerId,
          })

          const result = await provider.generate(validatedInput)

          // Проверяем, является ли результат ошибкой
          if ('message' in result && 'error' in result) {
            throw new Error((result as LipSyncError).message)
          }

          const output = result as LipSyncOutput

          // Сохраняем в кэш (если включен)
          if (this.config.enableCaching && this.cacheManager) {
            const cacheKey = this.cacheManager.generateKey(validatedInput)
            await this.cacheManager.set(
              cacheKey,
              output,
              this.config.cacheExpirationHours
            )
          }

          // Логируем успех
          this.monitor?.logResponse(output)

          logger.info('✅ Генерация lip-sync завершена успешно', {
            modelId: targetModelId,
            provider: provider.providerId,
            resultId: output.id,
            processingTime: Date.now() - startTime,
          })

          return {
            success: true,
            data: output,
            metadata: {
              provider: model.provider,
              modelId: targetModelId,
              timestamp: new Date(),
              processingTime: Date.now() - startTime,
            },
          }
        } catch (error) {
          lastError = error

          if (attempt < this.config.retryAttempts) {
            logger.warn(`⚠️ Попытка ${attempt} неудачна, повторяем`, {
              error: error instanceof Error ? error.message : String(error),
              modelId: targetModelId,
            })

            // Небольшая задержка перед повтором
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          }
        }
      }

      // Все попытки неудачны
      throw lastError
    } catch (error) {
      const processingTime = Date.now() - startTime

      let lipSyncError: LipSyncError

      if (error instanceof LipSyncValidationError) {
        lipSyncError = {
          message: 'Validation failed',
          error: error.message,
          code: 'VALIDATION_ERROR',
        }
      } else {
        lipSyncError = {
          message: error instanceof Error ? error.message : 'Unknown error',
          error: error instanceof Error ? error.stack : String(error),
          code: 'GENERATION_ERROR',
        }
      }

      // Логируем ошибку
      this.monitor?.logError(
        error instanceof Error ? error : new Error(String(error))
      )

      logger.error('❌ Ошибка генерации lip-sync', {
        error: lipSyncError,
        processingTime,
      })

      return {
        success: false,
        error: lipSyncError,
        metadata: {
          provider: modelId ? this.getModelById(modelId)?.provider : undefined,
          modelId: modelId || this.config.defaultModel,
          timestamp: new Date(),
          processingTime,
        },
      }
    }
  }

  /**
   * Получает статус генерации
   */
  async getStatus(
    predictionId: string,
    modelId?: string
  ): Promise<ProviderOperationResult<LipSyncOutput>> {
    try {
      const targetModelId = modelId || this.config.defaultModel
      const provider = this.getProviderForModel(targetModelId)

      if (!provider) {
        throw new Error(`No provider found for model '${targetModelId}'`)
      }

      const result = await provider.getStatus(predictionId)

      if ('message' in result && 'error' in result) {
        throw new Error((result as LipSyncError).message)
      }

      return {
        success: true,
        data: result as LipSyncOutput,
        metadata: {
          provider: provider.providerId,
          modelId: targetModelId,
          timestamp: new Date(),
        },
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          error: error instanceof Error ? error.stack : String(error),
          code: 'STATUS_ERROR',
        },
        metadata: {
          provider: modelId ? this.getModelById(modelId)?.provider : undefined,
          modelId: modelId || this.config.defaultModel,
          timestamp: new Date(),
        },
      }
    }
  }

  /**
   * Рассчитывает стоимость генерации
   */
  calculateCost(durationSeconds: number, modelId?: string): number {
    const targetModelId = modelId || this.config.defaultModel
    const provider = this.getProviderForModel(targetModelId)

    if (!provider) {
      throw new Error(`No provider found for model '${targetModelId}'`)
    }

    return provider.calculateCost(durationSeconds, targetModelId)
  }

  /**
   * Проверяет доступность всех провайдеров
   */
  async checkProvidersHealth(): Promise<Record<LipSyncProvider, boolean>> {
    const health: Record<string, boolean> = {}

    for (const [providerId, provider] of this.providers) {
      try {
        health[providerId] = await provider.isAvailable()
      } catch (error) {
        health[providerId] = false
        logger.error(`❌ Провайдер ${providerId} недоступен`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return health as Record<LipSyncProvider, boolean>
  }

  /**
   * Получает статистику использования
   */
  async getUsageStats(provider?: LipSyncProvider) {
    if (!this.monitor) {
      throw new Error('Monitor not configured')
    }

    return this.monitor.getUsageStats(provider)
  }

  /**
   * Очищает кэш
   */
  async clearCache(): Promise<void> {
    if (this.cacheManager) {
      await this.cacheManager.clear()
      logger.info('🧹 Кэш lip-sync очищен')
    }
  }
}
