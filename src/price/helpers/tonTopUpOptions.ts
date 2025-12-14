/**
 * TON USDT Top-Up Options
 *
 * Варианты пополнения баланса через USDT на TON блокчейне
 * Курс: ~$0.023 за 1 звезду (такой же как x402 USDC)
 */

export interface TonTopUpOption {
  usdt: number // Сумма в USDT
  stars: number // Получаемые звёзды
  labelRu: string // Русская метка
  labelEn: string // Английская метка
}

/**
 * Стандартные варианты пополнения
 * Курс: 1 USDT ≈ 43.4 звезды
 */
export const tonUsdtTopUpOptions: TonTopUpOption[] = [
  { usdt: 5, stars: 217, labelRu: '$5 → 217⭐', labelEn: '$5 → 217⭐' },
  { usdt: 10, stars: 434, labelRu: '$10 → 434⭐', labelEn: '$10 → 434⭐' },
  { usdt: 25, stars: 1085, labelRu: '$25 → 1085⭐', labelEn: '$25 → 1085⭐' },
  { usdt: 50, stars: 2170, labelRu: '$50 → 2170⭐', labelEn: '$50 → 2170⭐' },
  { usdt: 100, stars: 4340, labelRu: '$100 → 4340⭐', labelEn: '$100 → 4340⭐' },
]

/**
 * Получить вариант по сумме USDT
 */
export function getTonTopUpOption(usdt: number): TonTopUpOption | undefined {
  return tonUsdtTopUpOptions.find((opt) => opt.usdt === usdt)
}

/**
 * Рассчитать звёзды для произвольной суммы USDT
 * Курс: 43.4 звезды за 1 USDT
 */
export function calculateStarsForUsdt(usdt: number): number {
  const STARS_PER_USDT = 43.4
  return Math.floor(usdt * STARS_PER_USDT)
}

/**
 * Генерация уникального invoice ID для TON платежа
 */
export function generateTonInvoiceId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `TON-${timestamp}-${random}`
}

// =============================================================================
// Native TON (не USDT) - варианты пополнения
// =============================================================================

export interface TonNativeTopUpOption {
  ton: number // Сумма в TON
  usdEquivalent: number // Примерный эквивалент в USD (при курсе ~$6)
  stars: number // Получаемые звёзды
  labelRu: string
  labelEn: string
}

/**
 * Фиксированный курс TON к USD
 * Обновлять при значительных изменениях курса
 */
export const TON_PRICE_USD = 6

/**
 * Стандартные варианты пополнения нативным TON
 * Курс: ~$6 за TON, 43.4 звезды за $1
 * 1 TON ≈ 6 * 43.4 ≈ 260 звёзд
 */
export const tonNativeTopUpOptions: TonNativeTopUpOption[] = [
  {
    ton: 1,
    usdEquivalent: 6,
    stars: 260,
    labelRu: '1 TON (~$6) → 260⭐',
    labelEn: '1 TON (~$6) → 260⭐',
  },
  {
    ton: 2,
    usdEquivalent: 12,
    stars: 520,
    labelRu: '2 TON (~$12) → 520⭐',
    labelEn: '2 TON (~$12) → 520⭐',
  },
  {
    ton: 5,
    usdEquivalent: 30,
    stars: 1300,
    labelRu: '5 TON (~$30) → 1300⭐',
    labelEn: '5 TON (~$30) → 1300⭐',
  },
  {
    ton: 10,
    usdEquivalent: 60,
    stars: 2600,
    labelRu: '10 TON (~$60) → 2600⭐',
    labelEn: '10 TON (~$60) → 2600⭐',
  },
  {
    ton: 20,
    usdEquivalent: 120,
    stars: 5200,
    labelRu: '20 TON (~$120) → 5200⭐',
    labelEn: '20 TON (~$120) → 5200⭐',
  },
]

/**
 * Получить вариант по сумме TON
 */
export function getTonNativeTopUpOption(
  ton: number
): TonNativeTopUpOption | undefined {
  return tonNativeTopUpOptions.find((opt) => opt.ton === ton)
}

/**
 * Рассчитать звёзды для произвольной суммы TON
 * Курс: TON_PRICE_USD * 43.4 звезды
 */
export function calculateStarsForTon(
  ton: number,
  tonPriceUsd: number = TON_PRICE_USD
): number {
  const STARS_PER_USD = 43.4
  return Math.floor(ton * tonPriceUsd * STARS_PER_USD)
}

/**
 * Генерация уникального invoice ID для нативного TON платежа
 */
export function generateTonNativeInvoiceId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `TONN-${timestamp}-${random}`
}
