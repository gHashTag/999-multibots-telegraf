import { calculateCost } from '@/price/priceCalculator'
import { logger } from '@/utils/logger'

import { starCost, SYSTEM_CONFIG, interestRate } from '@/price/constants'
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
        logger.info({
          message: '🔄 Использован алиас режима',
          description: 'Mode alias used',
          originalMode: mode,
          normalizedMode,
        })
      }

      const baseCostInDollars = BASE_COSTS[normalizedMode as keyof BaseCosts]

      if (baseCostInDollars === undefined) {
        logger.error({
          message: '❌ Неизвестный режим',
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
    logger.error({
      message: '❌ Ошибка при расчете стоимости',
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
