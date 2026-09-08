import { describe, it, expect } from 'vitest'

/*
 * A PENDING ROW IS AN INVOICE, NOT A THEFT.
 *
 * It is written when the payment link is generated, so an abandoned checkout
 * leaves exactly the trace a vanished payment leaves. Calling all 164 of them
 * "money owed" is an accusation the ledger cannot support -- and the number
 * has been quoted that way in reports, including mine.
 *
 * What the ledger CAN separate is what the person did next, and the split
 * matters because it takes the question from 164 rows to 52: the rest either
 * paid successfully days later or went on spending, and neither is consistent
 * with money that disappeared.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { triage } = require('../../../scripts/robokassa-reconcile.cjs')

const pending = (over: Record<string, unknown> = {}) => ({
  id: 1,
  telegram_id: '7',
  payment_date: '2026-05-01T00:00:00Z',
  type: 'MONEY_INCOME',
  status: 'PENDING',
  amount: 1000,
  payment_method: 'Robokassa',
  ...over,
})

const later = (days: number, over: Record<string, unknown>) => ({
  id: 2,
  telegram_id: '7',
  payment_date: new Date(
    Date.parse('2026-05-01T00:00:00Z') + days * 864e5
  ).toISOString(),
  status: 'COMPLETED',
  amount: 1000,
  payment_method: 'Telegram',
  ...over,
})

describe('a pending row is triaged, not accused', () => {
  it('a payment that succeeded within three days clears the row', () => {
    const t = triage([pending(), later(1, { type: 'MONEY_INCOME' })])
    expect(t.retried.length).toBe(1)
    expect(t.silent.length).toBe(0)
  })

  it('four days later is NOT the same event', () => {
    // The boundary is the whole content of the rule: without it, any later
    // payment at any distance would clear any pending row, and the group that
    // matters would empty itself.
    const t = triage([pending(), later(4, { type: 'MONEY_INCOME' })])
    expect(t.retried.length).toBe(0)
  })

  it('somebody who kept spending is held apart from somebody who went silent', () => {
    const spent = triage([pending(), later(10, { type: 'MONEY_OUTCOME' })])
    expect(spent.keptSpending.length).toBe(1)
    expect(spent.silent.length).toBe(0)

    const nothing = triage([pending()])
    expect(nothing.silent.length).toBe(1)
  })

  it('only Robokassa rows that are actually pending are triaged at all', () => {
    const t = triage([
      pending({ payment_method: 'Telegram' }),
      pending({ id: 3, status: 'COMPLETED' }),
    ])
    expect(t.retried.length + t.keptSpending.length + t.silent.length).toBe(0)
  })

  it("another person's later payment does not clear this one's row", () => {
    const t = triage([
      pending(),
      later(1, { telegram_id: '999', type: 'MONEY_INCOME' }),
    ])
    expect(t.silent.length).toBe(1)
    expect(t.retried.length).toBe(0)
  })
})
