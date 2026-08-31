/**
 * hedra-render-wizard refunds (MONEY_INCOME) on the no-voice-ID path but
 * discarded the updateUserBalance result. updateUserBalance returns false
 * (never throws) on a schema/insert failure or a ghost-payer with no users
 * row, so on a failed refund the user stayed charged, silently. The fix checks
 * the result and logs the failure (the reply makes no refund claim, so there is
 * no user-facing message to correct).
 *
 * Source-level seam test. Mutation — discarding the refund result again — fails
 * it.
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
  'hedra-render-wizard.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('hedra-render refund result is checked (no silent unrefunded charge)', () => {
  it('assigns the MONEY_INCOME refund result and reacts to a failure', () => {
    const s = code()
    const m = s.match(
      /const refunded = await updateUserBalance\([\s\S]{0,200}?MONEY_INCOME/
    )
    expect(m, 'the refund result is silently discarded').not.toBeNull()
    const guard = s.search(/if \(!refunded\)/)
    expect(guard, 'a failed refund is not handled').toBeGreaterThan(-1)
  })
})
