/**
 * lipSyncWizard/index.ts refunded on a missing-URLs failure with a raw
 * updateUserBalance(..., MONEY_INCOME) whose result was IGNORED, and it sent NO
 * user message -- a silent charge-then-drop. updateUserBalance returns false on a
 * failed credit (it does not throw), so a refund that silently failed left the
 * user charged, un-refunded and un-notified.
 *
 * Fix: use refundAndTell (already imported), which checks the credit result,
 * logs a critical alert on failure, and tells the user by fact. The file's DEBT
 * entry in the unchecked-money-result ratchet is removed accordingly.
 *
 * Source seam: the missing-URLs refund goes through refundAndTell, not a raw
 * MONEY_INCOME updateUserBalance. Mutation (reverting) fails the test.
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

const code = () =>
  stripComments(
    fs.readFileSync(
      path.join(__dirname, '..', '..', 'scenes', 'lipSyncWizard', 'index.ts'),
      'utf8'
    )
  )

describe('lipSyncWizard missing-URLs refund checks its result (refundAndTell)', () => {
  it('refunds via refundAndTell, not a raw MONEY_INCOME credit', () => {
    const s = code()
    const marker = "'LipSync refund - missing URLs'"
    const at = s.indexOf(marker)
    expect(at, 'missing-URLs refund marker not found').toBeGreaterThan(-1)
    const around = s.slice(Math.max(0, at - 300), at + 200)
    expect(
      /refundAndTell\(/.test(around),
      'missing-URLs refund does not go through refundAndTell -- ignored credit result, silent failure'
    ).toBe(true)
    expect(
      /updateUserBalance\([^]*?MONEY_INCOME[^]*?LipSync refund - missing URLs/.test(
        s
      ),
      'a raw MONEY_INCOME updateUserBalance still handles the missing-URLs refund'
    ).toBe(false)
  })
})
