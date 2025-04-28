import { SubscriptionType } from '@/interfaces/subscription.interface'

// Удалены дублирующие константы (COST_PER_STEP_IN_STARS, STAR_COST и т.д.)
// Они теперь берутся из pricing.config.ts

// // Стоимость шага в долларах и рублях (Удалено, т.к. зависит от удаленных констант)
// export const stepCostInDollars = STAR_COST * COST_PER_STEP_IN_STARS
// export const stepCostInRubles = stepCostInDollars * RUBLES_TO_DOLLARS_RATE

export interface PaymentOption {
  amount: number
  stars: string
  subscription?: SubscriptionType
}

// Оставляем опции оплаты
export const paymentOptionsPlans: PaymentOption[] = [
  { amount: 1110, stars: '476', subscription: SubscriptionType.NEUROPHOTO },
  { amount: 2999, stars: '1303', subscription: SubscriptionType.NEUROBASE },
  {
    amount: 75000,
    stars: '32608',
    subscription: SubscriptionType.NEUROBLOGGER,
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

// Удалены ConversionRates, conversionRates, conversionRatesV2

// Интерфейс оставляем, т.к. может использоваться где-то еще
export interface CostDetails {
  steps: number
  stars: number
  rubles: number
  dollars: number
}

// Удалена функция calculateCost
// export function calculateCost(...) { ... }

// Комментируем функции форматирования для проверки использования
/*
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

  // Эта часть не будет работать без calculateCost
  // const costDetails = steps.map(steps => calculateCost(steps, version))
  // return (
  //   baseMessage + costDetails.map(detail => formatCost(detail, isRu)).join('\n')
  // )
  logger.warn('generateCostMessage requires calculateCost, which was removed. Returning base message only.');
  return baseMessage; // Возвращаем только базовое сообщение
}
*/

// Оставляем stepOptions
export const stepOptions = {
  v1: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000],
  v2: [100, 200, 300, 400, 500, 600, 700, 800, 1000],
}

// Удален costDetails
// export const costDetails = { ... }
