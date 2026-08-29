/**
 * faceSwapWizard runs a PAID Replicate face swap, then charges 10 stars via
 * updateUserBalance (which returns false — never throws — on failure), then
 * delivers the result with ctx.replyWithPhoto (a remote URL Telegram must
 * fetch). Two money-integrity holes existed:
 *
 *  - unbilled-paid: `if (!charged)` only logged, then delivered the swap for
 *    FREE with a caption falsely claiming a charge.
 *  - charged-no-refund: the charge committed before the only delivery, whose
 *    try/finally had no catch — a replyWithPhoto throw left the user billed
 *    for a photo they never received, with no refund.
 *
 * The fix: bail (scene.leave) on !charged before delivering, and wrap the
 * delivery in a try/catch that refunds via refundAndTell on failure. The guard
 * is inline in a WizardScene step with heavy Telegram/service deps, so this is
 * a source-level seam test. Mutation — dropping the !charged return, or the
 * delivery try/catch refund — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'faceSwapWizard',
  'index.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('faceSwap money integrity', () => {
  it('bails (does not deliver) when the charge did not go through', () => {
    const s = code()
    const guard = s.search(/if \(!charged\)/)
    expect(guard, 'no !charged guard').toBeGreaterThan(-1)

    // the !charged block must leave the scene...
    const block = s.slice(guard, guard + 900)
    expect(
      /return ctx\.scene\.leave\(\)/.test(block),
      'the !charged branch does not bail'
    ).toBe(true)

    // ...before the paid result is delivered (no free swap on a failed charge)
    const deliver = s.indexOf('replyWithPhoto(')
    expect(deliver, 'no replyWithPhoto delivery').toBeGreaterThan(-1)
    const bail = guard + block.indexOf('return ctx.scene.leave()')
    expect(bail, 'the !charged bail runs after delivery').toBeLessThan(deliver)
  })

  it('refunds when delivery throws after the charge committed', () => {
    const s = code()
    // the delivery is wrapped so a throw is caught and refunded
    const deliver = s.indexOf('replyWithPhoto(')
    const after = s.slice(deliver, deliver + 1000)
    expect(
      /catch \(deliveryError\)/.test(after),
      'delivery is not wrapped in a catch'
    ).toBe(true)
    expect(
      /refundAndTell\(/.test(after),
      'delivery failure does not refund via refundAndTell'
    ).toBe(true)
    // the refund is the charged amount
    expect(
      /amount: requiredStars/.test(after),
      'the refund is not the charged amount'
    ).toBe(true)
  })
})
