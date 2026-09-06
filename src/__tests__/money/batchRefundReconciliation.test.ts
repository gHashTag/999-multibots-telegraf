/**
 * The aiPhotoshop ALL_MODELS batch charges each image via calculateFinalPriceInStars
 * (floor, markup 2.4), but each service refunds its own calculateFinalImageCostInStars
 * base (ceil, markup 1.5). These DIVERGE for most models (flux_kontext_max 0.08 -> 12
 * vs 8; flux_kontext_pro / seededit_3 0.05 -> 7 vs 5), so a batch failure under-refunds
 * unless the service refunds the EXACT charge the batch forwards (chargedCostOverride).
 * #1267 fixed flux_kontext_max; this closes flux_kontext_pro + seededit_3.
 *
 * Known-safe WITHOUT an override:
 *   qwen_image_edit  -- bases coincide (0.025 -> 3 == 3), #1263 fix is exact.
 *   nano_banana      -- service HARDCODES costPerImage: 5 which equals the batch
 *                       base (calculateFinalPriceInStars(0.039)=5), so no base
 *                       divergence. (Its size-multiplier handling differs and is
 *                       tracked separately; the tri money-base tool computes the
 *                       THEORETICAL service base and flagged it -- a false signal
 *                       corrected by reading the source.)
 *
 * Ratchet: every batch service (skipBalanceCheck: true) must EITHER forward
 * chargedCostOverride OR be in KNOWN_SAFE. A new batch model that is neither
 * fails this test -- forcing a reconcile decision instead of a silent under-refund.
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

const KNOWN_SAFE = new Set(['qwen_image_edit', 'nano_banana'])

describe('aiPhotoshop batch refunds reconcile the exact charge', () => {
  for (const svc of ['generateFluxKontextPro', 'generateSeedEdit3']) {
    it(`${svc} refunds are override-aware (no divergent-base batch refund)`, () => {
      const s = read(`services/${svc}.ts`)
      const calls = s.match(/refundUser\([^]*?totalCost/g)
      expect(calls, `${svc}: no refundUser(…, totalCost) found`).toBeTruthy()
      for (const c of calls as string[]) {
        expect(
          /chargedCostOverride \?\? totalCost/.test(c),
          `${svc}: a refund uses the divergent service base -- batch failure under-refunds`
        ).toBe(true)
      }
    })
  }

  it('every batch service forwards chargedCostOverride or is KNOWN_SAFE (ratchet)', () => {
    const s = read('scenes/aiPhotoshopScene/index.ts')
    const re = /modelKey === '([a-z_0-9]+)'/g
    const idx: Array<[number, string]> = []
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) idx.push([m.index, m[1]])
    // A floor before the bound. If `modelKey === '...'` stops matching -- a
    // rename, a switch rewritten as a map -- idx is empty, offenders is empty,
    // and this batch-refund ratchet passes over nothing at all. Measured
    // 2026-09-06: 18 model blocks, of which 4 carry skipBalanceCheck.
    expect(
      idx.length,
      'no model blocks found -- the matcher is stale'
    ).toBeGreaterThan(10)
    const skipping = idx.filter(([start], i) => {
      const end = i + 1 < idx.length ? idx[i + 1][0] : start + 2500
      return /skipBalanceCheck:\s*true/.test(s.slice(start, end))
    })
    expect(
      skipping.length,
      'no batch block skips the balance check -- the subject of this ratchet is gone'
    ).toBeGreaterThan(2)
    const offenders: string[] = []
    for (let i = 0; i < idx.length; i++) {
      const [start, name] = idx[i]
      const end = i + 1 < idx.length ? idx[i + 1][0] : start + 2500
      const block = s.slice(start, end)
      if (!/skipBalanceCheck:\s*true/.test(block)) continue
      const forwards = /chargedCostOverride/.test(block)
      if (!forwards && !KNOWN_SAFE.has(name)) offenders.push(name)
    }
    expect(
      offenders,
      `batch services neither forwarding chargedCostOverride nor KNOWN_SAFE: ${offenders.join(', ')} -- classify (add override, or add to KNOWN_SAFE with a base-parity reason)`
    ).toEqual([])
  })
})
