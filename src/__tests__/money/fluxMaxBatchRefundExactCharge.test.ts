/**
 * generateFluxKontextMax is called in aiPhotoshopScene's ALL_MODELS batch with
 * skipBalanceCheck: true, AFTER the scene charged costPerImage = modelCost *
 * qualityMultiplier(size), where modelCost = calculateFinalPriceInStars(0.08,
 * 0.016, 2.4) = 12 stars. On failure the service refunded the FLAT service base
 * FLUX_KONTEXT_MAX_MODEL.costPerImage = calculateFinalImageCostInStars(0.08) = 8
 * -- a DIFFERENT helper. The two bases DIVERGE (8 vs 12; `tri money-base 0.08
 * 2.4` prints DIVERGE), so unlike qwen #1263 (both 3) no size multiplier alone
 * reconciles: a failed 2K image was charged 48 but refunded 8 (lost 40; 64 at
 * 4K). Only the EXACT charge reconciles.
 *
 * Fix: the batch passes the exact per-image charge as chargedCostOverride, and
 * the service refunds `params.chargedCostOverride ?? costPerImage` -- so a batch
 * failure refunds what was charged, and single-mode (no override) is unchanged.
 *
 * Source-level seam test (the service is a large provider/Telegram I/O
 * function). Test A: every refundUser call in the service is override-aware
 * (no bare flat-base refund survives). Test B: the flux_kontext_max batch block
 * passes chargedCostOverride: costPerImage. Mutation: dropping the override on a
 * refund, or on the batch call, fails a test.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const read = (rel: string) =>
  stripComments(fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'))

describe('generateFluxKontextMax batch refund reconciles the exact charge', () => {
  it('every refundUser in the service is override-aware (no flat-base batch refund)', () => {
    const s = read('services/generateFluxKontextMax.ts')
    const calls = s.match(
      /refundUser\([^]*?FLUX_KONTEXT_MAX_MODEL\.costPerImage/g
    )
    expect(calls, 'no refundUser referencing the model cost found').toBeTruthy()
    for (const c of calls as string[]) {
      expect(
        /chargedCostOverride \?\? FLUX_KONTEXT_MAX_MODEL\.costPerImage/.test(c),
        'a refund uses the flat service base -- a batch failure under-refunds the divergent charge'
      ).toBe(true)
    }
  })

  it('the flux_kontext_max batch block passes the exact charge as chargedCostOverride', () => {
    const s = read('scenes/aiPhotoshopScene/index.ts')
    const start = s.indexOf("modelKey === 'flux_kontext_max'")
    expect(start, 'no flux_kontext_max batch block').toBeGreaterThan(-1)
    const end = s.indexOf("modelKey === 'seededit_3'", start)
    const block = s.slice(start, end > start ? end : start + 2000)
    expect(
      /chargedCostOverride: costPerImage/.test(block),
      'the batch does not forward the exact charge -- the service cannot reconcile it'
    ).toBe(true)
  })
})
