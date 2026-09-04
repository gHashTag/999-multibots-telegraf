/**
 * generateGeminiImage charges the user (processBalanceOperation, 12 stars)
 * BEFORE the paid generation (Replicate / OpenRouter). It can fail two ways
 * after the charge: the generation throws (API error, no image URL) → caught;
 * or delivery fails — sendPhotoWithFallback returns FALSE (it never throws), so
 * that path does NOT reach the catch. The old code refunded in neither case, so
 * the user paid for an image they never received (same class as faceSwap #1166).
 *
 * The fix records the amount actually charged (balanceCheck.paymentAmount — 0
 * for a free/bypass generation) and refunds exactly that amount via refundAndTell
 * on BOTH a generation throw (catch) and a delivery failure (explicit !delivered
 * check), gated on chargedAmount > 0 so a free generation is never minted a
 * refund it did not pay.
 *
 * Source-level seam test (the service is a long provider/Telegram I/O function).
 * Mutation — dropping the refund, ungating it, or refunding a constant instead
 * of the charged amount — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ifElseBlocks } = require('../../../scripts/lib/call-args.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { blank } = require('../../../scripts/lib/blank-code.cjs')

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'services',
  'generateGeminiImage.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('generateGeminiImage refunds a failed paid generation (no charged-no-refund)', () => {
  it('refunds via refundAndTell on a generation error', () => {
    const s = code()
    // the catch region (after the sole return imageUrl / the final catch)
    const c = s.lastIndexOf('catch (error)')
    expect(c, 'no catch block').toBeGreaterThan(-1)
    const after = s.slice(c)
    expect(
      /refundAndTell\(/.test(after),
      'the failure path does not refund via refundAndTell'
    ).toBe(true)
  })

  it('refunds the ACTUAL charged amount, gated so a free generation is never minted', () => {
    const s = code()
    // chargedAmount is sourced from the real deduction, not the sticker price
    expect(
      /chargedAmount = balanceCheck\.paymentAmount/.test(s),
      'chargedAmount is not taken from balanceCheck.paymentAmount'
    ).toBe(true)
    // the refund is gated on a real charge (> 0), and refunds that amount
    expect(
      /if \(chargedAmount > 0\)/.test(s),
      'the refund is not gated on a real charge (mint risk)'
    ).toBe(true)
    expect(
      /amount: chargedAmount/.test(s),
      'the refund amount is not the actually-charged amount'
    ).toBe(true)
  })

  it('also refunds a delivery failure (sendPhotoWithFallback returns false, never throws)', () => {
    const s = code()
    // the boolean return must be captured (not discarded)...
    expect(
      /const delivered = await sendPhotoWithFallback\(/.test(s),
      'sendPhotoWithFallback result is discarded (a delivery failure is silent)'
    ).toBe(true)
    // ...and a failed delivery must refund before returning, not fall through
    // The guard's own body, not 900 characters after it. That width carried the
    // verdict -- halving it turned this red -- and it accepted a refund from
    // anywhere nearby, including from a LATER branch that is not this failure.
    const g = ifElseBlocks(blank(s), 'if \\(!delivered\\)')
    expect(g.conStart, 'no delivery-failure branch').toBeGreaterThan(-1)
    const body = s.slice(g.conStart, g.conEnd)
    expect(
      /refundAndTell\(/.test(body),
      'a delivery failure does not refund'
    ).toBe(true)
    expect(/\breturn null\b/.test(body), 'delivery failure does not bail').toBe(
      true
    )
  })
})
