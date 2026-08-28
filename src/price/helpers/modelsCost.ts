import { calculateCost } from '@/price/priceCalculator'
import { logger } from '@/utils/logger'

import {
  starCost,
  SYSTEM_CONFIG,
  interestRate,
  usdToStars,
} from '@/price/constants'
import {
  ModeEnum,
  CostCalculationParams,
  CostCalculationResult,
} from '@/interfaces/modes'

export function calculateCostInStars(costInDollars: number): number {
  return costInDollars / starCost
}

export type CostCalculationParamsInternal = CostCalculationParams

type BaseCosts = {
  [key in ModeEnum | 'neuro_photo_2']?: number
}

export const BASE_COSTS: BaseCosts = {
  // 💰 ПЛАТНЫЕ СЕРВИСЫ (простой расчет - фиксированная цена)
  [ModeEnum.NeuroPhoto]: 0.08,
  [ModeEnum.ImageToPrompt]: 0.03,
  [ModeEnum.ImageUpscaler]: 0.04,
  [ModeEnum.TextToSpeech]: 0.12,

  // 💰 ПЛАТНЫЕ СЕРВИСЫ (сложный расчет - базовые цены для видео)
  [ModeEnum.KlingVideo]: 1.1, // ~69⭐ = $1.1
  [ModeEnum.HaiperVideo]: 0.6, // ~38⭐ = $0.6
  [ModeEnum.MinimaxVideo]: 6.2, // ~390⭐ = $6.2
  [ModeEnum.VideoGenerationOther]: 2.5, // ~158⭐ = $2.5
  // DigitalAvatarBody - рассчитывается отдельно по шагам

  // 🧬 МОРФИНГ СЕРВИСЫ
  [ModeEnum.MorphingWizard]: 0.8, // ~50⭐ = $0.8 - новая цена для Kling v2.1 Standard морфинга

  // 🔧 СИСТЕМНЫЕ ОПЕРАЦИИ (бесплатные)
  [ModeEnum.Avatar]: 0,
  [ModeEnum.ChatWithAvatar]: 0,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.SelectAiTextModel]: 0,

  // ⚠️ УСТАРЕВШИЕ (оставляем для совместимости)
  [ModeEnum.NeuroPhotoV2]: 0.14,
  [ModeEnum.NeuroAudio]: 0.12,
  [ModeEnum.Voice]: 0.9,
  [ModeEnum.ImageToVideo]: 0,
  [ModeEnum.TextToVideo]: 0,
  [ModeEnum.TextToImage]: 0.08,
  [ModeEnum.LipSync]: 0.14, // Kling Lip-Sync: $0.014/sec * 10sec = $0.14
  [ModeEnum.VoiceToText]: 0.08,
}

export function calculateModeCost(
  params: CostCalculationParams
): CostCalculationResult {
  const { mode, steps, numImages = 1 } = params

  try {
    let stars = 0

    if (mode === ModeEnum.DigitalAvatarBody && steps) {
      const cost = calculateCost(steps, 'v1')
      stars = cost.stars
    } else if (mode === ModeEnum.DigitalAvatarBodyV2 && steps) {
      const cost = calculateCost(steps, 'v2')
      stars = cost.stars
    } else {
      let normalizedMode = mode
      if (mode === 'neuro_photo_2') {
        normalizedMode = ModeEnum.NeuroPhotoV2
        logger.info('🔄 Использован алиас режима', {
          description: 'Mode alias used',
          originalMode: mode,
          normalizedMode,
        })
      }

      const baseCostInDollars = BASE_COSTS[normalizedMode as keyof BaseCosts]

      if (baseCostInDollars === undefined) {
        logger.error('❌ Неизвестный режим', {
          description: 'Unknown mode in cost calculation',
          mode,
          normalizedMode,
        })
        stars = 0
      } else {
        stars = (baseCostInDollars / starCost) * numImages * interestRate
      }
    }

    stars = parseFloat(stars.toFixed(2))
    const dollars = parseFloat((stars * starCost).toFixed(2))
    const rubles = parseFloat((dollars * SYSTEM_CONFIG.interestRate).toFixed(2))

    return { stars, dollars, rubles }
  } catch (error) {
    logger.error('❌ Ошибка при расчете стоимости', {
      description: 'Error during cost calculation',
      error: error instanceof Error ? error.message : 'Unknown error',
      mode,
      steps,
      numImages,
    })
    throw error
  }
}

export const modeCosts: Record<string, number | ((param?: any) => number)> = {
  [ModeEnum.DigitalAvatarBody]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBody, steps }).stars,
  [ModeEnum.DigitalAvatarBodyV2]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBodyV2, steps }).stars,
  [ModeEnum.NeuroPhoto]: calculateModeCost({ mode: ModeEnum.NeuroPhoto }).stars,
  [ModeEnum.NeuroPhotoV2]: calculateModeCost({ mode: ModeEnum.NeuroPhotoV2 })
    .stars,
  [ModeEnum.NeuroAudio]: calculateModeCost({ mode: ModeEnum.NeuroAudio }).stars,
  neuro_photo_2: calculateModeCost({ mode: ModeEnum.NeuroPhotoV2 }).stars,
  [ModeEnum.ImageToPrompt]: calculateModeCost({ mode: ModeEnum.ImageToPrompt })
    .stars,
  [ModeEnum.ImageUpscaler]: calculateModeCost({ mode: ModeEnum.ImageUpscaler })
    .stars,
  [ModeEnum.Avatar]: calculateModeCost({ mode: ModeEnum.Avatar }).stars,
  [ModeEnum.ChatWithAvatar]: calculateModeCost({
    mode: ModeEnum.ChatWithAvatar,
  }).stars,
  [ModeEnum.SelectModel]: calculateModeCost({ mode: ModeEnum.SelectModel })
    .stars,
  [ModeEnum.SelectAiTextModel]: calculateModeCost({
    mode: ModeEnum.SelectAiTextModel,
  }).stars,
  [ModeEnum.Voice]: calculateModeCost({ mode: ModeEnum.Voice }).stars,
  [ModeEnum.TextToSpeech]: calculateModeCost({ mode: ModeEnum.TextToSpeech })
    .stars,
  [ModeEnum.ImageToVideo]: calculateModeCost({ mode: ModeEnum.ImageToVideo })
    .stars,
  [ModeEnum.TextToVideo]: calculateModeCost({ mode: ModeEnum.TextToVideo })
    .stars,
  [ModeEnum.TextToImage]: calculateModeCost({ mode: ModeEnum.TextToImage })
    .stars,
  [ModeEnum.LipSync]: calculateModeCost({ mode: ModeEnum.LipSync }).stars,
  [ModeEnum.VoiceToText]: calculateModeCost({ mode: ModeEnum.VoiceToText })
    .stars,

  // 💰 ПЛАТНЫЕ ВИДЕО-СЕРВИСЫ
  [ModeEnum.KlingVideo]: calculateModeCost({ mode: ModeEnum.KlingVideo }).stars,
  [ModeEnum.HaiperVideo]: calculateModeCost({ mode: ModeEnum.HaiperVideo })
    .stars,
  [ModeEnum.MinimaxVideo]: calculateModeCost({ mode: ModeEnum.MinimaxVideo })
    .stars,
  [ModeEnum.VideoGenerationOther]: calculateModeCost({
    mode: ModeEnum.VideoGenerationOther,
  }).stars,

  // 🧬 МОРФИНГ СЕРВИСЫ
  [ModeEnum.MorphingWizard]: calculateModeCost({
    mode: ModeEnum.MorphingWizard,
  }).stars,
}

export const minCost = parseFloat(
  Math.min(
    ...Object.values(modeCosts).map(cost =>
      typeof cost === 'function' ? cost(1) : cost
    )
  ).toFixed(2)
)

export const maxCost = parseFloat(
  Math.max(
    ...Object.values(modeCosts).map(cost =>
      typeof cost === 'function' ? cost(1) : cost
    )
  ).toFixed(2)
)

// ═══════════════════════════════════════════════════════════════════════════
// 🎵 SUNO MUSIC GENERATION PRICING
// Используем KIE AI API для генерации музыки через Suno
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Конфигурация Suno Music через KIE AI
 * Базовая цена: $0.40 за минуту (suno-v4.5-plus)
 * Системная наценка 50% применяется через usdToStars()
 */
export const SUNO_MUSIC_CONFIG = {
  baseUsdPerMin: 0.4, // Базовая цена KIE AI за минуту
  model: 'suno-v4.5-plus', // Модель Suno
  minDuration: 60, // Минимум 1 минута
  maxDuration: 180, // Максимум 3 минуты
} as const

/**
 * Рассчитывает стоимость генерации музыки в Stars
 * Использует системную наценку 50% через usdToStars()
 *
 * @param durationSeconds - длительность в секундах (60, 120, 180)
 * @returns стоимость в Stars
 *
 * @example
 * calculateSunoMusicCost(60)  // 37 Stars (1 мин)
 * calculateSunoMusicCost(120) // 75 Stars (2 мин)
 * calculateSunoMusicCost(180) // 113 Stars (3 мин)
 */
export function calculateSunoMusicCost(durationSeconds: number): number {
  const minutes = durationSeconds / 60
  const baseCostUSD = SUNO_MUSIC_CONFIG.baseUsdPerMin * minutes
  return usdToStars(baseCostUSD) // Системная наценка 50% уже включена
}

/**
 * Предустановленные длительности для кнопок
 */
export const SUNO_DURATION_OPTIONS = [
  {
    seconds: 60,
    label: '1 мин',
    labelEn: '1 min',
    stars: calculateSunoMusicCost(60),
  },
  {
    seconds: 120,
    label: '2 мин',
    labelEn: '2 min',
    stars: calculateSunoMusicCost(120),
  },
  {
    seconds: 180,
    label: '3 мин',
    labelEn: '3 min',
    stars: calculateSunoMusicCost(180),
  },
] as const

// ═══════════════════════════════════════════════════════════════════════════
// 🎤 RVC VOICE TRAINING & AI COVER PRICING
// Используем Replicate для обучения голоса и создания AI Cover
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Конфигурация Voice Training (RVC)
 * Обучение голоса: ~$1.07 базовая цена
 * С наценкой 50%: 100⭐
 */
export const VOICE_TRAINING_CONFIG = {
  baseUsd: 1.07, // Базовая цена Replicate за обучение
  fixedStars: 100, // Фиксированная цена в Stars
  model: 'replicate/train-rvc-model',
  minAudioDuration: 30, // Минимум 30 секунд
  maxAudioDuration: 180, // Максимум 3 минуты
} as const

/**
 * Конфигурация AI Cover
 * Конверсия голоса: ~$0.20 базовая цена за песню
 * С наценкой 50%: 19⭐
 */
export const AI_COVER_CONFIG = {
  baseUsd: 0.2, // Базовая цена за конверсию
  fixedStars: 19, // Фиксированная цена в Stars
  model: 'zsxkib/realistic-voice-cloning',
  maxSongDuration: 600, // Максимум 10 минут
} as const

/**
 * Получить стоимость обучения голоса
 */
export function getVoiceTrainingCost(): number {
  return VOICE_TRAINING_CONFIG.fixedStars
}

/**
 * Получить стоимость AI Cover
 */
export function getAICoverCost(): number {
  return AI_COVER_CONFIG.fixedStars
}
