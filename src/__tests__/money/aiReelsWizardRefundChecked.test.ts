/**
 * ai-reels-wizard's critical-lip-sync-error path refunded with a raw
 * `await updateUserBalance(..., MONEY_INCOME)` whose result was IGNORED, then
 * told the user their funds were refunded unconditionally (both RU and EN copy).
 * updateUserBalance returns false on a failed credit (it does not throw), so a
 * refund that silently failed left the user charged, un-refunded, and misinformed
 * (the refundAndTell class: "'refunded' was said without knowing it").
 *
 * Fix: use refundAndTell (already used elsewhere in this file), which checks the
 * credit result, logs a critical alert on failure, and tells the user by fact
 * ("Funds refunded" vs "contact support"). The file's DEBT entry in the
 * unchecked-money-result ratchet is removed accordingly.
 *
 * Source seam: the critical-error refund uses refundAndTell, not a raw
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
      path.join(
        __dirname,
        '..',
        '..',
        'scenes',
        'lipSyncWizard',
        'ai-reels-wizard.ts'
      ),
      'utf8'
    )
  )

describe('ai-reels-wizard critical-error refund checks its result (refundAndTell)', () => {
  it('refunds the critical lip-sync error via refundAndTell, not a raw credit', () => {
    const s = code()
    const marker = "'AI Reels refund - critical lip-sync error'"
    const at = s.indexOf(marker)
    expect(at, 'critical refund marker not found').toBeGreaterThan(-1)
    // the description passes through refundAndTell now
    const around = s.slice(Math.max(0, at - 300), at + 200)
    expect(
      /refundAndTell\(/.test(around),
      'critical refund does not go through refundAndTell -- an ignored credit result misinforms the user'
    ).toBe(true)
    expect(
      /updateUserBalance\([^]*?MONEY_INCOME[^]*?AI Reels refund - critical/.test(
        s
      ),
      'a raw MONEY_INCOME updateUserBalance still handles the critical refund'
    ).toBe(false)
  })
})
