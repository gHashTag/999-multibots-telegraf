import { logger } from '@/utils/logger'
import {
  type ProviderConfig,
  type LipSyncProvider,
  type LipSyncModelConfig,
} from './types'
import {
  replicateProviderConfig,
  syncProviderConfig,
  allProviders,
} from './providers'

/**
 * Функциональная "фабрика" провайдеров
 * На самом деле набор утилит для работы с провайдерами
 */

// ==================== ТИПЫ ====================

type ProviderFilter = (provider: ProviderConfig) => boolean
type ModelFilter = (model: LipSyncModelConfig) => boolean

// ==================== ФИЛЬТРЫ ====================

/**
 * Фильтр провайдеров по типу
 */
export const filterProvidersByType =
  (providerType: LipSyncProvider): ProviderFilter =>
  provider =>
    provider.providerId === providerType

/**
 * Фильтр провайдеров по доступности моделей
 */
export const filterProvidersByAvailability = (): ProviderFilter => provider =>
  provider.modelsConfig.some(model => model.isAvailable)

/**
 * Фильтр моделей по качеству
 */
export const filterModelsByQuality =
  (quality: 'standard' | 'high' | 'premium'): ModelFilter =>
  model =>
    model.quality === quality

/**
 * Фильтр моделей по стоимости
 */
export const filterModelsByCost =
  (maxCostPerSecond: number): ModelFilter =>
  model =>
    model.costPerSecond <= maxCostPerSecond

/**
 * Фильтр моделей по провайдеру
 */
export const filterModelsByProvider =
  (providerType: LipSyncProvider): ModelFilter =>
  model =>
    model.provider === providerType

// ==================== СЕЛЕКТОРЫ ====================

/**
 * Получает провайдер по типу
 */
export const getProviderByType = (
  providerType: LipSyncProvider,
  providers: readonly ProviderConfig[] = allProviders
): ProviderConfig | undefined => {
  return providers.find(filterProvidersByType(providerType))
}

/**
 * Получает все поддерживаемые типы провайдеров
 */
export const getSupportedProviderTypes = (
  providers: readonly ProviderConfig[] = allProviders
): readonly LipSyncProvider[] => {
  return providers.map(provider => provider.providerId)
}

/**
 * Получает все модели с применением фильтров
 */
export const getModelsWithFilters = (
  modelFilters: ModelFilter[] = [],
  providers: readonly ProviderConfig[] = allProviders
): readonly LipSyncModelConfig[] => {
  const allModels = providers.flatMap(provider => provider.modelsConfig)

  return modelFilters.reduce(
    (models, filter) => models.filter(filter),
    allModels
  )
}

/**
 * Получает модель по умолчанию
 */
export const getDefaultModel = (
  providers: readonly ProviderConfig[] = allProviders
): LipSyncModelConfig => {
  const models = getModelsWithFilters([], providers)
  const klingModel = models.find(m => m.id === 'kling')

  if (klingModel) return klingModel

  // Если Kling не найден, возвращаем первую доступную модель
  const availableModel = models.find(m => m.isAvailable)
  if (availableModel) return availableModel

  throw new Error('No available models found')
}

/**
 * Получает провайдеры с применением фильтров
 */
export const getProvidersWithFilters = (
  providerFilters: ProviderFilter[] = [],
  providers: readonly ProviderConfig[] = allProviders
): readonly ProviderConfig[] => {
  return providerFilters.reduce(
    (filteredProviders, filter) => filteredProviders.filter(filter),
    providers
  )
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

/**
 * Инициализирует провайдеры по умолчанию
 */
export const initializeDefaultProviders = (): readonly ProviderConfig[] => {
  logger.info('🏭 Инициализация функциональных провайдеров lip-sync', {
    count: allProviders.length,
    providers: allProviders.map(p => p.providerId),
  })

  return allProviders
}

/**
 * Инициализирует конкретные провайдеры
 */
export const initializeSpecificProviders = (
  providerTypes: readonly LipSyncProvider[]
): readonly ProviderConfig[] => {
  const providers = providerTypes
    .map(type => getProviderByType(type))
    .filter((provider): provider is ProviderConfig => provider !== undefined)

  logger.info('🏭 Инициализация выбранных провайдеров', {
    requested: providerTypes,
    found: providers.map(p => p.providerId),
  })

  return providers
}

// ==================== ПРОВЕРКИ ====================

/**
 * Проверяет, поддерживается ли тип провайдера
 */
export const isProviderTypeSupported = (
  providerType: string,
  providers: readonly ProviderConfig[] = allProviders
): providerType is LipSyncProvider => {
  return getSupportedProviderTypes(providers).includes(
    providerType as LipSyncProvider
  )
}

/**
 * Проверяет, поддерживается ли модель
 */
export const isModelSupported = (
  modelId: string,
  providers: readonly ProviderConfig[] = allProviders
): boolean => {
  return providers.some(provider => provider.supportedModels.includes(modelId))
}

/**
 * Проверяет доступность всех провайдеров
 */
export const checkAllProvidersAvailability = async (
  providers: readonly ProviderConfig[] = allProviders
): Promise<Record<LipSyncProvider, boolean>> => {
  const results: Record<string, boolean> = {}

  const checks = providers.map(async provider => {
    try {
      const isAvailable = await provider.isAvailableFn()
      results[provider.providerId] = isAvailable
    } catch (error) {
      logger.error(`❌ Ошибка проверки доступности ${provider.providerId}`, {
        error: error instanceof Error ? error.message : String(error),
      })
      results[provider.providerId] = false
    }
  })

  await Promise.all(checks)

  return results as Record<LipSyncProvider, boolean>
}

// ==================== КОНФИГУРАЦИИ ПО УМОЛЧАНИЮ ====================

/**
 * Конфигурации по умолчанию для разных сценариев
 */
export const getDefaultConfigurations = () => ({
  /**
   * Экономичная конфигурация - только дешевые модели
   */
  economical: getModelsWithFilters([
    filterModelsByCost(0.02), // До $0.02 за секунду
  ]),

  /**
   * Качественная конфигурация - только премиум модели
   */
  premium: getModelsWithFilters([filterModelsByQuality('premium')]),

  /**
   * Быстрая конфигурация - только Replicate (обычно быстрее)
   */
  fast: getModelsWithFilters([filterModelsByProvider('replicate')]),

  /**
   * Полная конфигурация - все доступные модели
   */
  full: getModelsWithFilters([model => model.isAvailable]),
})

// ==================== УТИЛИТЫ ====================

/**
 * Создает кастомную конфигурацию провайдеров
 */
export const createCustomProviderConfig = (
  providerId: LipSyncProvider,
  overrides: Partial<ProviderConfig>
): ProviderConfig => {
  const baseProvider = getProviderByType(providerId)

  if (!baseProvider) {
    throw new Error(`Provider ${providerId} not found`)
  }

  return {
    ...baseProvider,
    ...overrides,
  }
}

/**
 * Получает статистику по провайдерам
 */
export const getProviderStats = (
  providers: readonly ProviderConfig[] = allProviders
) => {
  const totalModels = providers.reduce(
    (sum, provider) => sum + provider.modelsConfig.length,
    0
  )

  const availableModels = providers.reduce(
    (sum, provider) =>
      sum + provider.modelsConfig.filter(m => m.isAvailable).length,
    0
  )

  const providersByType = providers.reduce((acc, provider) => {
    acc[provider.providerId] = {
      name: provider.providerName,
      modelsCount: provider.modelsConfig.length,
      supportedModels: provider.supportedModels,
    }
    return acc
  }, {} as Record<string, any>)

  return {
    totalProviders: providers.length,
    totalModels,
    availableModels,
    providersByType,
  }
}

/**
 * Логирует информацию о провайдерах
 */
export const logProviderInfo = (
  providers: readonly ProviderConfig[] = allProviders
): void => {
  const stats = getProviderStats(providers)

  logger.info('📊 Статистика функциональных провайдеров', stats)

  providers.forEach(provider => {
    logger.info(`🔌 Провайдер: ${provider.providerName}`, {
      providerId: provider.providerId,
      supportedModels: provider.supportedModels,
      modelsCount: provider.modelsConfig.length,
      availableModels: provider.modelsConfig.filter(m => m.isAvailable).length,
    })
  })
}
