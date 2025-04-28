import { ModeEnum } from '@/interfaces/modes'
// import * as pricingConfig from '@/pricing/config/pricing.config' // Removed, file does not exist yet
import * as modelsConfig from '@/config/models.config' // Corrected path
import {
  STAR_COST_USD,
  MARKUP_MULTIPLIER,
  BASE_PRICES_USD,
  CURRENCY_RATES,
  STEP_BASED_PRICES_USD,
} from '@/config/pricing.config'

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
 * Uses configuration from src/config/pricing.config.ts
 *
 * @param mode The mode for which to calculate the price.
 * @param params Optional parameters specific to the mode (e.g., steps, modelId, seconds).
 * @returns An object with stars, rubles, and dollars, or null if price cannot be determined.
 */
export function calculateFinalStarPrice(
  mode: ModeEnum | string,
  params?: CalculationParams
): CostCalculationResult | null {
  let basePriceUSD: number | undefined = undefined
  const modeKey = mode as ModeEnum // Use enum key for lookups

  // 1. Determine Base Price in USD based on priority
  // Priority 1: Step-based pricing
  if (params?.steps && params.steps > 0 && STEP_BASED_PRICES_USD[modeKey]) {
    basePriceUSD = (STEP_BASED_PRICES_USD[modeKey] ?? 0) * params.steps
    // console.log(`[PriceCalc] Mode: ${mode}, Type: Step, Steps: ${params.steps}, BaseUSD: ${basePriceUSD}`);
  }
  // Priority 2: Model-based pricing (Video models)
  else if (params?.modelId) {
    const videoModelConfigs = modelsConfig.VIDEO_MODELS_CONFIG ?? {}
    const videoModelConfig = videoModelConfigs[params.modelId]
    if (videoModelConfig && typeof videoModelConfig.basePrice === 'number') {
      basePriceUSD = videoModelConfig.basePrice
      // console.log(`[PriceCalc] Mode: ${mode}, Type: Video Model, Model: ${params.modelId}, BaseUSD: ${basePriceUSD}`);
    } else {
      // TODO: Add checks for IMAGE_MODELS_CONFIG here if applicable
      console.warn(
        `[PriceCalc] Video/Image model config or basePrice not found for modelId: ${params.modelId}`
      )
      // Fall through to check fixed base price
    }
  }

  // Priority 3: Fixed base price (if not determined above)
  if (basePriceUSD === undefined && BASE_PRICES_USD[modeKey] !== undefined) {
    basePriceUSD = BASE_PRICES_USD[modeKey]
    // console.log(`[PriceCalc] Mode: ${mode}, Type: Fixed, BaseUSD: ${basePriceUSD}`);
  }

  // If basePrice is still undefined or <= 0, price cannot be determined (or it's free)
  if (basePriceUSD === undefined || basePriceUSD <= 0) {
    // console.log(`[PriceCalc] Mode: ${mode}, Price: Free or Undefined`);
    return { stars: 0, rubles: 0, dollars: 0 }
  }

  // 2. Apply Markup and Calculate Final Prices
  // Ensure STAR_COST_USD is positive (checked in config, but double-check)
  if (STAR_COST_USD <= 0) {
    console.error('[PriceCalc] FATAL: STAR_COST_USD is not positive.')
    return null // Indicate error
  }

  const finalPriceUSD = basePriceUSD * MARKUP_MULTIPLIER

  // Calculate stars using floor as per rule
  const finalStars = Math.floor(
    (basePriceUSD / STAR_COST_USD) * MARKUP_MULTIPLIER
  )

  const finalRubles = finalPriceUSD * CURRENCY_RATES.USD_TO_RUB
  const numImages = params?.numImages ?? 1 // Default to 1 image if not specified

  const result: CostCalculationResult = {
    // Ensure non-negative values
    stars: Math.max(0, finalStars * numImages),
    rubles: Math.max(0, finalRubles * numImages),
    dollars: Math.max(0, finalPriceUSD * numImages),
  }

  // console.log(`[PriceCalc] Mode: ${mode}, Params: ${JSON.stringify(params)}, Result: ${JSON.stringify(result)}`);
  return result
}
