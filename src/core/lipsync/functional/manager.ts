import { logger } from '@/utils/logger'
import {
  type ProviderConfig,
  type LipSyncResult,
  type UniversalLipSyncInput,
  type LipSyncModelConfig,
  type LipSyncProvider,
  type GenerationContext,
  type ContextualResult,
} from './types'
import { validateLipSyncInput, generateInputKey } from './validators'
import { allProviders } from './providers'
import { getDefaultModel } from './factory'

/**
 * Функциональное управление Lip-Sync моделями
 * Основано на чистых функциях без состояния
 */

// ==================== КОНФИГУРАЦИЯ ====================

export type ManagerConfig = {
  readonly defaultModelId: string
  readonly fallbackModelId?: string
  readonly retryAttempts: number
  readonly timeoutSeconds: number
  readonly enableCaching: boolean
  readonly cacheExpirationHours: number
}

const defaultConfig: ManagerConfig = {
  defaultModelId: 'kling',
  retryAttempts: 3,
  timeoutSeconds: 120,
  enableCaching: true,
  cacheExpirationHours: 24,
}

// ==================== КЭШ (ОПЦИОНАЛЬНЫЙ) ====================

type CacheEntry = {
  readonly data: LipSyncResult
  readonly timestamp: number
  readonly expirationHours: number
}

const cache = new Map<string, CacheEntry>()

/**
 * Проверяет, истек ли срок действия записи в кэше
 */
const isCacheEntryExpired = (entry: CacheEntry): boolean => {
  const now = Date.now()
  const expirationTime =
    entry.timestamp + entry.expirationHours * 60 * 60 * 1000
  return now > expirationTime
}

/**
 * Получает данные из кэша
 */
const getCachedResult = (key: string): LipSyncResult | null => {
  const entry = cache.get(key)
  if (!entry) return null

  if (isCacheEntryExpired(entry)) {
    cache.delete(key)
    return null
  }

  return entry.data
}

/**
 * Сохраняет результат в кэш
 */
const setCachedResult = (
  key: string,
  result: LipSyncResult,
  expirationHours = 24
): void => {
  cache.set(key, {
    data: result,
    timestamp: Date.now(),
    expirationHours,
  })
}

/**
 * Очищает кэш
 */
export const clearCache = (): void => {
  cache.clear()
  logger.info('🧹 Кэш lip-sync очищен')
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================

/**
 * Получает все доступные модели
 */
export const getAvailableModels = (
  providers: readonly ProviderConfig[] = allProviders
): readonly LipSyncModelConfig[] => {
  return providers
    .flatMap(provider => provider.modelsConfig)
    .filter(model => model.isAvailable)
}

/**
 * Находит модель по ID
 */
export const getModelById = (
  modelId: string,
  providers: readonly ProviderConfig[] = allProviders
): LipSyncModelConfig | undefined => {
  const models = getAvailableModels(providers)
  return models.find(model => model.id === modelId)
}

/**
 * Получает провайдер для модели
 */
export const getProviderForModel = (
  modelId: string,
  providers: readonly ProviderConfig[] = allProviders
): ProviderConfig | undefined => {
  return providers.find(provider => provider.supportedModels.includes(modelId))
}

/**
 * Рассчитывает стоимость генерации
 */
export const calculateCost = (
  durationSeconds: number,
  modelId?: string,
  config: ManagerConfig = defaultConfig,
  providers: readonly ProviderConfig[] = allProviders
): number => {
  const targetModelId = modelId || config.defaultModelId
  const provider = getProviderForModel(targetModelId, providers)

  if (!provider) {
    throw new Error(`No provider found for model '${targetModelId}'`)
  }

  return provider.calculateCostFn(durationSeconds, targetModelId)
}

/**
 * Создает контекст генерации
 */
const createGenerationContext = (
  input: UniversalLipSyncInput,
  modelConfig: LipSyncModelConfig,
  provider: ProviderConfig,
  config: ManagerConfig
): GenerationContext => ({
  input,
  modelConfig,
  provider,
  startTime: Date.now(),
  retryAttempts: config.retryAttempts,
  enableCaching: config.enableCaching,
})

/**
 * Выполняет генерацию с повторными попытками
 */
const executeWithRetry = async (
  context: GenerationContext
): Promise<LipSyncResult> => {
  let lastError: any

  for (let attempt = 1; attempt <= context.retryAttempts; attempt++) {
    try {
      logger.info(`🔄 Попытка ${attempt}/${context.retryAttempts}`, {
        modelId: context.modelConfig.id,
        provider: context.provider.providerId,
        telegramId: context.input.telegramId,
      })

      const result = await context.provider.generateFn(context.input)

      if (result.success) {
        logger.info('✅ Генерация успешна', {
          modelId: context.modelConfig.id,
          provider: context.provider.providerId,
          resultId: result.data?.id,
          processingTime: Date.now() - context.startTime,
        })
        return result
      }

      // Результат неуспешный, но не ошибка сети - не повторяем
      return result
    } catch (error) {
      lastError = error

      if (attempt < context.retryAttempts) {
        logger.warn(`⚠️ Попытка ${attempt} неудачна, повторяем`, {
          error: error instanceof Error ? error.message : String(error),
          modelId: context.modelConfig.id,
        })

        // Небольшая задержка перед повтором
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  // Все попытки неудачны
  throw lastError
}

/**
 * Основная функция генерации
 */
export const generateLipSync = async (
  input: unknown,
  modelId?: string,
  config: ManagerConfig = defaultConfig,
  providers: readonly ProviderConfig[] = allProviders
): Promise<LipSyncResult> => {
  const startTime = Date.now()

  try {
    // Валидация входных данных
    const validatedInput = validateLipSyncInput(input)

    // Определяем модель
    const targetModelId = modelId || config.defaultModelId
    const modelConfig = getModelById(targetModelId, providers)

    if (!modelConfig) {
      return {
        success: false,
        error: {
          message: `Model '${targetModelId}' not found`,
          code: 'MODEL_NOT_FOUND',
        },
      }
    }

    // Получаем провайдер
    const provider = getProviderForModel(targetModelId, providers)

    if (!provider) {
      return {
        success: false,
        error: {
          message: `No provider found for model '${targetModelId}'`,
          code: 'PROVIDER_NOT_FOUND',
        },
      }
    }

    logger.info('🎬 Начинаем функциональную генерацию lip-sync', {
      modelId: targetModelId,
      provider: modelConfig.provider,
      telegramId: validatedInput.telegramId,
    })

    // Проверяем кэш
    if (config.enableCaching) {
      const cacheKey = generateInputKey(validatedInput)
      const cachedResult = getCachedResult(cacheKey)

      if (cachedResult) {
        logger.info('💾 Найден результат в кэше', {
          modelId: targetModelId,
          cacheKey,
        })

        return cachedResult
      }
    }

    // Проверяем доступность провайдера
    const isAvailable = await provider.isAvailableFn()
    if (!isAvailable) {
      return {
        success: false,
        error: {
          message: `Provider '${provider.providerId}' is not available`,
          code: 'PROVIDER_UNAVAILABLE',
          provider: provider.providerId,
        },
      }
    }

    // Создаем контекст и выполняем генерацию
    const context = createGenerationContext(
      validatedInput,
      modelConfig,
      provider,
      config
    )
    const result = await executeWithRetry(context)

    // Сохраняем в кэш если включен и результат успешный
    if (config.enableCaching && result.success) {
      const cacheKey = generateInputKey(validatedInput)
      setCachedResult(cacheKey, result, config.cacheExpirationHours)
    }

    return result
  } catch (error) {
    const processingTime = Date.now() - startTime

    logger.error('❌ Ошибка функциональной генерации lip-sync', {
      error: error instanceof Error ? error.message : String(error),
      processingTime,
    })

    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error instanceof Error ? error.stack : String(error),
        code: 'GENERATION_ERROR',
      },
    }
  }
}

/**
 * Получает статус генерации
 */
export const getLipSyncStatus = async (
  predictionId: string,
  modelId?: string,
  config: ManagerConfig = defaultConfig,
  providers: readonly ProviderConfig[] = allProviders
): Promise<LipSyncResult> => {
  try {
    const targetModelId = modelId || config.defaultModelId
    const provider = getProviderForModel(targetModelId, providers)

    if (!provider) {
      return {
        success: false,
        error: {
          message: `No provider found for model '${targetModelId}'`,
          code: 'PROVIDER_NOT_FOUND',
        },
      }
    }

    return await provider.getStatusFn(predictionId)
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error instanceof Error ? error.stack : String(error),
        code: 'STATUS_ERROR',
      },
    }
  }
}

/**
 * Проверяет здоровье всех провайдеров
 */
export const checkProvidersHealth = async (
  providers: readonly ProviderConfig[] = allProviders
): Promise<Record<LipSyncProvider, boolean>> => {
  const health: Record<string, boolean> = {}

  const healthChecks = providers.map(async provider => {
    try {
      const isAvailable = await provider.isAvailableFn()
      health[provider.providerId] = isAvailable

      if (!isAvailable) {
        logger.error(`❌ Провайдер ${provider.providerId} недоступен`)
      }
    } catch (error) {
      health[provider.providerId] = false
      logger.error(`❌ Провайдер ${provider.providerId} недоступен`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  await Promise.all(healthChecks)

  return health as Record<LipSyncProvider, boolean>
}

/**
 * Отменяет генерацию (если поддерживается)
 */
export const cancelGeneration = async (
  predictionId: string,
  modelId?: string,
  config: ManagerConfig = defaultConfig,
  providers: readonly ProviderConfig[] = allProviders
): Promise<boolean> => {
  try {
    const targetModelId = modelId || config.defaultModelId
    const provider = getProviderForModel(targetModelId, providers)

    if (!provider?.cancelFn) {
      logger.warn('⚠️ Отмена не поддерживается провайдером', {
        providerId: provider?.providerId,
        modelId: targetModelId,
      })
      return false
    }

    return await provider.cancelFn(predictionId)
  } catch (error) {
    logger.error('❌ Ошибка отмены генерации', {
      predictionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

// ==================== УТИЛИТЫ ====================

/**
 * Создает конфигурацию с переопределениями
 */
export const createConfig = (
  overrides: Partial<ManagerConfig> = {}
): ManagerConfig => ({
  ...defaultConfig,
  ...overrides,
})

/**
 * Получает статистику кэша
 */
export const getCacheStats = () => ({
  size: cache.size,
  entries: Array.from(cache.entries()).map(([key, entry]) => ({
    key,
    timestamp: entry.timestamp,
    expirationHours: entry.expirationHours,
    isExpired: isCacheEntryExpired(entry),
  })),
})

/**
 * Очищает просроченные записи из кэша
 */
export const cleanExpiredCache = (): number => {
  let cleanedCount = 0

  for (const [key, entry] of cache.entries()) {
    if (isCacheEntryExpired(entry)) {
      cache.delete(key)
      cleanedCount++
    }
  }

  if (cleanedCount > 0) {
    logger.info(`🧹 Очищено ${cleanedCount} просроченных записей кэша`)
  }

  return cleanedCount
}
