import { ModeEnum } from '@/interfaces/modes'
// import { Scenes } from 'telegraf' // Не используется
// import { MyContext } from '@/interfaces' // Не используется
// import { logger } from '@/utils/logger' // Не используется

// Star purchase limits
export const STAR_AMOUNTS = {
  min: 100,
  max: 10000,
  default: 1000,
}

// Speech-related costs (in stars)
// TODO: Перенести в pricing.config.ts?
export const SPEECH_COSTS = {
  [ModeEnum.TextToSpeech]: 10,
  [ModeEnum.Voice]: 50,
} as const

// Voice conversation cost (in stars)
// TODO: Перенести в pricing.config.ts?
export const VOICE_CONVERSATION_COST = 0.5

// Digital avatar costs per step (in dollars)
// TODO: Эти значения теперь должны браться из STEP_BASED_PRICES_USD в pricing.config.ts?
//       Проверить, используются ли эти константы где-либо еще.
// export const DIGITAL_AVATAR_COSTS = {
//   v1: 0.1, // DigitalAvatarBody
//   v2: 0.2, // DigitalAvatarBodyV2
// } as const

// === Цены на подписки ===
export const NEUROPHOTO_PRICE_RUB = 1110.0
export const NEUROBASE_PRICE_RUB = 2999.0

/**
 * Определяет тип подписки на основе суммы и валюты платежа.
 * @param amount Сумма платежа
 * @param currency Валюта платежа
 * @returns Тип подписки ('neurophoto', 'neurobase', 'stars') или null
 */
export const determineSubscriptionType = (
  amount: number,
  currency: string
): 'neurophoto' | 'neurobase' | 'stars' | null => {
  if (currency === 'RUB') {
    if (amount === NEUROPHOTO_PRICE_RUB) return 'neurophoto'
    if (amount === NEUROBASE_PRICE_RUB) return 'neurobase'
    return 'stars'
  } else if (currency === 'STARS' || currency === 'XTR') {
    return 'stars'
  } else {
    return null
  }
}

// Удаленные секции:
// - starCost, interestRate, SYSTEM_CONFIG
// - conversionRates, conversionRatesV2
// - calculateCostInStars, calculateCostInDollars, calculateCostInRubles, calculateCost
// - calculateFinalStarCostFromDollars
// - CostDetails interface (если она больше нигде не нужна)
// - costDetails object
// - BASE_COSTS, calculateModeCost, CostValue type (если больше не нужна)

// Оставляем stepOptions, так как они не связаны напрямую с расчетом цены
export const stepOptions = {
  v1: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000],
  v2: [100, 200, 300, 400, 500, 600, 700, 800, 1000],
}

// Удалена функция getCostValue, так как она работала со старой структурой modeCosts
// export function getCostValue(cost: number | ((param?: any) => number)): number {
//   return typeof cost === 'function' ? cost(1) : cost
// }
