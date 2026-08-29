/**
 * instagramParserWizard charges MONEY_OUTCOME only after a confirmed parse run
 * (correct order), but used to DISCARD the updateUserBalance result and set
 * `charged = true` unconditionally. updateUserBalance returns false (never
 * throws) on a schema/insert failure or a ghost-payer with no users row, so
 * that had two faults: (a) a silent free parse on a charge failure, and (b) the
 * error path below refunds MONEY_INCOME gated on `charged`, so a wrongly-true
 * `charged` would mint a refund for stars never deducted.
 *
 * The fix assigns the real result: `charged = await updateUserBalance(...)`, so
 * `charged` reflects reality — the result is checked (no silent discard) and the
 * refund can no longer mint.
 *
 * Source-level seam test (the charge is deep inside a WizardScene step).
 * Mutation — discarding the result / restoring `charged = true` — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'instagramParserWizard',
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

describe('instagramParser charge result is checked (no discard, no mint)', () => {
  it('assigns the charge result to `charged` and never sets it unconditionally true', () => {
    const s = code()
    // the MONEY_OUTCOME charge feeds `charged`, not the void
    const charge = s.match(
      /charged = await updateUserBalance\([\s\S]{0,200}?MONEY_OUTCOME/
    )
    expect(
      charge,
      'the charge result is not assigned to `charged`'
    ).not.toBeNull()
    // the unconditional set is gone (it would make a failed charge look charged)
    expect(
      /\bcharged = true\b/.test(s),
      '`charged = true` is set unconditionally (mint / silent-discard risk)'
    ).toBe(false)
  })

  it('gates the refund on the (now truthful) charged flag', () => {
    const s = code()
    // refund is MONEY_INCOME under `if (charged)`; with a truthful charged it
    // can no longer mint on a failed charge
    expect(/if \(charged\)/.test(s), 'refund is not gated on charged').toBe(
      true
    )
    expect(
      /refunded = await updateUserBalance\([\s\S]{0,200}?MONEY_INCOME/.test(s),
      'no gated MONEY_INCOME refund'
    ).toBe(true)
  })
})
