export function calculateCostInStars(
  steps: number,
  rates: { costPerStepInStars: number }
): number {
  const totalCostInStars = steps * rates.costPerStepInStars
  return parseFloat(totalCostInStars.toFixed(2))
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

export function calculateTrainingCost(
  steps: number,
  version: 'v1' | 'v2'
): number {
  // Базовая стоимость за шаг
  const baseStepCost = version === 'v1' ? 0.25 : 0.35 // v1 = 0.25 звезд за шаг, v2 = 0.35 звезд за шаг

  // Расчет общей стоимости
  return Math.round(steps * baseStepCost)
}
