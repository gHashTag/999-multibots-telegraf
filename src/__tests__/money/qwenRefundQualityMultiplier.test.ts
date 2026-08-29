/**
 * generateQwenImageEdit is called in aiPhotoshopScene's batch (ALL_MODELS) mode
 * with skipBalanceCheck: true, AFTER the scene has charged costPerImage *
 * qualityMultiplier(size) per image (2K -> x4, 4K -> x6). On a Replicate/API
 * failure the service refunds `totalCost`. Before this fix `totalCost` was the
 * FLAT base (costPerImage, no multiplier), so a failed 2K image was charged 12
 * stars but refunded only 3 -- the user lost 9 (15 at 4K). The two sibling
 * services generateSeedEdit3 and generateFluxKontextPro already apply the same
 * qualityMultiplier to totalCost; qwen alone omitted it (copy-paste gap).
 *
 * The fix multiplies totalCost by the size multiplier, so BOTH refund sites
 * (inner Replicate catch + outer catch), which use `totalCost`, now reconcile
 * the size-based batch charge exactly (base and batch base both resolve to the
 * same star value, verified numerically). It also aligns the normal single-mode
 * charge with the two siblings.
 *
 * Source-level seam test (the service is a large provider/Telegram I/O
 * function; forcing the Replicate reject path in a behavioral test is brittle
 * and risks a false ruler). The assertion is bounded to the cost-calculation
 * region -- between the costPerImage declaration and the Cost-calculation log --
 * and requires the multiplier to be APPLIED to totalCost, not merely declared.
 * Mutation: reverting to `totalCost = costPerImage` (dropping the multiplier)
 * fails the first test; drifting the multiplier values fails the parity test.
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

const read = (name: string) =>
  stripComments(
    fs.readFileSync(path.join(__dirname, '..', '..', 'services', name), 'utf8')
  )

const QWEN = 'generateQwenImageEdit.ts'
const MULT = /size === '4K' \? 6 : size === '2K' \? 4 : 1/

describe('generateQwenImageEdit refunds the size-adjusted charge (no wrong-refund-amount)', () => {
  it('applies qualityMultiplier to totalCost in the cost-calculation region', () => {
    const s = read(QWEN)
    const start = s.indexOf(
      'const costPerImage = QWEN_IMAGE_EDIT_MODEL.costPerImage'
    )
    expect(start, 'no costPerImage declaration').toBeGreaterThan(-1)
    const end = s.indexOf('Cost calculation:', start)
    expect(end, 'no cost-calculation log anchor').toBeGreaterThan(start)
    const block = s.slice(start, end)
    expect(
      /totalCost = costPerImage \* qualityMultiplier/.test(block),
      'totalCost is the flat base -- a failed 2K/4K image under-refunds the size charge'
    ).toBe(true)
    expect(
      MULT.test(block),
      'qualityMultiplier is not the size-based multiplier'
    ).toBe(true)
  })

  it('uses the same size multiplier as its sibling generateSeedEdit3 (parity)', () => {
    expect(MULT.test(read(QWEN)), 'qwen multiplier missing').toBe(true)
    expect(
      MULT.test(read('generateSeedEdit3.ts')),
      'seedEdit3 multiplier drifted -- update both together'
    ).toBe(true)
  })
})
