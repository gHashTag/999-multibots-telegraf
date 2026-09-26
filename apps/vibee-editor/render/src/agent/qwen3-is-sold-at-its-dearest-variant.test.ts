/**
 * QWEN 3 IS SOLD AT ITS DEAREST VARIANT, AND NOTHING ELSE MOVES.
 *
 * Owner, 2026-09-26: "raise only qwen3 to 10". `qwen3/text-to-image` matches
 * Kie price-list rows from $0.0025 to $0.024 a picture and the request does
 * not pick one; priced at the cheapest it sold for 1 token -- the one
 * LOSS AT DEAREST in `tri margin`. The rule is pinned from the price itself,
 * what the app and the Mini App are told (/api/balance), the margin report,
 * and -- the half a blanket change would break -- the models it must NOT
 * touch.
 */
import { describe, expect, it } from 'vitest'
import {
  COST_PER_TOKEN_USD,
  НАЦЕНКА, // cyrillic-ok: existing export name
  PRICED_AT_DEAREST,
  kieCostUsd,
  priceForKieModel,
  модельныеЦены, // cyrillic-ok: existing export name
} from './billing-shared'
import { DEAREST_VARIANT_USD } from './kie-prices.generated'
import { marginReport } from './margin-report'

const QWEN3 = 'qwen3/text-to-image'
const tokensFor = (usd: number) =>
  Math.ceil(Number(((usd * НАЦЕНКА) / COST_PER_TOKEN_USD).toFixed(6))) // cyrillic-ok: existing export name

describe('qwen3 is priced at its dearest variant', () => {
  it('the price list really spreads it (negative control)', () => {
    expect(DEAREST_VARIANT_USD[QWEN3]).toBeGreaterThan(
      Number(kieCostUsd(QWEN3))
    )
  })

  it('costs the dearest variant x markup: 10 tokens, not 1', () => {
    const dearest = DEAREST_VARIANT_USD[QWEN3] as number
    expect(priceForKieModel(QWEN3)).toBe(tokensFor(dearest))
    expect(priceForKieModel(QWEN3)).toBe(10)
  })

  it('the app and the Mini App are quoted the same number', () => {
    expect(модельныеЦены()[`kie/${QWEN3}`]).toBe(priceForKieModel(QWEN3)) // cyrillic-ok: existing export name
  })

  it('the margin report shows it with no loss and no floor broken at the dearest', () => {
    const row = marginReport().rows.find(r => r.model === `kie/${QWEN3}`)
    expect(row, 'qwen3 in the margin report').toBeTruthy()
    expect(row!.flags).toEqual([])
  })

  it('ONLY qwen3: every other model keeps its cheapest-variant price', () => {
    expect(PRICED_AT_DEAREST).toEqual([QWEN3])
    const spread = Object.keys(DEAREST_VARIANT_USD).filter(
      id =>
        id !== QWEN3 &&
        kieCostUsd(id) != null &&
        (DEAREST_VARIANT_USD[id] as number) > (kieCostUsd(id) as number)
    )
    // The seven the owner chose to leave as they are -- still at the cheapest.
    expect(spread.length).toBeGreaterThan(0)
    for (const id of spread) {
      const price = priceForKieModel(id)
      if (price == null) continue // a video the sale rule refuses
      expect(price, id).toBe(tokensFor(kieCostUsd(id) as number))
    }
  })
})
