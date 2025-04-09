import { calculateCost } from './calculateCost'
import { logger } from '@/utils/logger'
import { CostCalculationParams, CostCalculationResult } from '@/types'
import { ModeEnum } from '@/types/modes'
import { interestRate } from '@/price/constants'

export { ModeEnum }
export const starCost = 0.016

export const SYSTEM_CONFIG = {
  starCost,
  interestRate,
  currency: 'RUB',
}

export function calculateCostInStars(costInDollars: number): number {
  return costInDollars / starCost
}

type BaseCosts = {
  [key in ModeEnum | 'neuro_photo_2']?: number
}

const BASE_COSTS: BaseCosts = {
  [ModeEnum.NeuroPhoto]: 0.08,
  [ModeEnum.NeuroPhotoV2]: 0.14,
  neuro_photo_2: 0.14,
  [ModeEnum.ImageToPrompt]: 0.03,
  [ModeEnum.AvatarBrainWizard]: 0,
  [ModeEnum.ChatWithAvatar]: 0,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.SelectModelWizard]: 0,
  [ModeEnum.Voice]: 0.9,
  [ModeEnum.TextToSpeech]: 0.12,
  [ModeEnum.ImageToVideo]: 0,
  [ModeEnum.TextToVideo]: 0,
  [ModeEnum.TextToImage]: 0.08,
  [ModeEnum.LipSync]: 0.9,
  [ModeEnum.VoiceToText]: 0.08,
  [ModeEnum.DigitalAvatarBody]: 0,
  [ModeEnum.DigitalAvatarBodyV2]: 0,
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
        stars = (baseCostInDollars / starCost) * numImages
      }
    }

    stars = parseFloat(stars.toFixed(2))
    const dollars = parseFloat((stars * starCost).toFixed(2))
    const rubles = parseFloat((dollars * interestRate).toFixed(2))

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
  neuro_photo_2: calculateModeCost({ mode: 'neuro_photo_2' }).stars,
  [ModeEnum.ImageToPrompt]: calculateModeCost({ mode: ModeEnum.ImageToPrompt })
    .stars,
  [ModeEnum.AvatarBrainWizard]: calculateModeCost({
    mode: ModeEnum.AvatarBrainWizard,
  }).stars,
  [ModeEnum.ChatWithAvatar]: calculateModeCost({
    mode: ModeEnum.ChatWithAvatar,
  }).stars,
  [ModeEnum.SelectModel]: calculateModeCost({ mode: ModeEnum.SelectModel })
    .stars,
  [ModeEnum.SelectModelWizard]: calculateModeCost({
    mode: ModeEnum.SelectModelWizard,
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
}

export const minCost = Math.min(
  ...Object.values(modeCosts).map(cost =>
    typeof cost === 'function' ? cost(1) : cost
  )
)

export const maxCost = Math.max(
  ...Object.values(modeCosts).map(cost =>
    typeof cost === 'function' ? cost(1) : cost
  )
)
