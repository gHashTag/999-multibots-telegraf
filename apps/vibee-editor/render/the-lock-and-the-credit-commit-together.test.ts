import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { creditStarsPayment } from './src/stars-credit'

/**
 * A DEATH BETWEEN THE LOCK AND THE CREDIT USED TO EAT THE PAYMENT.
 *
 * The lock is an INSERT into star_payments; the credit is an INSERT ... ON
 * CONFLICT into user_tokens. They were two separate `pool.query` calls, which
 * under node-postgres are two autocommit statements -- and, because
 * `Pool.query` checks a connection out per call, possibly on two different
 * physical connections.
 *
 * So a failure in the gap left the lock committed and the balance untouched,
 * and no retry could heal it: every later delivery finds the charge id
 * present, answers "redelivery of a payment already credited", and the buyer
 * is thanked for tokens nobody gave them. Telegram has the money, the tokens
 * are nowhere, nothing raises an error, and the owner's morning report counts
 * it as a healthy sale.
 *
 * It needs a process or connection death inside a two-statement window, so it
 * is "has never happened", not "cannot happen". It is also the only failure on
 * this path that leaves no trace at all -- which is why it is worth a
 * transaction rather than a note.
 */

/** A pool that lends a client, like `pg` does, and records what ran on it. */
function poolWithClient(
  onQuery: (sql: string) => { rowCount: number } | Error = () => ({
    rowCount: 1,
  })
) {
  const ran: string[] = []
  const client = {
    query: vi.fn(async (sql: string) => {
      ran.push(sql.trim().split('\n')[0].trim())
      const out = onQuery(sql)
      if (out instanceof Error) throw out
      return { rows: [], ...out }
    }),
    release: vi.fn(),
  }
  return {
    ran,
    client,
    pool: {
      query: vi.fn(async (sql: string) => {
        ran.push('POOL: ' + sql.trim().split('\n')[0].trim())
        return { rows: [], rowCount: 1 }
      }),
      connect: vi.fn(async () => client),
    },
  }
}

const PAYMENT = { chargeId: 'ch_1', telegramId: '77', amount: 10 }

describe('the lock and the credit commit together', () => {
  it('both statements run on ONE borrowed connection, inside BEGIN/COMMIT', async () => {
    const { pool, ran, client } = poolWithClient()
    const out = await creditStarsPayment(pool as never, PAYMENT)
    expect(out.credited).toBe(true)
    expect(pool.connect).toHaveBeenCalledTimes(1)
    expect(ran).toContain('BEGIN')
    expect(ran).toContain('COMMIT')
    const begin = ran.indexOf('BEGIN')
    const commit = ran.indexOf('COMMIT')
    const lock = ran.findIndex(s => s.includes('INSERT INTO star_payments'))
    const credit = ran.findIndex(s => s.includes('INSERT INTO user_tokens'))
    expect(lock, 'the lock is inside the transaction').toBeGreaterThan(begin)
    expect(credit, 'the credit follows the lock').toBeGreaterThan(lock)
    expect(commit, 'and both are inside it').toBeGreaterThan(credit)
    expect(client.release).toHaveBeenCalled()
  })

  /**
   * THE ONE THAT MATTERS. If the credit fails, the lock must not survive --
   * otherwise the charge id is taken for ever and the money is gone.
   */
  it('a credit that fails rolls the lock back and raises', async () => {
    const { pool, ran, client } = poolWithClient(sql =>
      sql.includes('INSERT INTO user_tokens') && sql.includes('ON CONFLICT')
        ? new Error('connection terminated')
        : { rowCount: 1 }
    )
    await expect(creditStarsPayment(pool as never, PAYMENT)).rejects.toThrow(
      /connection terminated/
    )
    expect(ran).toContain('ROLLBACK')
    expect(ran).not.toContain('COMMIT')
    expect(
      client.release,
      'the connection goes back to the pool'
    ).toHaveBeenCalled()
  })

  it('a redelivery commits nothing and says so', async () => {
    const { pool, ran } = poolWithClient(sql =>
      sql.includes('INSERT INTO star_payments')
        ? { rowCount: 0 }
        : { rowCount: 1 }
    )
    const out = await creditStarsPayment(pool as never, PAYMENT)
    expect(out.credited).toBe(false)
    expect(out.reason).toMatch(/redeliver/i)
    expect(
      ran.some(
        s => s.includes('INSERT INTO user_tokens') && s.includes('ON CONFLICT')
      ),
      'no balance moves on a redelivery'
    ).toBe(false)
    expect(ran).toContain('COMMIT')
  })

  /**
   * Every existing test hands in a plain object with only `query`. The
   * transaction must be an improvement for production, not a new requirement
   * on everyone who wants to exercise this function.
   */
  it('a pool without connect keeps the old path and still credits', async () => {
    const ran: string[] = []
    const plain = {
      query: async (sql: string) => {
        ran.push(sql.trim().split('\n')[0].trim())
        return { rows: [], rowCount: 1 }
      },
    }
    const out = await creditStarsPayment(plain as never, PAYMENT)
    expect(out.credited).toBe(true)
    expect(ran).not.toContain('BEGIN')
    expect(ran.some(s => s.includes('INSERT INTO user_tokens'))).toBe(true)
  })
})

/**
 * AND THE PRODUCTION CALLERS MUST ACTUALLY REACH THE TRANSACTION.
 *
 * The fallback exists so tests can hand in a plain object -- which means a
 * future refactor that wraps the pool would silently drop production back to
 * two autocommit statements, with every test above still green. Reachability,
 * not definition: the server must pass the `pg` Pool itself.
 */
describe('the server hands in a pool that can lend a connection', () => {
  const server = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')

  it('the file under test is the one that credits', () => {
    // Positive control: without this a wrong path reads as clean.
    expect(server).toContain('creditStarsPayment(pool, {')
    expect(server.match(/creditStarsPayment\(pool, \{/g)?.length).toBe(2)
  })

  it('getPool returns a real pg Pool, not a wrapper', () => {
    expect(server).toContain("import { Pool } from 'pg'")
    expect(server).toContain('function getPool(): Pool {')
    expect(server).toContain('pgPool = new Pool({')
    // A wrapper object would be built here instead; nothing must sit between
    // the Pool and the caller.
    expect(server).toContain('return pgPool')
  })
})
