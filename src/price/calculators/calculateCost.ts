import { logger } from '@/utils/logger'
import { BASE_COSTS, interestRate, starCost } from '../constants'
import { ModeEnum, CostCalculationParams, CostCalculationResult } from '@/types'

/**
 * Рассчитывает стоимость для определенного режима
 */
export function calculateModeCost(
  params: CostCalculationParams
): CostCalculationResult {
  const { mode, steps, numImages = 1 } = params

  try {
    let stars = 0

    if (mode === ModeEnum.DigitalAvatarBody && steps) {
      const cost = calculateStepsCost(steps, 'v1')
      stars = cost.stars
    } else if (mode === ModeEnum.DigitalAvatarBodyV2 && steps) {
      const cost = calculateStepsCost(steps, 'v2')
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

      const modeKey = normalizedMode.toLowerCase()
      const baseCostInDollars = BASE_COSTS[modeKey as keyof typeof BASE_COSTS]

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

    if (mode === ModeEnum.VoiceToText) {
      stars = 5
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

/**
 * Рассчитывает стоимость на основе количества шагов
 */
function calculateStepsCost(
  steps: number,
  version: 'v1' | 'v2'
): CostCalculationResult {
  const baseStepCost = version === 'v1' ? 0.1 : 0.2
  const stars = (steps * baseStepCost) / starCost
  const dollars = stars * starCost
  const rubles = dollars * interestRate

  return {
    stars: parseFloat(stars.toFixed(2)),
    dollars: parseFloat(dollars.toFixed(2)),
    rubles: parseFloat(rubles.toFixed(2)),
  }
}

/**
 * Рассчитывает стоимость в звездах
 */
export function calculateCostInStars(costInDollars: number): number {
  return costInDollars / starCost
}
