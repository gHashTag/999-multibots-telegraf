/**
 * USDC Top-up Options for x402 Crypto Payments
 *
 * Conversion rates based on:
 * - 1 star ≈ 2.3₽ (internal pricing)
 * - 1 USD ≈ 100₽ (approximate rate)
 * - Therefore: 1 USD ≈ 43.5 stars
 */

export interface UsdcTopUpOption {
  amountUsd: number
  stars: number
  label: string
  labelRu: string
}

/**
 * Static USDC top-up packages
 * Prices in USD, stars calculated at ~43.5 stars per $1
 */
export const usdcTopUpOptions: UsdcTopUpOption[] = [
  {
    amountUsd: 1,
    stars: 43,
    label: '$1 → 43 ⭐️',
    labelRu: '$1 → 43 ⭐️',
  },
  {
    amountUsd: 2,
    stars: 87,
    label: '$2 → 87 ⭐️',
    labelRu: '$2 → 87 ⭐️',
  },
  {
    amountUsd: 5,
    stars: 217,
    label: '$5 → 217 ⭐️',
    labelRu: '$5 → 217 ⭐️',
  },
  {
    amountUsd: 10,
    stars: 434,
    label: '$10 → 434 ⭐️',
    labelRu: '$10 → 434 ⭐️',
  },
  {
    amountUsd: 25,
    stars: 1085,
    label: '$25 → 1085 ⭐️',
    labelRu: '$25 → 1085 ⭐️',
  },
  {
    amountUsd: 50,
    stars: 2170,
    label: '$50 → 2170 ⭐️',
    labelRu: '$50 → 2170 ⭐️',
  },
  {
    amountUsd: 100,
    stars: 4340,
    label: '$100 → 4340 ⭐️',
    labelRu: '$100 → 4340 ⭐️',
  },
]

/**
 * Get USDC top-up option by amount
 */
export function getUsdcTopUpOption(
  amountUsd: number
): UsdcTopUpOption | undefined {
  return usdcTopUpOptions.find(opt => opt.amountUsd === amountUsd)
}

/**
 * Convert USD to stars
 * Rate: ~43.5 stars per $1
 */
export function usdToStarsForTopUp(usd: number): number {
  const STARS_PER_USD = 43.5
  return Math.floor(usd * STARS_PER_USD)
}

/**
 * Convert stars to USD
 */
export function starsToUsdForTopUp(stars: number): number {
  const STARS_PER_USD = 43.5
  return stars / STARS_PER_USD
}
