import { describe, it, expect } from 'vitest'
import {
  classify,
  isTestData,
  foldLedger,
  carryAmount,
  clawbackAmount,
  emptyTotals,
  type LedgerRow,
} from '@/core/money/ledgerClassify'

/**
 * These rules moved real money on 2026-09-20. Each case below is a shape that
 * actually occurs in `payments_v2`, not an invented one.
 */

const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  type: 'MONEY_INCOME',
  stars: 100,
  status: 'COMPLETED',
  payment_method: null,
  bot_name: null,
  service_type: null,
  description: null,
  ...over,
})

describe('classify', () => {
  it('counts a provider payment as paid', () => {
    expect(classify(row({ payment_method: 'Telegram' }))).toBe('paid')
    expect(classify(row({ payment_method: 'Robokassa' }))).toBe('paid')
    expect(classify(row({ payment_method: 'TON' }))).toBe('paid')
  })

  it('counts an admin grant as admin, however it is marked', () => {
    expect(classify(row({ payment_method: 'Admin' }))).toBe('admin')
    expect(classify(row({ bot_name: 'admin_script' }))).toBe('admin')
    // A grant script may leave payment_method alone and mark only the service.
    expect(classify(row({ service_type: 'staff_access_grant' }))).toBe('admin')
  })

  it('treats a tagged test row as test even when it looks like a payment', () => {
    const tagged = row({
      payment_method: 'Telegram',
      description: 'TEST_DATA: System/Bonus/Testing | TAG:TEST_DATA',
    })
    expect(isTestData(tagged)).toBe(true)
    // This is the trap: 735 such rows carry 406497 stars. Reading them as
    // income inflates the platform's money several times over.
    expect(classify(tagged)).toBe('test')
  })

  it('leaves system bookkeeping in other, not in paid', () => {
    expect(classify(row({ payment_method: 'System_Balance_Migration' }))).toBe(
      'other'
    )
    expect(classify(row({ payment_method: 'System' }))).toBe('other')
    // An unknown method is never assumed to be a payment.
    expect(classify(row({ payment_method: 'SomeNewProvider' }))).toBe('other')
  })
})

describe('foldLedger', () => {
  it('sums the ledger rather than reading a balance column', () => {
    const totals = foldLedger([
      { telegram_id: '1', ...row({ payment_method: 'Telegram', stars: 500 }) },
      { telegram_id: '1', ...row({ payment_method: 'Admin', stars: 1000 }) },
      {
        telegram_id: '1',
        ...row({ type: 'MONEY_OUTCOME', stars: 300, payment_method: null }),
      },
    ]).get('1')!

    expect(totals.balance).toBe(1200)
    expect(totals.paid).toBe(500)
    expect(totals.admin).toBe(1000)
  })

  it('ignores rows that never settled', () => {
    const totals = foldLedger([
      { telegram_id: '1', ...row({ payment_method: 'Telegram', stars: 500 }) },
      {
        telegram_id: '1',
        ...row({ payment_method: 'Telegram', stars: 900, status: 'PENDING' }),
      },
    ]).get('1')!
    expect(totals.balance).toBe(500)
  })
})

describe('carryAmount', () => {
  it('carries a real payment', () => {
    expect(carryAmount({ ...emptyTotals(), paid: 1303, balance: 1303 })).toBe(
      1303
    )
  })

  it('carries nothing for an admin grant', () => {
    // @tatizaharova: 240030 on the balance, 869 of it her own money.
    expect(
      carryAmount({
        ...emptyTotals(),
        paid: 869,
        admin: 239991,
        balance: 240030,
      })
    ).toBe(869)
  })

  it('does not hand back money already spent', () => {
    // @Kaya_Kaa paid 63140 and had 39880 left.
    expect(carryAmount({ ...emptyTotals(), paid: 63140, balance: 39880 })).toBe(
      39880
    )
  })

  it('never carries a fraction of a token', () => {
    expect(carryAmount({ ...emptyTotals(), paid: 100.9, balance: 100.9 })).toBe(
      100
    )
  })

  it('carries nothing from a negative balance', () => {
    expect(carryAmount({ ...emptyTotals(), paid: 500, balance: -20 })).toBe(0)
  })
})

describe('clawbackAmount', () => {
  it('removes the grant when the balance covers it', () => {
    expect(
      clawbackAmount({ ...emptyTotals(), admin: 239991, balance: 240030 })
    ).toBe(239991)
  })

  it('never pushes anyone negative', () => {
    // @elvira_ernst was granted 777 but only had 44 left.
    expect(clawbackAmount({ ...emptyTotals(), admin: 777, balance: 44 })).toBe(
      44
    )
  })

  it('leaves a payer the money their own payment bought', () => {
    const totals = { ...emptyTotals(), paid: 1303, admin: 0, balance: 1303 }
    expect(clawbackAmount(totals)).toBe(0)
    expect(carryAmount(totals)).toBe(1303)
  })

  it('takes nothing from an already-empty balance', () => {
    expect(clawbackAmount({ ...emptyTotals(), admin: 5000, balance: 0 })).toBe(
      0
    )
  })
})

describe('the two moves together', () => {
  it('never lets the same star both carry and be clawed back', () => {
    // A mixed account: 869 paid, 239991 granted, nothing spent.
    const totals = {
      ...emptyTotals(),
      paid: 869,
      admin: 239991,
      balance: 240860,
    }
    const carried = carryAmount(totals)
    const removed = clawbackAmount(totals)
    expect(carried).toBe(869)
    expect(removed).toBe(239991)
    // The two moves touch disjoint money and together cannot exceed the balance.
    expect(carried + removed).toBeLessThanOrEqual(totals.balance)
  })
})
