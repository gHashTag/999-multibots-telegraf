import { Subscription } from '@/interfaces/supabase.interface'

export const paymentOptionsPlans: {
  amount: number
  stars: string
  subscription: Subscription
}[] = [
  { amount: 1110, stars: '476', subscription: 'neurophoto' },
  { amount: 2999, stars: '1303', subscription: 'neurobase' },
  { amount: 75000, stars: '32608', subscription: 'neuroblogger' },
  { amount: 5, stars: '5', subscription: 'neurotester' },
]

export const paymentOptions: {
  amount: number
  stars: string
}[] = [
  { amount: 500, stars: '217' },
  { amount: 1000, stars: '434' },
  { amount: 2000, stars: '869' },
  { amount: 5000, stars: '2173' },
  { amount: 10000, stars: '4347' },
  { amount: 1, stars: '9' },
  // { amount: 10, stars: '6' },
]

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

export const conversionRatesV2: ConversionRates = {
  costPerStepInStars: 2.1,
  costPerStarInDollars: 0.016,
  rublesToDollarsRate: 100,
}
export interface CostDetails {
  steps: number
  stars: number
  rubles: number
  dollars: number
}

export function calculateCost(
  steps: number,
  version: 'v1' | 'v2' = 'v1'
): CostDetails {
  const rates = version === 'v1' ? conversionRates : conversionRatesV2
  const baseCost = steps * rates.costPerStepInStars

  return {
    steps,
    stars: baseCost,
    dollars: baseCost * rates.costPerStarInDollars,
    rubles: baseCost * rates.costPerStarInDollars * rates.rublesToDollarsRate,
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

export function generateCostMessage(
  steps: number[],
  isRu: boolean,
  version: 'v1' | 'v2' = 'v1'
): string {
  const baseMessage = isRu
    ? '🔢 Пожалуйста, выберите количество шагов для обучения модели.\n\n📈 Чем больше шагов, тем лучше качество, но это будет стоить дороже. 💰\n\n💰 Стоимость:\n'
    : '🔢 Please choose the number of steps for model training.\n\n📈 The more steps, the better the quality, but it will cost more. 💰\n\n💰 Cost:\n'

  const costDetails = steps.map(steps => calculateCost(steps, version))
  return (
    baseMessage + costDetails.map(detail => formatCost(detail, isRu)).join('\n')
  )
}

export const stepOptions = {
  v1: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000],
  v2: [100, 200, 300, 400, 500, 600, 700, 800, 1000],
}

export const costDetails = {
  v1: stepOptions.v1.map(steps => calculateCost(steps, 'v1')),
  v2: stepOptions.v2.map(steps => calculateCost(steps, 'v2')),
}
