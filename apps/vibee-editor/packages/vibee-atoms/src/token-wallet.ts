import {
  MARKUP_PCT,
  MICRO_PER_USD,
  MONTH_DAYS,
  PORTRAIT_TOKENS,
  REEL_TOKENS,
  START_TOKENS,
  TOKEN_MICRO_USD,
  WARN_DAYS_FIRST,
} from './spec/token-wallet.gen'

/**
 * THE TOKEN WALLET -- what a dollar buys, what an operation costs, when tokens
 * burn. The numbers come from specs/automation/token-wallet.t27 (vendored in
 * ./spec); this module only does the arithmetic the spec's functions describe,
 * and spec/token-wallet.test.ts runs the spec's own vectors against it.
 *
 * Read by the mini app (welcome screen, package cards) and by render's billing,
 * so the rate a package month is sold at and the rate every price is made at
 * are one number.
 */
export {
  MARKUP_PCT,
  MONTH_DAYS,
  PORTRAIT_TOKENS,
  REEL_TOKENS,
  START_TOKENS,
  WARN_DAYS_FIRST,
}

/** One token, in dollars. */
export const TOKEN_USD = TOKEN_MICRO_USD / MICRO_PER_USD

/** Sale price over cost. */
export const MARKUP = MARKUP_PCT / 100

/** Dollars a month to tokens a month: nothing is kept back. */
export function monthTokens(usd: number): number {
  return Math.floor((usd * MICRO_PER_USD) / TOKEN_MICRO_USD)
}

/** An operation's price from its cost in micro-dollars, rounded up. */
export function priceTokens(costMicroUsd: number): number {
  return Math.ceil((costMicroUsd * MARKUP_PCT) / 100 / TOKEN_MICRO_USD)
}

/** Whole reels a number of tokens buys. */
export function reelsIn(tokens: number): number {
  return Math.floor(tokens / REEL_TOKENS)
}

/** Whole portraits a number of tokens buys. */
export function portraitsIn(tokens: number): number {
  return Math.floor(tokens / PORTRAIT_TOKENS)
}

/** Days left before a batch granted on `grantedDay` burns (0 when gone). */
export function daysLeft(
  grantedDay: number,
  today: number,
  life: number = MONTH_DAYS
): number {
  return Math.max(0, grantedDay + life - today)
}
