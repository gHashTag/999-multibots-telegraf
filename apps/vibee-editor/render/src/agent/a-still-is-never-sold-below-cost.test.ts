/**
 * AN IMG2IMG STILL IS NEVER SOLD BELOW ITS COST x THE MARKUP.
 *
 * Found 2026-09-26 while costing the story reel: the agent's `image_edit` on
 * Kie google/nano-banana-edit was charged as `image_generate` -- 2 tokens, a
 * price set for Replicate flux-schnell at $0.003 -- while Kie bills that model
 * $0.02 a picture. The formula, ceil(cost x markup / base), prices it at 8. A
 * story reel draws three stills: 6 tokens taken for 24 owed, on every reel.
 *
 * Nothing could have shown it: `image_edit` was on no price list and in no
 * margin report. So the rule is pinned from four sides -- the price, the
 * charge site, the price list the agent quotes, and the margin report.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  COST_PER_TOKEN_USD,
  НАЦЕНКА, // cyrillic-ok: existing export name
  OPERATION_COST_USD,
  TOKEN_PRICES,
  kieCostUsd,
  priceForKieModel,
} from './billing-shared'
import { EDIT_MODEL } from '../kie-image'
import { PAID } from './pricing'
import { marginReport } from './margin-report'

const COST = kieCostUsd(EDIT_MODEL)
const FLOOR = Math.ceil(
  Number(((Number(COST) * НАЦЕНКА) / COST_PER_TOKEN_USD).toFixed(6)) // cyrillic-ok: existing export name
)

describe('an img2img still is sold at its cost x the markup', () => {
  it('the Kie price list names the model (negative control for the rest)', () => {
    // Without a cost every assertion below would compare against NaN.
    expect(COST).toBeGreaterThan(0)
    expect(FLOOR).toBeGreaterThan(0)
  })

  it('the image_edit cost is READ from the Kie price list, not typed', () => {
    expect(OPERATION_COST_USD.image_edit).toBe(COST)
  })

  it('the image_edit price is never below cost x markup', () => {
    expect(TOKEN_PRICES.image_edit).toBeGreaterThanOrEqual(FLOOR)
    // The same number the Mini App would charge for this Kie model.
    expect(TOKEN_PRICES.image_edit).toBe(priceForKieModel(EDIT_MODEL))
    // And the text-to-image price it used to borrow does not cover it.
    expect(TOKEN_PRICES.image_generate).toBeLessThan(FLOOR)
  })

  it('the agent charges a nano-banana still as image_edit, not image_generate', () => {
    const src = fs.readFileSync(path.join(__dirname, 'tools.ts'), 'utf8')
    const at = src.indexOf("name: 'image_edit',")
    expect(at, 'the image_edit tool').toBeGreaterThan(-1)
    const handler = src.slice(at, at + 12_000)
    expect(handler).toMatch(
      /const op = isGptImage25Edit\(model\) \? 'gpt_image_edit' : 'image_edit'/
    )
    expect(handler).toMatch(/spendTokens\(ctx, op\)/)
  })

  it('the price list the agent quotes carries the same number', () => {
    const line = PAID.find(p => p['функция'] === 'image_edit') // cyrillic-ok: existing field name
    expect(line, 'image_edit on the price list').toBeTruthy()
    expect(line!['токенов']).toBe(TOKEN_PRICES.image_edit) // cyrillic-ok: existing field name
  })

  it('the margin report shows it, and neither at a loss nor under the floor', () => {
    const row = marginReport().rows.find(r => r.model === `kie/${EDIT_MODEL}`)
    expect(row, 'image_edit in the margin report').toBeTruthy()
    expect(row!.tokens).toBe(TOKEN_PRICES.image_edit)
    expect(row!.flags).not.toContain('LOSS')
    expect(row!.flags).not.toContain('UNDER FLOOR')
  })
})
