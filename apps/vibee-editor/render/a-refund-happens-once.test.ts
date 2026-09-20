/**
 * A REFUND GIVES THE SAME CHARGE BACK ONCE.
 *
 * `refundByTid` was an unconditional credit: every path that reached it added
 * the price again. Two of the Mini App routes call the refund helper from more
 * than one branch for a single failure (an early return AND the catch around
 * it), a webhook can be redelivered, and a request can be retried -- so one
 * failed generation could return the money twice, and since refunds became
 * ledger rows the book agreed with the inflated balance. Tokens out of nothing,
 * recorded as legitimate.
 *
 * The key is the charge: `spendByTid` returns the id of the ledger row it
 * wrote, the caller carries that number to the refund, and the unique index
 * `token_ledger_once (kind, ref)` -- not a lookup, not this code -- refuses the
 * second one.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { spendByTid, refundByTid } from './src/agent/billing-shared'
import { forgetTokenLedgerTables } from './src/token-ledger'

/**
 * A Postgres small enough to reason about: one balance, one ledger, and the
 * partial unique index on (kind, ref) enforced the way the real one is --
 * by refusing the INSERT, not by being asked first.
 */
function fakeDb(startingBalance: number) {
  const ledger: Array<{
    id: number
    kind: string
    ref: string | null
    delta: number
  }> = []
  let balance = startingBalance
  let nextId = 1
  const db = {
    get balance() {
      return balance
    },
    ledger,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(CREATE|BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] }
      if (s.startsWith('SELECT balance FROM user_tokens')) {
        return { rows: [{ balance }] }
      }
      if (s.startsWith('SELECT 1 FROM token_ledger WHERE telegram_id')) {
        return { rows: ledger.length ? [{ '?column?': 1 }] : [] }
      }
      if (s.startsWith('SELECT 1 FROM token_ledger WHERE kind')) {
        const [kind, ref] = params as [string, string]
        const hit = ledger.some(r => r.kind === kind && r.ref === ref)
        return { rows: hit ? [{ '?column?': 1 }] : [] }
      }
      if (s.startsWith('UPDATE user_tokens SET balance = balance - ')) {
        const [, amount] = params as [string, number]
        if (balance < amount) return { rows: [], rowCount: 0 }
        balance -= amount
        return { rows: [{ balance }], rowCount: 1 }
      }
      if (s.startsWith('UPDATE user_tokens SET balance = balance + ')) {
        const [, amount] = params as [string, number]
        balance += amount
        return { rows: [{ balance }], rowCount: 1 }
      }
      if (s.startsWith('INSERT INTO user_tokens')) {
        return { rows: [{ balance }], rowCount: 1 }
      }
      if (s.startsWith('INSERT INTO token_ledger')) {
        const [, delta, , kind, , ref] = params as [
          string,
          number,
          number,
          string,
          string,
          string | null,
        ]
        if (ref != null && ledger.some(r => r.kind === kind && r.ref === ref)) {
          // What the database does, so the code is tested against the real
          // guard rather than against its own optimistic lookup.
          const e: Error & { code?: string; constraint?: string } = new Error(
            'duplicate key value violates unique constraint "token_ledger_once"'
          )
          e.code = '23505'
          e.constraint = 'token_ledger_once'
          throw e
        }
        const id = nextId++
        ledger.push({ id, kind, ref: ref ?? null, delta })
        return { rows: [{ id }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    },
  }
  return db
}

describe('a refund gives the same charge back once', () => {
  beforeEach(() => forgetTokenLedgerTables())

  it('the charge reports the ledger row it wrote', async () => {
    const db = fakeDb(1000)
    const spent = await spendByTid(db as never, '999', 'image_generate')
    expect(spent.ok).toBe(true)
    // Without this number the caller has nothing to key the refund on, and
    // every guarantee below collapses back to an unconditional credit.
    expect(typeof spent.ledgerId).toBe('number')
  })

  it('the second refund of one charge adds nothing', async () => {
    const db = fakeDb(1000)
    const spent = await spendByTid(db as never, '999', 'image_generate')
    const price = spent.списано as number // cyrillic-ok: shared API field
    const afterCharge = db.balance

    const first = await refundByTid(
      db as never,
      '999',
      'image_generate',
      1,
      undefined,
      price,
      spent.ledgerId
    )
    expect(first).toEqual({ ok: true, refunded: price })
    expect(db.balance).toBe(afterCharge + price)

    const second = await refundByTid(
      db as never,
      '999',
      'image_generate',
      1,
      undefined,
      price,
      spent.ledgerId
    )
    // Not an error: the money IS back. The point is that it is back once.
    expect(second).toEqual({ ok: true, refunded: 0, already: true })
    expect(db.balance).toBe(afterCharge + price)
    expect(db.ledger.filter(r => r.kind === 'refund')).toHaveLength(1)
  })

  it('two different charges are refunded separately', async () => {
    // The guard keys on the charge, not on the person or the operation, so a
    // second genuine failure must still be made good.
    const db = fakeDb(1000)
    const a = await spendByTid(db as never, '999', 'image_generate')
    const b = await spendByTid(db as never, '999', 'image_generate')
    expect(a.ledgerId).not.toBe(b.ledgerId)

    const price = a.списано as number // cyrillic-ok: shared API field
    const low = db.balance
    await refundByTid(
      db as never,
      '999',
      'image_generate',
      1,
      undefined,
      price,
      a.ledgerId
    )
    await refundByTid(
      db as never,
      '999',
      'image_generate',
      1,
      undefined,
      price,
      b.ledgerId
    )
    expect(db.balance).toBe(low + price * 2)
    expect(db.ledger.filter(r => r.kind === 'refund')).toHaveLength(2)
  })

  it('a refund with no charge id behind it still works, as before', async () => {
    // Nothing is keyed, so nothing is deduplicated -- but the old callers that
    // cannot name a charge must not start failing. The guard is an addition,
    // not a new requirement.
    const db = fakeDb(1000)
    const r = await refundByTid(db as never, '999', 'image_generate')
    expect(r.ok).toBe(true)
  })
})
