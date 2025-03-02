interface ConversionRates {
  costPerStarInDollars: number
  costPerStepInStars: number
  rublesToDollarsRate: number
}

// Определяем конверсии
export const conversionRates: ConversionRates = {
  costPerStepInStars: 0.25,
  costPerStarInDollars: 0.016,
  rublesToDollarsRate: 100,
}
export interface CostDetails {
  steps: number
  stars: number
  rubles: number
  dollars: number
}

// Основная функция расчета стоимости
export function calculateCost(steps: number): CostDetails {
  const baseCost = steps * conversionRates.costPerStepInStars

  return {
    steps,
    stars: baseCost,
    dollars: baseCost * conversionRates.costPerStarInDollars,
    rubles:
      baseCost *
      conversionRates.costPerStarInDollars *
      conversionRates.rublesToDollarsRate,
  }
}

// Функция форматирования стоимости
export function formatCost(cost: CostDetails, isRu: boolean): string {
  if (isRu) {
    return `${cost.steps} шагов - ${cost.stars.toFixed(
      0
    )}⭐ / ${cost.rubles.toFixed(0)}₽`
  }
  return `${cost.steps} steps - ${cost.stars.toFixed(
    0
  )}⭐ / $${cost.dollars.toFixed(2)}`
}

// Функция генерации сообщения
export function generateCostMessage(
  costDetails: CostDetails[],
  isRu: boolean
): string {
  const baseMessage = isRu
    ? '🔢 Пожалуйста, выберите количество шагов для обучения модели.\n\n📈 Чем больше шагов, тем лучше качество, но это будет стоить дороже. 💰\n\n💰 Стоимость:\n'
    : '🔢 Please choose the number of steps for model training.\n\n📈 The more steps, the better the quality, but it will cost more. 💰\n\n💰 Cost:\n'

  return (
    baseMessage + costDetails.map(detail => formatCost(detail, isRu)).join('\n')
  )
}

// Предопределенные шаги
export const stepOptions: number[] = [
  1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000,
]

// Предварительно рассчитанные стоимости
export const costDetails = stepOptions.map(steps => calculateCost(steps))
