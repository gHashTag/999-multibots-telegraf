/**
 * Функциональное управление Lip-Sync моделями
 * Основано на чистых функциях без побочных эффектов
 */

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================
export {
  generateLipSync,
  getLipSyncStatus,
  getAvailableModels,
  getModelById,
  getProviderForModel,
  calculateCost,
  checkProvidersHealth,
  cancelGeneration,
  clearCache,
  createConfig,
  getCacheStats,
  cleanExpiredCache,
} from './manager'

// ==================== ФАБРИКА/УТИЛИТЫ ====================
export {
  getProviderByType,
  getSupportedProviderTypes,
  getModelsWithFilters,
  getProvidersWithFilters,
  initializeDefaultProviders,
  initializeSpecificProviders,
  isProviderTypeSupported,
  isModelSupported,
  checkAllProvidersAvailability,
  getDefaultConfigurations,
  createCustomProviderConfig,
  getProviderStats,
  logProviderInfo,
  filterProvidersByType,
  filterProvidersByAvailability,
  filterModelsByQuality,
  filterModelsByCost,
  filterModelsByProvider,
  getDefaultModel,
} from './factory'

// ==================== ВАЛИДАТОРЫ И БИЛДЕРЫ ====================
export {
  validateLipSyncInput,
  validateModelConfig,
  isKlingInput,
  isSyncInput,
  validateUrl,
  validateTelegramId,
  safeValidateLipSyncInput,
  safeValidateModelConfig,
  createKlingInput,
  createSyncInput,
  createInputByProvider,
  extractBaseParams,
  validateInputUrls,
  generateInputKey,
  LipSyncValidationError,
} from './validators'

// ==================== ПРОВАЙДЕРЫ ====================
export {
  replicateProviderConfig,
  syncProviderConfig,
  allProviders,
} from './providers'

// ==================== ТИПЫ ====================
export type {
  LipSyncProvider,
  LipSyncStatus,
  LipSyncQuality,
  BaseLipSyncInput,
  KlingLipSyncInput,
  SyncLipSyncInput,
  UniversalLipSyncInput,
  LipSyncOutput,
  LipSyncError,
  LipSyncModelConfig,
  LipSyncResult,
  KlingParameters,
  SyncParameters,
  LipSyncProviderFunction,
  StatusCheckFunction,
  AvailabilityCheckFunction,
  CostCalculationFunction,
  ProviderConfig,
  GenerationContext,
  ContextualResult,
} from './types'

export type { ManagerConfig } from './manager'
export type { ValidationResult } from './validators'

// ==================== СХЕМЫ ====================
export {
  LipSyncProviderSchema,
  LipSyncStatusSchema,
  LipSyncQualitySchema,
  BaseLipSyncInputSchema,
  KlingParametersSchema,
  SyncParametersSchema,
  KlingLipSyncInputSchema,
  SyncLipSyncInputSchema,
  UniversalLipSyncInputSchema,
  LipSyncOutputSchema,
  LipSyncErrorSchema,
  LipSyncModelConfigSchema,
  LipSyncResultSchema,
} from './types'

// ==================== УДОБНЫЕ ФУНКЦИИ ====================

// Импорты для удобных функций
import { createKlingInput, createSyncInput } from './validators'
import {
  generateLipSync,
  getAvailableModels,
  getModelById,
  checkProvidersHealth,
} from './manager'
import {
  filterModelsByCost,
  filterModelsByQuality,
  filterModelsByProvider,
  getModelsWithFilters,
  getDefaultModel,
} from './factory'

/**
 * Быстрая генерация lip-sync с автоматическим выбором модели
 */
export const quickGenerate = async (
  videoUrl: string,
  audioUrl: string,
  telegramId: string,
  options: {
    modelId?: string
    botName?: string
    provider?: 'replicate' | 'sync'
  } = {}
) => {
  let input: any

  if (options.provider === 'sync') {
    input = createSyncInput(videoUrl, audioUrl, telegramId, {
      botName: options.botName,
    })
  } else {
    input = createKlingInput(videoUrl, audioUrl, telegramId, {
      botName: options.botName,
    })
  }

  return generateLipSync(input, options.modelId)
}

/**
 * Получить рекомендованную модель на основе параметров
 */
export const getRecommendedModel = (
  criteria: {
    maxCostPerSecond?: number
    preferredQuality?: 'standard' | 'high' | 'premium'
    preferredProvider?: 'replicate' | 'sync'
  } = {}
) => {
  const filters = []

  if (criteria.maxCostPerSecond) {
    filters.push(filterModelsByCost(criteria.maxCostPerSecond))
  }

  if (criteria.preferredQuality) {
    filters.push(filterModelsByQuality(criteria.preferredQuality))
  }

  if (criteria.preferredProvider) {
    filters.push(filterModelsByProvider(criteria.preferredProvider))
  }

  const models = getModelsWithFilters(filters)

  // Возвращаем первую подходящую модель или модель с лучшим соотношением цена/качество
  return models[0] || getDefaultModel()
}

/**
 * Проверить совместимость входных данных с моделью
 */
export const checkModelCompatibility = (
  input: any, // UniversalLipSyncInput
  modelId: string
): boolean => {
  const model = getModelById(modelId)
  if (!model) return false

  // Проверяем провайдера
  if (input.provider !== model.provider) return false

  // Проверяем конкретную модель
  if (input.modelId !== model.modelId) return false

  return true
}

/**
 * Получить оценку времени обработки (примерная)
 */
export const estimateProcessingTime = (
  durationSeconds: number,
  modelId?: string
): number => {
  const model = getModelById(modelId || 'kling')

  if (!model) return durationSeconds * 2 // Общая оценка

  // Разные модели имеют разную скорость
  switch (model.provider) {
    case 'replicate':
      return durationSeconds * 1.5 // Replicate обычно быстрее
    case 'sync':
      return durationSeconds * 3 // Sync более медленный, но качественный
    default:
      return durationSeconds * 2
  }
}

/**
 * Создать отчет о доступности всех моделей
 */
export const createAvailabilityReport = async () => {
  const models = getAvailableModels()
  const providersHealth = await checkProvidersHealth()

  const report = {
    timestamp: new Date().toISOString(),
    totalModels: models.length,
    availableModels: models.filter(
      m => providersHealth[m.provider] && m.isAvailable
    ).length,
    providers: Object.entries(providersHealth).map(([provider, isHealthy]) => ({
      provider,
      isHealthy,
      models: models
        .filter(m => m.provider === provider)
        .map(m => ({
          id: m.id,
          name: m.name,
          isAvailable: m.isAvailable && isHealthy,
          costPerSecond: m.costPerSecond,
          quality: m.quality,
        })),
    })),
  }

  return report
}
