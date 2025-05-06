import { SubscriptionType } from '@/interfaces/subscription.interface'

// Базовые константы
const COST_PER_STEP_IN_STARS = 0.22
const COST_PER_STEP_IN_STARS_V2 = 0.5
const RUBLES_TO_DOLLARS_RATE = 80
const STAR_COST = 0.016 // Стоимость одной звезды в долларах

// Стоимость шага в долларах и рублях
export const stepCostInDollars = STAR_COST * COST_PER_STEP_IN_STARS
export const stepCostInRubles = stepCostInDollars * RUBLES_TO_DOLLARS_RATE

export interface PaymentOption {
  amount: number
  stars: string
  subscription?: SubscriptionType
  isAdminOnly?: boolean
}

// У нас два тарифных плана, не менять!!!
export const paymentOptionsPlans: PaymentOption[] = [
  { amount: 1110, stars: '476', subscription: SubscriptionType.NEUROPHOTO },
  { amount: 2999, stars: '1303', subscription: SubscriptionType.NEUROBASE },
  {
    subscription: SubscriptionType.NEUROTESTER,
    amount: 1, // Price in rubles/currency
    stars: '1', // Возвращаем к строке
    isAdminOnly: true, // Flag for admin-only plans
  },
  {
    subscription: SubscriptionType.NEUROTESTER,
    amount: 1,
    stars: '1',
  },
]

export const paymentOptions: PaymentOption[] = [
  { amount: 500, stars: '217' },
  { amount: 1000, stars: '434' },
  { amount: 2000, stars: '869' },
  { amount: 5000, stars: '2173' },
  { amount: 10000, stars: '4347' },
  { amount: 1, stars: '1' },
  // { amount: 10, stars: '6' },
]

export interface ConversionRates {
  costPerStarInDollars: number
  costPerStepInStars: number
  rublesToDollarsRate: number
}

// Определяем конверсии
export const conversionRates: ConversionRates = {
  costPerStepInStars: COST_PER_STEP_IN_STARS,
  costPerStarInDollars: STAR_COST,
  rublesToDollarsRate: RUBLES_TO_DOLLARS_RATE,
}

export const conversionRatesV2: ConversionRates = {
  costPerStepInStars: COST_PER_STEP_IN_STARS_V2,
  costPerStarInDollars: STAR_COST,
  rublesToDollarsRate: RUBLES_TO_DOLLARS_RATE,
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
  const stars = steps * rates.costPerStepInStars
  const dollars = stars * rates.costPerStarInDollars
  const rubles = dollars * rates.rublesToDollarsRate

  return {
    steps,
    stars: parseFloat(stars.toFixed(2)),
    dollars: parseFloat(dollars.toFixed(2)),
    rubles: parseFloat(rubles.toFixed(2)),
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
  v1: [1000, 1500, 2000, 2500, 3000, 3500, 4000],
  v2: [100, 200, 300, 400, 500, 600, 700, 800, 1000],
}

export const costDetails = {
  v1: stepOptions.v1.map(steps => calculateCost(steps, 'v1')),
  v2: stepOptions.v2.map(steps => calculateCost(steps, 'v2')),
}

// Функция для расчета базовой цены
export function calculateBasePrice(
  steps: number,
  version: 'v1' | 'v2' = 'v1'
): number {
  const rates = version === 'v1' ? conversionRates : conversionRatesV2
  const stars = steps * rates.costPerStepInStars
  return parseFloat(stars.toFixed(2))
}

// Функция для расчета итоговой цены
export function calculateFinalPrice(
  steps: number,
  version: 'v1' | 'v2' = 'v1'
): number {
  const basePrice = calculateBasePrice(steps, version)
  return basePrice
}

// Функция для расчета цены в рублях
export function calculateRubPrice(
  steps: number,
  version: 'v1' | 'v2' = 'v1'
): number {
  const rates = version === 'v1' ? conversionRates : conversionRatesV2
  const dollars =
    calculateBasePrice(steps, version) * rates.costPerStarInDollars
  const rubles = dollars * rates.rublesToDollarsRate
  return parseFloat(rubles.toFixed(2))
}
