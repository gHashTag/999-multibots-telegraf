/**
 * marketplaceService.purchaseItem deducts stars from the buyer (checked) then
 * credits 95% to the author with updateUserBalance(..., MONEY_INCOME). That
 * author-credit result was IGNORED. updateUserBalance returns false on a failed
 * credit (it does not throw), so a failed author payout was silent: the buyer was
 * charged and received the content, but the author was never paid and nobody knew.
 *
 * The buyer has already received the content, so the sale completes (rolling it
 * back would deny the buyer what they paid for). The fix captures the credit
 * result and logs a CRITICAL alert on failure so a missed author payout can be
 * reconciled manually. The file's DEBT entry in the unchecked-money-result
 * ratchet is removed accordingly.
 *
 * Source seam: the author credit is captured and a failure is logged. Mutation
 * (dropping the guard) fails the test.
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
      path.join(__dirname, '..', '..', 'services', 'marketplaceService.ts'),
      'utf8'
    )
  )

describe('marketplace author payout is checked (no silent unpaid author)', () => {
  it('captures the author credit result and logs a failure', () => {
    const s = code()
    const marker = '`Marketplace sale: ${item.title}`'
    const at = s.indexOf(marker)
    expect(at, 'author-credit marker not found').toBeGreaterThan(-1)
    // the credit is captured
    expect(
      /const\s+authorCredited\s*=\s*await\s+updateUserBalance/.test(
        s.slice(Math.max(0, at - 300), at)
      ),
      'author credit result is not captured -- a failed payout is silent'
    ).toBe(true)
    // and a failure is logged
    const after = s.slice(at, at + 500)
    expect(
      /if\s*\(\s*!authorCredited\s*\)/.test(after) &&
        /logger\.error/.test(after),
      'no failure guard logs a missed author payout for reconciliation'
    ).toBe(true)
  })
})
