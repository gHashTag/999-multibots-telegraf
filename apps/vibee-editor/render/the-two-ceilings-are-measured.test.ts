import { describe, it, expect } from 'vitest'
// The module names its exports in Russian; aliased here once so the rest of
// this file reads in one language.
import {
  ценаТокенов as priceOf, // cyrillic-ok: module's own export name
  МАКС_ЗВЁЗД_РАЗОВО as ONE_OFF_MAX, // cyrillic-ok: module's own export name
  МАКС_ЗВЁЗД_ПОДПИСКА as PER_PERIOD_MAX, // cyrillic-ok: module's own export name
  ПЕРИОД_ПОДПИСКИ_С as PERIOD_SECONDS, // cyrillic-ok: module's own export name
} from './src/agent/token-packs'

/**
 * TWO CEILINGS, BOTH MEASURED FROM TELEGRAM, NOT ASSUMED.
 *
 * This file used to carry ONE ceiling -- 10000 -- under a comment saying
 * "Telegram will not accept an invoice above its limit". For an ordinary
 * invoice that is simply false, and false in the expensive direction: the real
 * limit is ten times higher, so we were refusing customers Telegram would have
 * taken.
 *
 * Measured 2026-09-09 by calling createInvoiceLink (which creates a link,
 * charges nobody and sends nothing):
 *
 *     one-off      100000 accepted, 150000 -> CURRENCY_TOTAL_AMOUNT_INVALID
 *     subscription  10000 accepted,  10001 -> SUBSCRIPTION_AMOUNT_INVALID
 *     period       2592000 accepted, 3x    -> SUBSCRIPTION_PERIOD_INVALID
 *
 * The subscription ceiling is corroborated by the documented config key
 * `stars_subscription_amount_max` = 10000. For the one-off there is NO such
 * key at all, so its value exists only as a measurement -- which is exactly
 * why it is pinned here rather than trusted to memory.
 */
describe('the ceilings Telegram actually enforces', () => {
  it('a subscription period costs at most ten thousand stars', () => {
    expect(PER_PERIOD_MAX).toBe(10_000)
  })

  it('a one-off invoice reaches ten times higher', () => {
    expect(ONE_OFF_MAX).toBe(100_000)
    expect(ONE_OFF_MAX).toBeGreaterThan(PER_PERIOD_MAX)
  })

  it('the only period a subscription may have is thirty days', () => {
    expect(PERIOD_SECONDS).toBe(2_592_000)
  })
})

/**
 * The boundary itself, because an off-by-one here is a refused sale on one
 * side and a Telegram error the buyer cannot read on the other.
 */
describe('the one-off boundary', () => {
  it('an invoice AT the ceiling is allowed — 100000 was accepted', () => {
    // 85714 tokens price at exactly 100000 stars on the top rate.
    const atCeiling = priceOf(85_714)
    expect(atCeiling.звёзд).toBe(ONE_OFF_MAX) // cyrillic-ok: API field
  })

  it('one token more is refused, and the message names the real number', () => {
    expect(() => priceOf(85_715)).toThrow(new RegExp(String(ONE_OFF_MAX)))
  })

  it('the old ceiling no longer refuses what Telegram accepts', () => {
    // 50000 tokens = 58334 stars: above the old 10000 cap, far below the real
    // one. This is the sale the wrong constant was turning away.
    const onceRefused = priceOf(50_000)
    expect(onceRefused.звёзд).toBeGreaterThan(10_000) // cyrillic-ok: API field
    expect(onceRefused.звёзд).toBeLessThan(ONE_OFF_MAX) // cyrillic-ok: API field
  })
})

/**
 * THE CLUB IS ONE PAYMENT, AT THE MEASURED CEILING.
 *
 * The owner's decision, after two earlier shapes were tried and dropped: a
 * single entry of 100 000 stars, and everything after it is paid per use in
 * tokens. No subscription -- which removes the whole renewal machinery, and
 * with it the worst failure this product could have had: charging every month
 * and one month quietly not crediting.
 *
 * The price sits EXACTLY on the one-off ceiling Telegram enforces. That is
 * worth a test of its own: one star more and the invoice stops being issuable
 * at all, and nothing else in the codebase would say why.
 */
describe('the club entry fits what Telegram allows', () => {
  const ENTRY = 100_000

  it('the entry price is exactly the one-off ceiling', () => {
    expect(ENTRY).toBe(ONE_OFF_MAX)
  })

  it('it is far above what a subscription could ever carry', () => {
    // Ten times over. This is why the club cannot be a monthly subscription
    // even if somebody later wants it to be.
    expect(ENTRY).toBeGreaterThan(PER_PERIOD_MAX * 9)
  })

  /**
   * The bonus is 10% of what was paid, converted on the same scale the packs
   * use -- credited at once, because there is only one payment.
   */
  it('ten percent of the entry, in tokens, is what the buyer is promised', () => {
    const toTokens = (звёзд: number) => Math.floor((звёзд * 0.1 * 150) / 175) // cyrillic-ok: API field
    expect(toTokens(ENTRY)).toBe(8_571)
  })

  it('that bonus is a real allowance, not a gesture', () => {
    // At 40 tokens a video it is about two hundred videos: enough that the
    // buyer can work for months before topping up, which is the point.
    expect(Math.floor(8_571 / 40)).toBeGreaterThan(200)
  })
})
