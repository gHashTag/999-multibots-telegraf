// Объявления констант без циклических зависимостей
// Объявляем примитивные значения самыми первыми

// Экспортируем примитивные значения
export const starCost = 0.016
export const interestRate = 1.5

// Теперь создаем объект конфигурации на основе этих значений
export const SYSTEM_CONFIG = {
  starCost: starCost,
  interestRate: interestRate,
  currency: 'RUB',
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
export const SPEECH_COSTS = {
  [ModeEnum.TextToSpeech]: 10,
  [ModeEnum.Voice]: 50,
} as const

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
