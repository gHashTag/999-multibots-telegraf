// Импортируем единые константы из централизованной конфигурации
import {
  STAR_COST_USD,
  MARKUP_MULTIPLIER,
} from '@/config/unified-pricing.config'

// Импортируем модуль для работы с курсом валют
import { getCurrentRate } from '@/modules/currency-rate'

// Экспортируем для обратной совместимости
export const starCost = STAR_COST_USD
export const interestRate = MARKUP_MULTIPLIER

// Создаем объект конфигурации
export const SYSTEM_CONFIG = {
  starCost: STAR_COST_USD,
  interestRate: MARKUP_MULTIPLIER,
  currency: 'RUB',
  subscriptionBonus: 0.0,
  getRubRate: async () => await getCurrentRate(),
}

// Импорт типов после объявления примитивных констант
import { ModeEnum } from '@/interfaces/modes'

// Star purchase limits
export const STAR_AMOUNTS = {
  min: 100,
  max: 10000,
  default: 1000,
}

// Speech-related costs (in stars)
// export const SPEECH_COSTS = {
//   TextToSpeech: 10,
//   Voice: 50,
// }

// Voice conversation cost (in stars)
export const VOICE_CONVERSATION_COST = 0.5

// Digital avatar costs per step (in dollars)
export const DIGITAL_AVATAR_COSTS = {
  v1: 0.1, // DigitalAvatarBody
  v2: 0.2, // DigitalAvatarBodyV2
} as const

// === Цены на подписки ===
export const NEUROPHOTO_PRICE_RUB = 1110.0
export const NEUROVIDEO_PRICE_RUB = 2999.0

/**
 * Определяет тип подписки по сумме платежа.
 * @param amount Сумма платежа в рублях.
 * @returns Тип подписки ('neurophoto', 'neurovideo') или null
 */
export const getSubscriptionTypeByAmount = (
  amount: number
): 'neurophoto' | 'neurovideo' | null => {
  if (amount === NEUROPHOTO_PRICE_RUB) return 'neurophoto'
  if (amount === NEUROVIDEO_PRICE_RUB) return 'neurovideo'
  return null
}

export const {
  starCost: systemStarCost,
  interestRate: systemInterestRate,
  subscriptionBonus,
  getRubRate,
} = SYSTEM_CONFIG

export const conversionRates = {
  // ... existing code ...
}
