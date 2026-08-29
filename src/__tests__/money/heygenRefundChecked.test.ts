/**
 * heygen-render-wizard refunds (MONEY_INCOME) on a send-event error and then
 * tells the user "Funds refunded" — but it DISCARDED the updateUserBalance
 * result, so on a ghost-payer (updateUserBalance returns false, never throws)
 * the user was told "refunded" when the refund had silently failed (same class
 * as aiCover #1188).
 *
 * The fix assigns the refund result and gates the "funds refunded" message on
 * it: on a failed refund the user is told to contact support.
 *
 * Source-level seam test. Mutation — discarding the refund result, or making
 * the "funds refunded" message unconditional again — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'lipSyncWizard',
  'heygen-render-wizard.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('heygen-render refund result is checked and reported truthfully', () => {
  it('assigns the MONEY_INCOME refund result', () => {
    const s = code()
    const m = s.match(
      /const refunded = await updateUserBalance\([\s\S]{0,200}?MONEY_INCOME/
    )
    expect(m, 'the refund result is silently discarded').not.toBeNull()
  })

  it('tells the user "funds refunded" only when the refund actually succeeded', () => {
    const s = code()
    const idx = s.indexOf('Funds refunded')
    expect(idx, 'no funds-refunded message').toBeGreaterThan(-1)
    const around = s.slice(Math.max(0, idx - 120), idx)
    expect(
      /refunded\s*\n?\s*\?/.test(around),
      'the funds-refunded message is not gated on the actual refund result'
    ).toBe(true)
  })
})
