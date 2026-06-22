// ============================================
// 💰 БАЗОВЫЕ КОНСТАНТЫ ЦЕНООБРАЗОВАНИЯ
// ============================================
// КРИТИЧЕСКИ ВАЖНО: Это ЕДИНСТВЕННОЕ место определения базовых цен!

/**
 * Стоимость 1 звезды в USD
 * Это базовая единица расчёта во всей системе
 */
export const STAR_COST_USD = 0.016

/**
 * Множитель наценки (markup)
 * 1.5 = 50% наценки на все услуги
 */
export const MARKUP_MULTIPLIER = 1.5

/**
 * Курс USD к RUB по умолчанию
 * Используется как fallback если динамический курс недоступен
 */
export const DEFAULT_USD_TO_RUB_RATE = 100 

/**
 * @deprecated Используйте getUsdToRubRate() для динамического курса
 */
export const USD_TO_RUB_RATE = DEFAULT_USD_TO_RUB_RATE

// Импортируем модуль для работы с курсом валют
import { getCurrentRate } from '@/modules/currency-rate'

/**
 * Получает актуальный курс USD к RUB динамически через Bybit API
 * @param fallback - значение по умолчанию если API недоступен
 * @returns Promise с актуальным курсом
 */
export async function getUsdToRubRate(
  fallback = DEFAULT_USD_TO_RUB_RATE
): Promise<number> {
  return await getCurrentRate({ fallback })
}

// Экспортируем для обратной совместимости
export const starCost = STAR_COST_USD
export const interestRate = MARKUP_MULTIPLIER
export const rubRate = USD_TO_RUB_RATE

// ============================================
// 🔄 РАСЧЁТНЫЕ ФУНКЦИИ КОНВЕРТАЦИИ
// ============================================

/**
 * Преобразует базовую стоимость в USD в количество звёзд с учётом наценки
 * @param baseCostUSD - базовая стоимость услуги в USD (себестоимость)
 * @returns количество звёзд (округлённое вниз)
 */
export function usdToStars(baseCostUSD: number): number {
  const starsBeforeMarkup = baseCostUSD / STAR_COST_USD
  const starsWithMarkup = starsBeforeMarkup * MARKUP_MULTIPLIER
  return Math.floor(starsWithMarkup)
}

/**
 * Преобразует количество звёзд в USD
 * @param stars - количество звёзд
 * @returns стоимость в USD
 */
export function starsToUSD(stars: number): number {
  return stars * STAR_COST_USD
}

/**
 * Преобразует количество звёзд в рубли
 * @param stars - количество звёзд
 * @returns стоимость в рублях
 */
export function starsToRUB(stars: number): number {
  const usd = starsToUSD(stars)
  return Math.round(usd * USD_TO_RUB_RATE)
}

/**
 * Преобразует рубли в количество звёзд
 * @param rub - сумма в рублях
 * @returns количество звёзд (округлённое вниз)
 */
export function rubToStars(rub: number): number {
  const usd = rub / USD_TO_RUB_RATE
  return usdToStars(usd)
}

/**
 * Рассчитывает цену в звёздах для видео модели с динамическим ценообразованием
 * @param pricePerSecondUSD - цена за секунду в USD
 * @param duration - длительность в секундах
 * @returns цена в звёздах
 */
export function calculateVideoPriceInStars(
  pricePerSecondUSD: number,
  duration: number
): number {
  const totalCostUSD = pricePerSecondUSD * duration
  return usdToStars(totalCostUSD)
}

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

// === Цены на подписки (новые тарифы) ===
export const BASIC_PRICE_RUB = 299.0
export const PRO_PRICE_RUB = 699.0
export const STUDIO_PRICE_RUB = 1999.0

// === Цены на подписки (legacy, для обратной совместимости) ===
/** @deprecated Use BASIC/PRO/STUDIO prices instead */
export const NEUROPHOTO_PRICE_RUB = 1110.0
/** @deprecated Use BASIC/PRO/STUDIO prices instead */
export const NEUROVIDEO_PRICE_RUB = 2999.0

/**
 * Определяет тип подписки по сумме платежа.
 * @param amount Сумма платежа в рублях.
 * @returns Тип подписки или null
 */
export const getSubscriptionTypeByAmount = (
  amount: number
): 'basic' | 'pro' | 'studio' | 'neurophoto' | 'neurovideo' | null => {
  if (amount === BASIC_PRICE_RUB) return 'basic'
  if (amount === PRO_PRICE_RUB) return 'pro'
  if (amount === STUDIO_PRICE_RUB) return 'studio'
  // Legacy amounts for backward compatibility
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
