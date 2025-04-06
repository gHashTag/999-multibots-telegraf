import { ModeEnum } from '@/price/helpers/modelsCost'
import {
  conversionRates,
  conversionRatesV2,
  CostDetails,
  ConversionRates,
} from '../priceCalculator'

/**
 * Получает настройки конверсии для режима
 */
export function getConversionRates(mode: ModeEnum): ConversionRates {
  // Для режимов v2 используем новые настройки
  if (mode === ModeEnum.NeuroPhotoV2) {
    return conversionRatesV2
  }
  return conversionRates
}

/**
 * Получает базовую стоимость для режима
 */
export function getBaseCost(mode: ModeEnum, steps?: number): number {
  // Если указаны шаги, используем их
  if (steps) {
    return steps * getConversionRates(mode).costPerStepInStars
  }

  // Иначе используем фиксированную стоимость для каждого режима
  switch (mode) {
    case ModeEnum.NeuroPhoto:
      return 5
    case ModeEnum.NeuroPhotoV2:
      return 8.75
    case ModeEnum.ImageToPrompt:
      return 1.88
    default:
      return 5 // Базовая стоимость по умолчанию
  }
}

/**
 * Рассчитывает полную стоимость на основе базовой
 */
export function calculateCostFromBase(
  baseCost: number,
  rates: ConversionRates = conversionRates
): CostDetails {
  const dollars = baseCost * rates.costPerStarInDollars
  const rubles = dollars * rates.rublesToDollarsRate

  return {
    steps: Math.round(baseCost / rates.costPerStepInStars),
    stars: parseFloat(baseCost.toFixed(2)),
    dollars: parseFloat(dollars.toFixed(2)),
    rubles: parseFloat(rubles.toFixed(2)),
  }
}
