/**
 * THE SEAM THAT SWALLOWED CASH.
 *
 * Two people paid for a digital clone in cash, off the platform, and were
 * credited by hand in the archive with an ADMIN_OVERRIDE row. The 2026-09-20
 * move to the single wallet then handled them twice and moved them nowhere:
 * the clawback EXEMPTED them (so the archive kept the grant) while the carry
 * moved `min(paid, balance)` (so nothing crossed, because an ADMIN_OVERRIDE row
 * classifies as `admin`, not `paid`). The archive is read-only; a balance
 * protected there is a balance nobody can spend.
 *
 * Both halves are right in isolation. What no rule could see is which admin row
 * was a staff perk and which was cash in hand -- only the owner's own record
 * says that, which is why `carry-cash-payers.ts` carries a LIST and not a rule.
 *
 * These tests pin the arithmetic of that seam so it cannot silently reopen.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  classify,
  foldLedger,
  carryAmount,
  type LedgerRow,
} from '../../core/money/ledgerClassify'

/** The archive rows as they actually stand for @Farishka, 2026-09-17. */
const FARISHKA: Array<LedgerRow & { telegram_id: string }> = [
  {
    telegram_id: '373211349',
    type: 'MONEY_INCOME',
    stars: 1303,
    status: 'COMPLETED',
    payment_method: 'ADMIN_OVERRIDE',
    service_type: 'admin_grant',
    description: 'Manual stars credit: 1303 (paid off-platform)',
  },
  {
    telegram_id: '373211349',
    type: 'MONEY_OUTCOME',
    stars: 8,
    status: 'COMPLETED',
    payment_method: 'System',
    service_type: 'other',
    description: 'Payment for service: avatar_transform',
  },
]

describe('cash paid off-platform, as the archive recorded it', () => {
  it('is bucketed as an admin grant, which is why nothing carried', () => {
    expect(classify(FARISHKA[0])).toBe('admin')
    const totals = foldLedger(FARISHKA).get('373211349')!
    expect(totals.paid).toBe(0)
    expect(totals.admin).toBe(1303)
    expect(totals.balance).toBe(1295)
    // The ordinary carry rule, unchanged -- and this is the whole defect.
    expect(carryAmount(totals)).toBe(0)
  })

  it('carries min(grant, balance), so money already spent is not handed back', () => {
    const totals = foldLedger(FARISHKA).get('373211349')!
    const carry = Math.floor(
      Math.min(totals.admin, Math.max(0, totals.balance))
    )
    expect(carry).toBe(1295)
  })
})

describe('the script that repairs it', () => {
  const source = readFileSync(
    join(__dirname, '../../../scripts/money/carry-cash-payers.ts'),
    'utf8'
  )

  it('names both cash payers, and nobody else', () => {
    const listed = [...source.matchAll(/\['(\d{6,})', '@/g)].map(m => m[1])
    expect(listed.sort()).toEqual(['373211349', '504608015'])
  })

  it('writes the ledger row and the balance under one dedup lock', () => {
    // Without the star_payments insert a second run mints the tokens again;
    // without the token_ledger row the book stops matching the balance.
    expect(source).toContain('INSERT INTO star_payments')
    expect(source).toContain('ON CONFLICT (charge_id) DO NOTHING')
    expect(source).toContain('INSERT INTO token_ledger')
    expect(source).toContain('BEGIN')
  })

  it('refuses to write unless told to, explicitly', () => {
    expect(source).toContain('isCommit')
    expect(source).toContain('Dry run only')
  })
})
