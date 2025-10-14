/**
 * Конфигурация моделей для Lip Sync
 * Поддерживает множественные модели для выбора пользователем
 */

export enum LipSyncModelType {
  KLING = 'kling',
  SYNC_V2 = 'sync_v2',
  VEED_FABRIC = 'veed_fabric',
}

export interface LipSyncModelConfig {
  id: string
  name: string
  description: string
  provider: 'replicate' | 'sync' | 'kie'
  modelId: string
  costPerSecond: number // в долларах
  maxDuration: number // максимальная длительность в секундах
  quality: 'standard' | 'high' | 'premium'
  isAvailable: boolean
  features: string[]
  resolution?: '480p' | '720p' // для kie.ai моделей
}

export const LIPSYNC_MODELS: Record<LipSyncModelType, LipSyncModelConfig> = {
  [LipSyncModelType.KLING]: {
    id: 'kling',
    name: '🚀 Kling Lip-Sync',
    description:
      'Быстрая и точная модель от Replicate. Добавляет синхронизацию губ к любому видео с лицом. Отличное качество по доступной цене.',
    provider: 'replicate',
    modelId: 'kwaivgi/kling-lip-sync',
    costPerSecond: 0.014, // $0.014 per second
    maxDuration: 30,
    quality: 'high',
    isAvailable: false, // Временно отключено
    features: [
      'Высокая скорость обработки',
      'Точная синхронизация',
      'Поддержка различных типов лиц',
      'Экономичная цена',
    ],
  },
  [LipSyncModelType.SYNC_V2]: {
    id: 'sync_v2',
    name: '⭐ Sync LipSync-2',
    description:
      'Премиум модель с сохранением уникального стиля говорящего. Добавляет реалистичную синхронизацию губ к видео с лицом. Лучшее качество для профессионалов.',
    provider: 'sync',
    modelId: 'sync/lipsync-2',
    costPerSecond: 0.05, // $0.05 per second
    maxDuration: 60,
    quality: 'premium',
    isAvailable: false, // Временно отключено
    features: [
      'Сохранение уникального стиля речи',
      'Премиум качество',
      'Улучшенная работа с зубами',
      'Устойчивость к поворотам головы',
      'Работа с бородой и усами',
    ],
  },
  [LipSyncModelType.VEED_FABRIC]: {
    id: 'veed_fabric',
    name: '🎭 Veed Fabric AI',
    description:
      'AI talking video модель с естественной синхронизацией губ, выразительными движениями глаз и тонкими мимическими жестами. Использует голос аватара пользователя.',
    provider: 'kie',
    modelId: 'veed-fabric',
    costPerSecond: 0.0475, // $0.0475 per second for 480p
    maxDuration: 120, // 2 минуты
    quality: 'high',
    isAvailable: true,
    resolution: '480p', // можно переключать на 720p ($0.09/sec)
    features: [
      'Использует голос аватара пользователя',
      'Естественная синхронизация губ',
      'Выразительные движения глаз',
      'Тонкие мимические жесты',
      'Качество 480p/720p',
      'До 2 минут видео',
    ],
  },
}

/**
 * Получить доступные модели для lip-sync
 */
export function getAvailableLipSyncModels(): LipSyncModelConfig[] {
  return Object.values(LIPSYNC_MODELS).filter(model => model.isAvailable)
}

/**
 * Получить модель по ID
 */
export function getLipSyncModelById(
  id: string
): LipSyncModelConfig | undefined {
  return Object.values(LIPSYNC_MODELS).find(model => model.id === id)
}

/**
 * Получить модель по типу
 */
export function getLipSyncModelByType(
  type: LipSyncModelType
): LipSyncModelConfig {
  return LIPSYNC_MODELS[type]
}

/**
 * Рассчитать стоимость генерации для модели
 */
export function calculateLipSyncCost(
  modelId: string,
  durationSeconds: number
): number {
  const model = getLipSyncModelById(modelId)
  if (!model) {
    throw new Error(`Unknown lip-sync model: ${modelId}`)
  }

  return model.costPerSecond * durationSeconds
}

/**
 * Получить модель по умолчанию
 */
export function getDefaultLipSyncModel(): LipSyncModelConfig {
  return LIPSYNC_MODELS[LipSyncModelType.KLING] // Kling как default для экономии
}

/**
 * Сортировать модели по качеству и цене
 */
export function getSortedLipSyncModels(): LipSyncModelConfig[] {
  const models = getAvailableLipSyncModels()

  return models.sort((a, b) => {
    // Сначала по качеству (premium > high > standard)
    const qualityOrder = { premium: 3, high: 2, standard: 1 }
    const qualityDiff = qualityOrder[b.quality] - qualityOrder[a.quality]

    if (qualityDiff !== 0) {
      return qualityDiff
    }

    // Потом по цене (дешевле лучше)
    return a.costPerSecond - b.costPerSecond
  })
}
