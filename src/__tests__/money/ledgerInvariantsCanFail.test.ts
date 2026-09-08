import { describe, it, expect } from 'vitest'

/*
 * THE LEDGER IS THE TABLE. get_user_balance SUMS payments_v2, so the rows have
 * properties a reader can check without knowing which of the seven writers
 * produced them -- which is the point, because the guard that mattered lived
 * inside one of those seven for months.
 *
 * What is tested here is the INSTRUMENT, not the data: an invariant that
 * cannot find its own violation reports a clean ledger forever, and that is
 * indistinguishable from a ledger with nothing wrong in it. Each one is
 * therefore shown BOTH a planted violation and a clean row.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { INVARIANTS } = require('../../../scripts/ledger-integrity.cjs')

const clean = {
  id: 1,
  type: 'MONEY_INCOME',
  status: 'COMPLETED',
  stars: 10,
  inv_id: 'A',
  operation_id: 'op',
  payment_date: '2026-06-01',
  telegram_id: '1',
}

const PLANTED: Record<string, any[]> = {
  'a credit is not recorded twice under one inv_id': [
    { ...clean, id: 2 },
    { ...clean, id: 3 },
  ],
  'the sign is set by type, never by the number': [
    { ...clean, id: 4, type: 'MONEY_OUTCOME', stars: -9 },
  ],
  'a charge charges something': [
    { ...clean, id: 5, type: 'MONEY_OUTCOME', stars: 0 },
  ],
  'a credit carries a key that can deduplicate it': [
    { ...clean, id: 6, inv_id: null, operation_id: null },
  ],
  'the words agree with the direction': [
    {
      ...clean,
      id: 7,
      type: 'MONEY_OUTCOME',
      description: 'Пополнение баланса',
    }, // cyrillic-ok: the description under test
  ],
}

describe('every ledger invariant can actually fail', () => {
  it('checks all four, and the list has not silently shrunk', () => {
    expect(INVARIANTS.map((i: any) => i.name).sort()).toEqual(
      Object.keys(PLANTED).sort()
    )
  })

  for (const [name, rows] of Object.entries(PLANTED)) {
    it(`finds its planted violation: ${name}`, () => {
      const inv = INVARIANTS.find((i: any) => i.name === name)
      expect(inv, 'invariant missing').toBeTruthy()
      expect(inv.find(rows).length).toBeGreaterThan(0)
    })

    it(`does not flag a clean row: ${name}`, () => {
      const inv = INVARIANTS.find((i: any) => i.name === name)
      expect(inv.find([clean]).length).toBe(0)
    })
  }

  it('does not call a bought subscription a mistyped row', () => {
    /*
     * The false positive the first version of this rule produced, locked so it
     * cannot come back. A subscription is BOUGHT with stars, so it belongs on
     * an OUTCOME row; putting 'subscription' in the money-in word list gave two
     * false hits out of three, and a meaning check that cries wolf gets
     * switched off faster than one that misses.
     */
    const inv = INVARIANTS.find(
      (i: any) => i.name === 'the words agree with the direction'
    )
    const bought = {
      ...clean,
      id: 9,
      type: 'MONEY_OUTCOME',
      description: 'Auto-activated subscription: NEUROPHOTO',
    }
    expect(inv.find([bought]).length).toBe(0)
  })

  it('a duplicate needs BOTH rows completed, not merely present', () => {
    // A pending row beside a completed one is the ordinary shape of a payment
    // that succeeded on the second attempt; calling that a double credit would
    // make the check cry wolf and get it switched off.
    const inv = INVARIANTS.find(
      (i: any) => i.name === 'a credit is not recorded twice under one inv_id'
    )
    expect(
      inv.find([
        { ...clean, id: 7 },
        { ...clean, id: 8, status: 'PENDING' },
      ]).length
    ).toBe(0)
  })
})
