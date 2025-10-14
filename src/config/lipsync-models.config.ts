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
  costPerSecond: number // в долларах (с наценкой)
  costPerSecond720p?: number // для моделей с 720p опцией
  costPerSecondStars480p?: number // цена в звездах для 480p
  costPerSecondStars720p?: number // цена в звездах для 720p
  maxDuration: number // максимальная длительность в секундах
  quality: 'standard' | 'high' | 'premium'
  isAvailable: boolean
  features: string[]
  resolution?: '480p' | '720p' // для kie.ai моделей (default)
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
    costPerSecond: 0.114, // ✅ ИСПРАВЛЕНО: $0.0475 × 2.4 наценка = $0.114/sec для 480p
    costPerSecond720p: 0.216, // ✅ ДОБАВЛЕНО: $0.09 × 2.4 наценка = $0.216/sec для 720p
    costPerSecondStars480p: 7, // ✅ $0.114 / 0.016 = 7.125⭐ ≈ 7⭐/sec
    costPerSecondStars720p: 14, // ✅ $0.216 / 0.016 = 13.5⭐ ≈ 14⭐/sec
    maxDuration: 120, // 2 минуты
    quality: 'high',
    isAvailable: true,
    resolution: '480p', // default разрешение
    features: [
      'Использует голос аватара пользователя',
      'Естественная синхронизация губ',
      'Выразительные движения глаз',
      'Тонкие мимические жесты',
      'Выбор качества: 480p (7⭐/сек) или 720p (14⭐/сек)',
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
  durationSeconds: number,
  resolution?: '480p' | '720p'
): number {
  const model = getLipSyncModelById(modelId)
  if (!model) {
    throw new Error(`Unknown lip-sync model: ${modelId}`)
  }

  // Для Veed Fabric с выбором разрешения
  if (modelId === 'veed_fabric' && resolution === '720p' && model.costPerSecond720p) {
    return model.costPerSecond720p * durationSeconds
  }

  return model.costPerSecond * durationSeconds
}

/**
 * Рассчитать стоимость в звездах для модели
 */
export function calculateLipSyncCostStars(
  modelId: string,
  durationSeconds: number,
  resolution?: '480p' | '720p'
): number {
  const model = getLipSyncModelById(modelId)
  if (!model) {
    throw new Error(`Unknown lip-sync model: ${modelId}`)
  }

  // Для Veed Fabric с выбором разрешения
  if (modelId === 'veed_fabric') {
    const costPerSec = resolution === '720p'
      ? (model.costPerSecondStars720p || 14)
      : (model.costPerSecondStars480p || 7)
    return costPerSec * durationSeconds
  }

  // Для других моделей - конвертируем USD в звезды
  const starCost = 0.016 // $1 = 62.5⭐ → 1⭐ = $0.016
  return Math.ceil(model.costPerSecond * durationSeconds / starCost)
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
