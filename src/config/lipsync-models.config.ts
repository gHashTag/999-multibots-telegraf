/**
 * Конфигурация моделей для Lip Sync
 * Поддерживает множественные модели для выбора пользователем
 */

/*
 * THE MARKUP AND THE STAR PRICE COME IN AT THE TOP, NOT MID-FUNCTION.
 *
 * These three prices used to read them with `require('@/price/constants')`
 * inside the branch that needed them. esbuild resolves that alias when it
 * bundles, so production was never affected -- but a plain Node runtime (and
 * vitest, which is one) cannot resolve `@/` in a runtime require, and the call
 * threw. In the lip-sync wizard that throw lands in the outer catch and comes
 * out as "Audio processing error", which says nothing about prices: the whole
 * scene was untestable and any non-bundled runtime would have been broken.
 */
import { MARKUP_MULTIPLIER, STAR_COST_USD } from '@/price/constants'

export enum LipSyncModelType {
  KLING = 'kling',
  SYNC_V2 = 'sync_v2',
  VEED_FABRIC = 'veed_fabric',
  FAL_VEED_FABRIC = 'fal_veed_fabric',
  LATENTSYNC = 'latentsync',
  HUMMINGBIRD = 'hummingbird',
}

export interface LipSyncModelConfig {
  id: string
  name: string
  description: string
  provider: 'replicate' | 'sync' | 'kie' | 'fal'
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
      'AI talking video модель с естественной синхронизацией губ, выразительными движениями глаз и тонкими мимическими жестами. Использует голос аватара пользователя. Качество 720p.',
    provider: 'kie',
    modelId: 'veed-fabric',
    costPerSecond: 0.216, // ✅ ТОЛЬКО 720p: $0.09 × 2.4 наценка = $0.216/сек (kie.ai: 18 credits)
    maxDuration: 30, // kie.ai limit 30 секунд
    quality: 'high',
    isAvailable: true,
    resolution: '720p',
    features: [
      'Использует голос аватара пользователя',
      'Естественная синхронизация губ (720p)',
      'Выразительные движения глаз',
      'Тонкие мимические жесты',
      'Высокое качество 720p - 14⭐/сек',
      'До 30 секунд видео',
    ],
  },
  [LipSyncModelType.FAL_VEED_FABRIC]: {
    id: 'fal_veed_fabric',
    name: '🚀 Fal.ai Veed Fabric 1.0 Fast',
    description:
      'Быстрая и стабильная модель от Fal.ai для создания talking video с естественной синхронизацией губ. Поддерживает 720p и 480p качество. Более стабильная альтернатива.',
    provider: 'fal',
    modelId: 'fal-veed-fabric-1.0-fast',
    costPerSecond: 0.1, // ✅ ИСПРАВЛЕНО: $0.10 per second для 480p (базовая цена)
    costPerSecond720p: 0.2, // ✅ ИСПРАВЛЕНО: $0.20 per second для 720p (базовая цена)
    costPerSecondStars480p: 9.375, // ✅ ИСПРАВЛЕНО: 9.375⭐/сек для 480p с наценкой 50% ($0.10 × 1.5 / $0.016)
    costPerSecondStars720p: 18.75, // ✅ ИСПРАВЛЕНО: 18.75⭐/сек для 720p с наценкой 50% ($0.20 × 1.5 / $0.016)
    maxDuration: 60,
    quality: 'high',
    isAvailable: true,
    resolution: '720p',
    features: [
      'Быстрая и стабильная обработка',
      'Поддержка 720p и 480p качества',
      'Естественная синхронизация губ',
      'Надежная инфраструктура Fal.ai',
      'До 60 секунд видео',
      'Обновленные реальные цены',
    ],
  },
  [LipSyncModelType.LATENTSYNC]: {
    id: 'latentsync',
    name: '🧠 LatentSync (ByteDance)',
    description:
      'Открытая модель от ByteDance на базе Stable Diffusion. Высокая точность синхронизации без промежуточных представлений. Поддержка реальных и анимационных видео.',
    provider: 'fal',
    modelId: 'fal-ai/latentsync',
    costPerSecond: 0.005, // $0.20 за первые 40 сек, потом $0.005/сек
    maxDuration: 120,
    quality: 'high',
    isAvailable: true,
    features: [
      'Open-source от ByteDance',
      'Высокая точность (94% HDTF)',
      'Поддержка аниме и реальных видео',
      'Экономичная цена - ~3⭐/сек',
      'До 2 минут видео',
      'Версия 1.5 (март 2025)',
    ],
  },
  [LipSyncModelType.HUMMINGBIRD]: {
    id: 'hummingbird',
    name: '🐦 Hummingbird-0 (Tavus)',
    description:
      'Премиум модель от Tavus - лидер benchmark по точности lip sync. Zero-shot без дообучения. Лучший выбор для профессионального контента.',
    provider: 'fal',
    modelId: 'fal-ai/tavus/hummingbird-lipsync/v0',
    costPerSecond: 0.035, // $2.10/мин = $0.035/сек
    maxDuration: 300, // до 5 минут
    quality: 'premium',
    isAvailable: true,
    features: [
      'Лидер benchmark по точности',
      'Zero-shot - без дообучения',
      'Премиум качество - 22⭐/сек',
      'До 5 минут видео',
      'Лучший для talking-head',
      'Новейшая модель (апрель 2025)',
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
  if (
    modelId === 'veed_fabric' &&
    resolution === '720p' &&
    model.costPerSecond720p
  ) {
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

  // Для Veed Fabric только 720p: $0.216/сек
  // 1⭐ ≈ $0.016, поэтому $0.216 / $0.016 = 13.5⭐ ≈ 14⭐/сек
  if (modelId === 'veed_fabric') {
    return 14 * durationSeconds // 720p quality
  }

  // ✅ ИСПРАВЛЕНО: Для Fal.ai Veed Fabric 1.0 Fast с централизованной наценкой
  if (modelId === 'fal_veed_fabric') {
    const costPerSecond = resolution === '720p' ? 0.2 : 0.1 // $0.20 для 720p, $0.10 для 480p
    const totalCostUSD = costPerSecond * durationSeconds
    const starsBeforeMarkup = totalCostUSD / STAR_COST_USD
    const starsWithMarkup = starsBeforeMarkup * MARKUP_MULTIPLIER
    return Math.floor(starsWithMarkup) // Применяем централизованную наценку 50%
  }

  // ✅ LatentSync: $0.20 за первые 40 сек, потом $0.005/сек
  if (modelId === 'latentsync') {
    // Специальная pricing модель: $0.20 flat до 40 сек, потом $0.005/сек
    const baseCost = 0.2 // минимум $0.20
    const extraSeconds = Math.max(0, durationSeconds - 40)
    const totalCostUSD = baseCost + extraSeconds * 0.005
    const starsBeforeMarkup = totalCostUSD / STAR_COST_USD
    const starsWithMarkup = starsBeforeMarkup * MARKUP_MULTIPLIER
    return Math.ceil(starsWithMarkup)
  }

  // ✅ Hummingbird: $2.10/мин = $0.035/сек
  if (modelId === 'hummingbird') {
    const totalCostUSD = 0.035 * durationSeconds
    const starsBeforeMarkup = totalCostUSD / STAR_COST_USD
    const starsWithMarkup = starsBeforeMarkup * MARKUP_MULTIPLIER
    return Math.ceil(starsWithMarkup)
  }

  // Для других моделей - конвертируем USD в звезды
  const starCost = 0.016 // $1 = 62.5⭐ → 1⭐ = $0.016
  return Math.ceil((model.costPerSecond * durationSeconds) / starCost)
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
