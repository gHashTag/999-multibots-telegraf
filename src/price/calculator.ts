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
 * @param params Optional parameters specific to the mode (e.g., steps, modelId, seconds, numImages).
 * @returns An object with stars, rubles, and dollars, or null if price cannot be determined.
 */
export function calculateFinalStarPrice(
  mode: ModeEnum | string,
  params?: CalculationParams
): CostCalculationResult | null {
  let basePriceUSD: number | undefined = undefined
  const modeKey = mode as ModeEnum // Use enum key for lookups
  const numImagesMultiplier =
    params?.numImages && params.numImages > 0 ? params.numImages : 1
  let applyNumImagesMultiplier = false // Flag to control when to apply numImages

  // 1. Determine Base Price in USD based on priority
  // Priority 1: Step-based pricing
  if (params?.steps && params.steps > 0 && STEP_BASED_PRICES_USD[modeKey]) {
    basePriceUSD = (STEP_BASED_PRICES_USD[modeKey] ?? 0) * params.steps
    // console.log(`[PriceCalc] Mode: ${mode}, Type: Step, Steps: ${params.steps}, BaseUSD: ${basePriceUSD}`);
  }
  // Priority 2: Model-based pricing
  else if (params?.modelId) {
    const videoModelConfigs = modelsConfig.VIDEO_MODELS_CONFIG ?? {}
    const imageModels = modelsConfig.IMAGES_MODELS ?? {}
    const videoModelConfig = videoModelConfigs[params.modelId]
    const imageModelConfig = imageModels[params.modelId]

    if (videoModelConfig && typeof videoModelConfig.basePrice === 'number') {
      basePriceUSD = videoModelConfig.basePrice
      // console.log(`[PriceCalc] Mode: ${mode}, Type: Video Model, Model: ${params.modelId}, BaseUSD: ${basePriceUSD}`);
    }
    // *** Check imageModels using correct name ***
    else if (
      imageModelConfig &&
      typeof imageModelConfig.basePrice === 'number'
    ) {
      basePriceUSD = imageModelConfig.basePrice
      applyNumImagesMultiplier = true // Apply numImages only for image models (and fixed base price below)
      // console.log(`[PriceCalc] Mode: ${mode}, Type: Image Model, Model: ${params.modelId}, BaseUSD: ${basePriceUSD}`);
    } else {
      console.warn(
        `[PriceCalc] Video/Image model config or basePrice not found for modelId: ${params.modelId}`
      )
      // Fall through to check fixed base price
    }
  }

  // Priority 3: Fixed base price (if not determined above)
  if (basePriceUSD === undefined && BASE_PRICES_USD[modeKey] !== undefined) {
    basePriceUSD = BASE_PRICES_USD[modeKey]
    // Apply numImages multiplier also for fixed price modes that might represent images
    // (Needs refinement if some fixed modes shouldn't use numImages)
    if (modeKey === ModeEnum.NeuroPhoto || modeKey === ModeEnum.NeuroPhotoV2) {
      // Be specific for now
      applyNumImagesMultiplier = true
    }
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

  // *** Apply numImagesMultiplier BEFORE calculating stars ***
  const effectiveMultiplier = applyNumImagesMultiplier ? numImagesMultiplier : 1
  const totalBasePriceUSD = basePriceUSD * effectiveMultiplier

  const finalPriceUSD = totalBasePriceUSD * MARKUP_MULTIPLIER

  // Calculate stars using floor as per rule
  // *** Use totalBasePriceUSD for star calculation ***
  const finalStars = Math.floor(
    (totalBasePriceUSD / STAR_COST_USD) * MARKUP_MULTIPLIER
  )

  const finalRubles = finalPriceUSD * CURRENCY_RATES.USD_TO_RUB

  const result: CostCalculationResult = {
    // Ensure non-negative values
    stars: Math.max(0, finalStars),
    rubles: Math.max(0, finalRubles),
    dollars: Math.max(0, finalPriceUSD),
  }

  // console.log(`[PriceCalc] Mode: ${mode}, Params: ${JSON.stringify(params)}, Result: ${JSON.stringify(result)}`);
  return result
}
