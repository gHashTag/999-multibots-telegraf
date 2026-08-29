/**
 * aiCoverWizard refunds (PaymentType.REFUND) on a generation error, gated on
 * the `charged` flag (the refund-mint fix, #1127). But the refund result was
 * DISCARDED and the code logged "Refund processed" + told the user their
 * funds were refunded unconditionally. updateUserBalance returns false (never throws)
 * on a ghost-payer with no users row, so the user was told "refunded" when the
 * refund had silently failed — the exact class the unchecked-money-result gate
 * targets.
 *
 * The fix assigns the refund result (`refunded = await updateUserBalance(...)`)
 * and makes both the log and the USER MESSAGE reflect it: on a failed refund
 * the user is told to contact support, not that funds were returned.
 *
 * Source-level seam test. Mutation — discarding the refund result, or making the
 * "funds refunded" message unconditional again — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'aiCoverWizard',
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

describe('aiCover refund result is checked and reported truthfully', () => {
  it('assigns the REFUND result instead of discarding it', () => {
    const s = code()
    const m = s.match(
      /refunded = await updateUserBalance\([\s\S]{0,160}?PaymentType\.REFUND/
    )
    expect(m, 'the refund result is discarded (not assigned)').not.toBeNull()
  })

  it('tells the user "funds refunded" only when the refund actually succeeded', () => {
    const s = code()
    // the success message must be guarded by `refunded`, not just `charged`
    const idx = s.indexOf('Funds refunded')
    expect(idx, 'no funds-refunded message').toBeGreaterThan(-1)
    // within the surrounding ternary, `refunded ?` must gate the positive text
    const around = s.slice(Math.max(0, idx - 120), idx)
    expect(
      /refunded\s*\n?\s*\?/.test(around),
      'the funds-refunded message is not gated on the actual refund result'
    ).toBe(true)
  })
})
