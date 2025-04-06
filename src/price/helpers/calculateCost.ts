import { ModeEnum } from '@/interfaces/modes.interface'
import { logger } from '@/utils/logger'
import {
  conversionRates,
  conversionRatesV2,
  CostDetails,
} from '../priceCalculator'

export function calculateCostInStars(
  steps: number,
  version: 'v1' | 'v2' = 'v1'
): CostDetails {
  const rates = version === 'v1' ? conversionRates : conversionRatesV2

  logger.debug({
    message: '💰 Расчет стоимости операции',
    description: 'Calculating operation cost',
    version,
    steps,
  })

  const baseCost = steps * rates.costPerStepInStars

  logger.debug({
    message: 'baseCost',
    description: 'Base cost calculated',
    version,
    baseCost,
  })

  return {
    steps,
    stars: parseFloat(baseCost.toFixed(2)),
    dollars: parseFloat((baseCost * rates.costPerStarInDollars).toFixed(2)),
    rubles: parseFloat(
      (
        baseCost *
        rates.costPerStarInDollars *
        rates.rublesToDollarsRate
      ).toFixed(2)
    ),
  }
}

export function calculateCostInDollars(
  steps: number,
  rates: { costPerStepInStars: number; costPerStarInDollars: number }
): number {
  const totalCostInDollars =
    steps * rates.costPerStepInStars * rates.costPerStarInDollars
  return parseFloat(totalCostInDollars.toFixed(2))
}

export function calculateCostInRubles(
  steps: number,
  rates: {
    costPerStepInStars: number
    costPerStarInDollars: number
    rublesToDollarsRate: number
  }
): number {
  const totalCostInRubles =
    steps *
    rates.costPerStepInStars *
    rates.costPerStarInDollars *
    rates.rublesToDollarsRate
  return parseFloat(totalCostInRubles.toFixed(2))
}

/**
 * Опции шагов для разных версий:
 * v1 - тренировка модели (больше шагов, дольше время, лучше качество)
 * v2 - быстрая генерация (меньше шагов, быстрее время, среднее качество)
 */
export const stepOptions = {
  // v1 - классическая тренировка модели с большим количеством шагов
  v1: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000],
  // v2 - быстрая генерация с меньшим количеством шагов
  v2: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
}

export const costDetails = {
  v1: stepOptions.v1.map(steps => calculateCost(steps, 'v1')),
  v2: stepOptions.v2.map(steps => calculateCost(steps, 'v2')),
}

export function calculateCost(
  steps: number,
  version: 'v1' | 'v2' = 'v1'
): CostDetails {
  const rates = version === 'v1' ? conversionRates : conversionRatesV2
  logger.debug({
    message: '💰 Расчет стоимости операции',
    description: 'Calculating operation cost',
    version,
    steps,
  })
  const baseCost = steps * rates.costPerStepInStars
  logger.debug({
    message: 'baseCost',
    description: 'Base cost calculated',
    version,
    baseCost,
  })
  return {
    steps,
    stars: parseFloat(baseCost.toFixed(2)),
    dollars: parseFloat((baseCost * rates.costPerStarInDollars).toFixed(2)),
    rubles: parseFloat(
      (
        baseCost *
        rates.costPerStarInDollars *
        rates.rublesToDollarsRate
      ).toFixed(2)
    ),
  }
}

// Тестовый расчет
logger.debug({
  message: '🧪 Тестовый расчет V1',
  description: 'Test calculations V1',
})
stepOptions.v1.forEach(steps => {
  const cost = calculateCost(steps, 'v1')
  logger.debug({
    message: '📊 Результат расчета',
    description: 'Calculation result',
    steps,
    stars: cost.stars,
    rubles: cost.rubles,
  })
})

logger.debug({
  message: '🧪 Тестовый расчет V2',
  description: 'Test calculations V2',
})
stepOptions.v2.forEach(steps => {
  const cost = calculateCost(steps, 'v2')
  logger.debug({
    message: '📊 Результат расчета',
    description: 'Calculation result',
    steps,
    stars: cost.stars,
    rubles: cost.rubles,
  })
})

export function calculateModeCost(
  mode: ModeEnum,
  steps?: number,
  numImages = 1
): CostDetails {
  // Определяем версию на основе режима
  const version = mode === ModeEnum.NeuroPhotoV2 ? 'v2' : 'v1'
  const rates = version === 'v1' ? conversionRates : conversionRatesV2
  const baseCost = steps
    ? steps * rates.costPerStepInStars
    : getDefaultBaseCost(mode)

  logger.debug({
    message: '💰 Расчет стоимости операции',
    description: 'Calculating operation cost',
    mode,
    steps,
    numImages,
  })

  const cost = {
    steps: steps || Math.round(baseCost / rates.costPerStepInStars),
    stars: parseFloat(baseCost.toFixed(2)),
    dollars: parseFloat((baseCost * rates.costPerStarInDollars).toFixed(2)),
    rubles: parseFloat(
      (
        baseCost *
        rates.costPerStarInDollars *
        rates.rublesToDollarsRate
      ).toFixed(2)
    ),
  }

  logger.debug({
    message: '✅ Стоимость рассчитана',
    description: 'Cost calculation completed',
    mode,
    stars: cost.stars,
    dollars: cost.dollars,
    rubles: cost.rubles,
  })

  return cost
}

/**
 * Получает базовую стоимость для режима
 * @param mode - режим работы
 * @param steps - количество шагов (опционально)
 * @returns базовая стоимость в звездах
 */
function getDefaultBaseCost(mode: ModeEnum): number {
  switch (mode) {
    case ModeEnum.NeuroPhoto:
      // Классическая версия с тренировкой модели
      return 5 // Базовая стоимость для полной тренировки
    case ModeEnum.NeuroPhotoV2:
      // Быстрая версия с меньшим количеством шагов
      return 8.75 // Повышенная стоимость за быструю генерацию
    case ModeEnum.ImageToPrompt:
      return 1.88
    default:
      return 5
  }
}
