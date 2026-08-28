import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * A TON payment must credit the balance once, not once per "check payment" tap.
 *
 * Both TON scenes read the PENDING payment, look up the on-chain transaction,
 * flip the row to COMPLETED, and credit. The flip used to be
 * `update({status: COMPLETED}).eq('inv_id', invId)` with no status guard, and
 * the credit ran regardless — so two concurrent taps of "check payment" both
 * saw PENDING, both found the same real transaction, both flipped, and both
 * credited: a double top-up for one payment.
 *
 * The fix is a compare-and-set: the flip carries .eq('status', PENDING) (atomic
 * in Postgres) and .select() reports whether this tap won; only the winner
 * credits. This reads the sources and pins that shape — the status guard and a
 * claimed-empty check standing between the completion update and the credit —
 * so a revert to the unconditional update fails here.
 */

const strip = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''")

const SCENES = [
  path.join('src', 'scenes', 'tonNativePaymentScene', 'index.ts'),
  path.join('src', 'scenes', 'tonPaymentScene', 'index.ts'),
]

// The window from the completion UPDATE to the credit that follows it.
function completionToCredit(src: string): string {
  const s = strip(src)
  const upd = s.indexOf('status: PaymentStatus.COMPLETED')
  if (upd === -1) return ''
  const credit = s.indexOf('updateUserBalance', upd)
  if (credit === -1) return ''
  return s.slice(upd, credit)
}

describe.each(SCENES)('%s credits a TON payment once', file => {
  const src = fs.readFileSync(file, 'utf8')
  const window = completionToCredit(src)

  it('has a completion update followed by a credit', () => {
    expect(window.length).toBeGreaterThan(0)
  })

  it('the completion update is a compare-and-set on status = PENDING', () => {
    expect(window).toMatch(/\.eq\(\s*''\s*,\s*PaymentStatus\.PENDING\s*\)/)
  })

  it('reads the affected rows with .select()', () => {
    expect(window).toMatch(/\.select\(/)
  })

  it('skips the credit when the claim was already taken', () => {
    // A guard on the claimed rows returns before the credit runs.
    expect(window).toMatch(/claimed/)
    expect(window).toMatch(/\breturn\b/)
  })
})
