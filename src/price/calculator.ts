import { ModeEnum } from '@/interfaces/modes'
import * as pricingConfig from '@/pricing/config/pricing.config'
import * as modelsConfig from '@/pricing/config/models.config'

/**
 * Represents the result of a cost calculation.
 */
export type CostCalculationResult = {
  stars: number
  rubles: number
  dollars: number
}

/**
 * Represents the parameters required for calculating the price of a specific mode.
 */
export type CalculationParams = {
  modelId?: string
  steps?: number
  seconds?: number // Keep for potential API use, but ignore for pricing
  numImages?: number
}

/**
 * Calculates the final price for a given mode and parameters in stars, rubles, and dollars.
 *
 * @param mode The mode for which to calculate the price.
 * @param params Optional parameters specific to the mode (e.g., steps, modelId, seconds).
 * @returns An object with stars, rubles, and dollars, or null if calculation is not possible.
 */
export function calculateFinalStarPrice(
  mode: ModeEnum | string,
  params?: CalculationParams
): CostCalculationResult | null {
  let result: CostCalculationResult = { stars: 0, rubles: 0, dollars: 0 }
  let basePriceUSD = 0

  // 1. Determine Base Price in USD
  if (
    params?.steps &&
    params.steps > 0 &&
    pricingConfig.STEP_BASED_PRICES_USD[mode as ModeEnum]
  ) {
    // Priority 1: Step-based pricing
    basePriceUSD =
      pricingConfig.STEP_BASED_PRICES_USD[mode as ModeEnum]! * params.steps
  }
  // Priority 2: Check model-based pricing (video/image) if modelId is provided
  else if (params?.modelId) {
    // Check video models first (assuming fixed price per generation)
    const videoModelConfigs = modelsConfig.VIDEO_MODELS_CONFIG ?? {}
    const videoModelConfig = videoModelConfigs[params.modelId]
    if (videoModelConfig && typeof videoModelConfig.basePrice === 'number') {
      basePriceUSD = videoModelConfig.basePrice // Use fixed basePrice, ignore seconds
    } else {
      // TODO: Add check for IMAGE_MODELS_CONFIG here if they also use modelId
      console.warn(
        `[PriceCalc] Video/Image model config or basePrice not found for modelId: ${params.modelId}`
      )
      // If no video model found, it might fall through to Priority 3 (fixed base price)
      // or remain 0 if not defined there either.
    }
  }
  // Priority 3: Check fixed BASE_PRICES_USD (only if not determined by steps or model)
  if (basePriceUSD <= 0 && pricingConfig.BASE_PRICES_USD[mode as ModeEnum] !== undefined) {
     basePriceUSD = pricingConfig.BASE_PRICES_USD[mode as ModeEnum]!;
  }


  // If basePrice is still 0 or negative after checks, return the default 0 cost
  if (basePriceUSD <= 0) {
    return result
  }

  // 2. Apply Markup and Calculate Final Prices
  const finalPriceUSD = basePriceUSD * pricingConfig.MARKUP_MULTIPLIER

  if (pricingConfig.STAR_COST_USD <= 0) {
    console.error('[PriceCalc] STAR_COST_USD must be positive.')
    return null
  }

  const finalStars = Math.ceil(
    (basePriceUSD / pricingConfig.STAR_COST_USD) *
      pricingConfig.MARKUP_MULTIPLIER
  )

  const finalRubles = finalPriceUSD * pricingConfig.CURRENCY_RATES.USD_TO_RUB
  const numImages = params?.numImages ?? 1

  result = {
    stars: finalStars * numImages,
    rubles: finalRubles * numImages,
    dollars: finalPriceUSD * numImages,
  }

  return result
}
