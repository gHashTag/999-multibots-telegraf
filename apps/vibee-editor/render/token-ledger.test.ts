/**
 * THE TOKEN LEDGER: EVERY MOVEMENT LEAVES A ROW, AND ONLY THE LEDGER MOVES TOKENS.
 *
 * Owner, 2026-09-09: "every payment must be tracked; we must know exactly what
 * each expense was for". `user_tokens` alone could not answer that: seven
 * writers changed the integer with no record of why. This file proves the
 * replacement without a database, with a fake that behaves like Postgres for
 * the statements that matter, and pins structurally that no other file writes
 * `user_tokens` any more.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  moveTokens,
  grantWelcomeIfNew,
  tokenHistory,
  ledgerDrift,
  forgetTokenLedgerTables,
  OPENING_REASON,
} from './src/token-ledger'

type Row = {
  telegram_id: string
  delta: number
  balance_after: number | null
  kind: string
  reason: string
  ref: string | null
}

function fakePool(
  opts: { failLedgerOnce?: boolean; transactional?: boolean } = {}
) {
  const balances = new Map<string, number>()
  const ledger: Row[] = []
  const log: string[] = []
  let failLedger = !!opts.failLedgerOnce
  let snapshot: { balances: Map<string, number>; ledger: Row[] } | null = null
  const q = {
    balances,
    ledger,
    log,
    async query(sql: string, params: unknown[] = []) {
      const head = sql.trim().split('\n')[0].trim()
      log.push(head)
      if (head === 'BEGIN') {
        snapshot = { balances: new Map(balances), ledger: [...ledger] }
        return { rows: [] }
      }
      if (head === 'COMMIT') {
        snapshot = null
        return { rows: [] }
      }
      if (head === 'ROLLBACK') {
        if (snapshot) {
          balances.clear()
          for (const [k, v] of snapshot.balances) balances.set(k, v)
          ledger.length = 0
          ledger.push(...snapshot.ledger)
        }
        return { rows: [] }
      }
      if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX'))
        return { rows: [] }
      const tid = String(params[0])
      if (sql.includes('SELECT balance FROM user_tokens'))
        return {
          rows: balances.has(tid) ? [{ balance: balances.get(tid) }] : [],
        }
      if (sql.includes('SELECT 1 FROM token_ledger'))
        return {
          rows: ledger.some(r => r.telegram_id === tid)
            ? [{ '?column?': 1 }]
            : [],
        }
      if (
        sql.includes('INSERT INTO user_tokens') &&
        sql.includes('DO NOTHING RETURNING')
      ) {
        if (balances.has(tid)) return { rows: [], rowCount: 0 }
        balances.set(tid, Number(params[1]))
        return { rows: [{ balance: Number(params[1]) }], rowCount: 1 }
      }
      if (
        sql.includes('UPDATE user_tokens SET balance = balance + $2') &&
        sql.includes('WHERE telegram_id = $1 RETURNING balance')
      ) {
        if (!balances.has(tid)) return { rows: [], rowCount: 0 }
        balances.set(tid, balances.get(tid)! + Number(params[1]))
        return { rows: [{ balance: balances.get(tid) }], rowCount: 1 }
      }
      if (
        sql.includes('INSERT INTO user_tokens') &&
        /DO UPDATE SET balance = user_tokens\.balance \+ \$2/.test(sql)
      ) {
        balances.set(tid, (balances.get(tid) ?? 0) + Number(params[1]))
        return { rows: [{ balance: balances.get(tid) }], rowCount: 1 }
      }
      if (
        sql.includes('UPDATE user_tokens SET balance = balance - $2') &&
        sql.includes('balance >= $2')
      ) {
        const cur = balances.get(tid)
        const price = Number(params[1])
        if (cur === undefined || cur < price) return { rows: [], rowCount: 0 }
        balances.set(tid, cur - price)
        return { rows: [{ balance: cur - price }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO token_ledger')) {
        if (failLedger) {
          failLedger = false
          throw new Error('ledger write failed (simulated)')
        }
        const [telegram_id, delta, balance_after, kind, reason, ref] =
          sql.includes("'adjustment'")
            ? [
                String(params[0]),
                Number(params[1]),
                Number(params[2]),
                'adjustment',
                String(params[3]),
                null,
              ]
            : sql.includes("'grant'")
              ? [
                  String(params[0]),
                  Number(params[1]),
                  Number(params[1]),
                  'grant',
                  'welcome tokens',
                  null,
                ]
              : [
                  String(params[0]),
                  Number(params[1]),
                  params[2] == null ? null : Number(params[2]),
                  String(params[3]),
                  String(params[4]),
                  params[5] == null ? null : String(params[5]),
                ]
        ledger.push({ telegram_id, delta, balance_after, kind, reason, ref })
        return { rows: [], rowCount: 1 }
      }
      if (sql.includes('FROM token_ledger WHERE telegram_id = $1'))
        return {
          rows: [...ledger]
            .filter(r => r.telegram_id === tid)
            .reverse()
            .slice(0, Number(params[1])),
        }
      if (sql.trim() === 'SELECT telegram_id, balance FROM user_tokens') {
        return {
          rows: [...balances].map(([telegram_id, balance]) => ({
            telegram_id,
            balance,
          })),
        }
      }
      if (sql.includes('SUM(delta) AS delta FROM token_ledger GROUP BY')) {
        const rows: any[] = []
        for (const id of new Set(ledger.map(r => r.telegram_id))) {
          rows.push({
            telegram_id: id,
            delta: ledger
              .filter(r => r.telegram_id === id)
              .reduce((a, r) => a + r.delta, 0),
          })
        }
        return { rows }
      }
      throw new Error(`fake pool does not know: ${head}`)
    },
  }
  if (opts.transactional) {
    return Object.assign(q, {
      async connect() {
        return Object.assign(Object.create(q), { release() {} })
      },
    })
  }
  return q
}

beforeEach(() => forgetTokenLedgerTables())

describe('moveTokens', () => {
  it('a purchase on a new person credits and writes one purchase row with the reference', async () => {
    const pool = fakePool()
    const r = await moveTokens(pool, {
      telegramId: '1',
      delta: 50,
      kind: 'purchase',
      reason: 'Telegram Stars',
      ref: 'charge_1',
    })
    expect(r).toEqual({ ok: true, balance: 50 })
    expect(pool.ledger).toEqual([
      {
        telegram_id: '1',
        delta: 50,
        balance_after: 50,
        kind: 'purchase',
        reason: 'Telegram Stars',
        ref: 'charge_1',
      },
    ])
  })

  it('a spend within the balance writes a spend row; an overdraft writes nothing and moves nothing', async () => {
    const pool = fakePool()
    await moveTokens(pool, {
      telegramId: '1',
      delta: 50,
      kind: 'purchase',
      reason: 'Telegram Stars',
    })
    const ok = await moveTokens(pool, {
      telegramId: '1',
      delta: -20,
      kind: 'spend',
      reason: 'image_generate kie/flux',
    })
    expect(ok).toEqual({ ok: true, balance: 30 })
    const refused = await moveTokens(pool, {
      telegramId: '1',
      delta: -31,
      kind: 'spend',
      reason: 'video_generate',
    })
    expect(refused).toEqual({ ok: false, balance: 30, reason: 'insufficient' })
    expect(pool.balances.get('1')).toBe(30)
    expect(pool.ledger.map(r => r.delta)).toEqual([50, -20])
  })

  it('a balance that predates the ledger gets an opening row first, so the sum matches from then on', async () => {
    const pool = fakePool()
    pool.balances.set('owner', 5000) // written before the ledger existed
    const r = await moveTokens(pool, {
      telegramId: 'owner',
      delta: -12,
      kind: 'spend',
      reason: 'audio_generate',
    })
    expect(r).toEqual({ ok: true, balance: 4988 })
    expect(pool.ledger[0]).toMatchObject({
      kind: 'adjustment',
      delta: 5000,
      balance_after: 5000,
      reason: OPENING_REASON,
    })
    expect(pool.ledger[1]).toMatchObject({
      kind: 'spend',
      delta: -12,
      balance_after: 4988,
    })
    expect(await ledgerDrift(pool)).toEqual([])
  })

  it('refuses a zero or fractional delta without touching anything', async () => {
    const pool = fakePool()
    expect(
      (
        await moveTokens(pool, {
          telegramId: '1',
          delta: 0,
          kind: 'spend',
          reason: 'x',
        })
      ).ok
    ).toBe(false)
    expect(
      (
        await moveTokens(pool, {
          telegramId: '1',
          delta: 1.5,
          kind: 'spend',
          reason: 'x',
        })
      ).ok
    ).toBe(false)
    expect(pool.ledger).toEqual([])
  })

  it('on a pool that lends connections the move is one transaction: a failed ledger write rolls the balance back', async () => {
    const pool = fakePool({ transactional: true, failLedgerOnce: true })
    pool.balances.set('1', 100)
    pool.ledger.push({
      telegram_id: '1',
      delta: 100,
      balance_after: 100,
      kind: 'purchase',
      reason: 'seed',
      ref: null,
    })
    await expect(
      moveTokens(pool, {
        telegramId: '1',
        delta: -40,
        kind: 'spend',
        reason: 'reel_render',
      })
    ).rejects.toThrow(/ledger write failed/)
    expect(pool.balances.get('1')).toBe(100)
    expect(pool.log).toContain('BEGIN')
    expect(pool.log).toContain('ROLLBACK')
    expect(pool.ledger.length).toBe(1)
  })
})

describe('grantWelcomeIfNew', () => {
  it('grants once, records it as a grant, and is silent the second time', async () => {
    const pool = fakePool()
    expect(await grantWelcomeIfNew(pool, '7', 20)).toBe(20)
    expect(await grantWelcomeIfNew(pool, '7', 20)).toBe(20)
    expect(pool.ledger).toEqual([
      {
        telegram_id: '7',
        delta: 20,
        balance_after: 20,
        kind: 'grant',
        reason: 'welcome tokens',
        ref: null,
      },
    ])
  })
})

describe('tokenHistory', () => {
  it('returns the newest rows first, capped', async () => {
    const pool = fakePool()
    await moveTokens(pool, {
      telegramId: '1',
      delta: 50,
      kind: 'purchase',
      reason: 'Telegram Stars',
    })
    await moveTokens(pool, {
      telegramId: '1',
      delta: -2,
      kind: 'spend',
      reason: 'image_generate',
    })
    const h = await tokenHistory(pool, '1', 1)
    expect(h.length).toBe(1)
    expect(h[0]).toMatchObject({ kind: 'spend', delta: -2 })
  })
})

describe('the ledger is the only writer of user_tokens', () => {
  it('no other source file writes the balance directly', () => {
    const root = path.join(__dirname)
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'e2e')
          continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (
          p.endsWith('.ts') &&
          !p.endsWith('.test.ts') &&
          !p.endsWith(path.join('src', 'token-ledger.ts'))
        ) {
          const s = fs.readFileSync(p, 'utf8')
          if (
            /UPDATE user_tokens|INSERT INTO user_tokens|DELETE FROM user_tokens/.test(
              s
            )
          )
            offenders.push(path.relative(root, p))
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
