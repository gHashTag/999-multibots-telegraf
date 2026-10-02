/**
 * UNSPENT TOKENS BURN A MONTH AFTER THEY LAND, AND THE PERSON IS WARNED FIRST.
 *
 * The welcome screen sells a month of tokens that burns. Until src/token-burn.ts
 * the ledger kept one balance with no dates, so the promise was not true of the
 * product. These tests pin the rule the wallet spec states: a month of life,
 * soonest-burn-first spending, nothing held before the burn started ever burns,
 * warnings at seven, three and one day -- and a burn written once per batch,
 * however many sweeps run.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  burnText,
  dueBurns,
  dueWarnings,
  forgetTokenBurnTables,
  lifeDaysOf,
  lotsOf,
  sweepTokenBurns,
  warningText,
  type LedgerEntry,
} from './src/token-burn'
import { forgetTokenLedgerTables } from './src/token-ledger'
import {
  MONTH_DAYS,
  START_DAYS,
  TOPUP_DAYS,
} from '../packages/vibee-atoms/src/spec/token-wallet.gen'

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 9, 1)

function row(
  id: number,
  delta: number,
  kind: string,
  day: number,
  extra: Partial<LedgerEntry> = {}
): LedgerEntry {
  return {
    id,
    delta,
    kind,
    reason: extra.reason ?? kind,
    ref: extra.ref ?? null,
    createdAt: T0 + day * DAY,
  }
}

describe('a batch lives a month', () => {
  it('reads the life of each kind from the wallet spec', () => {
    expect(lifeDaysOf({ kind: 'purchase', reason: 'Telegram Stars' })).toBe(
      TOPUP_DAYS
    )
    expect(lifeDaysOf({ kind: 'grant', reason: 'welcome tokens' })).toBe(
      START_DAYS
    )
    expect(lifeDaysOf({ kind: 'grant', reason: 'package month' })).toBe(
      MONTH_DAYS
    )
    expect(lifeDaysOf({ kind: 'refund', reason: 'x' })).toBe(TOPUP_DAYS)
    expect(lifeDaysOf({ kind: 'adjustment', reason: 'x' })).toBeNull()
  })

  it('never burns what was held before the burn started', () => {
    const lots = lotsOf(
      [row(1, 500, 'purchase', -1), row(2, 100, 'purchase', 0)],
      T0
    )
    expect(lots[0].burnsAt).toBeNull()
    expect(lots[1].burnsAt).toBe(T0 + 30 * DAY)
  })

  it('never burns an adjustment, such as the opening balance', () => {
    const lots = lotsOf([row(1, 300, 'adjustment', 5)], T0)
    expect(lots[0].burnsAt).toBeNull()
    expect(dueBurns(lots, T0 + 400 * DAY, 300)).toEqual([])
  })
})

describe('spending takes the batch that burns soonest', () => {
  it('spends the older batch before the newer one, and the undated last', () => {
    const lots = lotsOf(
      [
        row(1, 100, 'adjustment', 0),
        row(2, 100, 'purchase', 10),
        row(3, 100, 'purchase', 1),
        row(4, -150, 'spend', 12),
      ],
      T0
    )
    const left = Object.fromEntries(lots.map(l => [l.id, l.left]))
    expect(left).toEqual({ 1: 100, 2: 50, 3: 0 })
  })

  it('a burn row takes from its own batch', () => {
    const lots = lotsOf(
      [
        row(1, 100, 'purchase', 0),
        row(2, 100, 'purchase', 5),
        row(3, -100, 'expire', 30, { ref: 'burn:1' }),
      ],
      T0
    )
    expect(lots.map(l => l.left)).toEqual([0, 100])
  })
})

describe('what is due', () => {
  it('burns a batch on its day, never more than the balance', () => {
    const lots = lotsOf(
      [row(1, 100, 'purchase', 0), row(2, -30, 'spend', 3)],
      T0
    )
    expect(dueBurns(lots, T0 + 29 * DAY, 70)).toEqual([])
    expect(dueBurns(lots, T0 + 30 * DAY, 70)).toEqual([
      { lotId: 1, tokens: 70, burnsAt: T0 + 30 * DAY },
    ])
    expect(dueBurns(lots, T0 + 30 * DAY, 20)[0].tokens).toBe(20)
  })

  it('warns at the smallest threshold reached, and once', () => {
    const lots = lotsOf([row(1, 100, 'purchase', 0)], T0)
    expect(dueWarnings(lots, T0 + 22 * DAY, new Set())).toEqual([])
    expect(dueWarnings(lots, T0 + 23 * DAY, new Set())[0].days).toBe(7)
    // A service that slept through day 23 says "three days", not seven.
    expect(dueWarnings(lots, T0 + 28 * DAY, new Set())[0].days).toBe(3)
    expect(dueWarnings(lots, T0 + 29 * DAY, new Set())[0].days).toBe(1)
    expect(dueWarnings(lots, T0 + 23 * DAY, new Set(['1:7']))).toEqual([])
  })

  it('does not warn about a batch already spent', () => {
    const lots = lotsOf(
      [row(1, 100, 'purchase', 0), row(2, -100, 'spend', 1)],
      T0
    )
    expect(dueWarnings(lots, T0 + 25 * DAY, new Set())).toEqual([])
  })

  it('says how much, when, in both languages', () => {
    const text = warningText([
      { lotId: 1, days: 3, daysLeft: 3, tokens: 70, burnsAt: T0 + 30 * DAY },
    ])
    expect(text).toContain('70')
    expect(text).toContain('2026-10-31')
    expect(text).toContain('3 days')
    expect(burnText(70, 5)).toContain('Balance: 5')
  })
})

/** A Postgres small enough to reason about, with the guards the real one has. */
function fakeDb(
  start: Array<{ delta: number; kind: string; day: number; reason?: string }>
) {
  let nextId = 1
  const ledger = start.map(s => ({
    id: nextId++,
    telegram_id: '42',
    delta: s.delta,
    kind: s.kind,
    reason: s.reason ?? s.kind,
    ref: null as string | null,
    created_at: new Date(T0 + s.day * DAY).toISOString(),
  }))
  let balance = ledger.reduce((n, r) => n + r.delta, 0)
  const notices = new Set<string>()
  const sql: string[] = []
  const db = {
    get balance() {
      return balance
    },
    ledger,
    notices,
    sql,
    async query(text: string, params: any[] = []) {
      const s = text.replace(/\s+/g, ' ').trim()
      sql.push(s)
      if (/^(CREATE|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] }
      if (s.includes('FROM pg_constraint'))
        return {
          rows: [
            {
              conname: 'token_ledger_kind_check',
              def: "CHECK ((kind = ANY (ARRAY['purchase'::text, 'grant'::text])))",
            },
          ],
        }
      if (s.startsWith('INSERT INTO token_burn_clock')) return { rows: [] }
      if (s.startsWith('SELECT started_at FROM token_burn_clock'))
        return { rows: [{ started_at: new Date(T0).toISOString() }] }
      if (s.startsWith('SELECT DISTINCT telegram_id'))
        return { rows: [{ telegram_id: '42' }] }
      if (s.startsWith('SELECT balance FROM user_tokens'))
        return { rows: [{ balance }] }
      if (s.startsWith('SELECT id, delta, kind'))
        return { rows: ledger.map(r => ({ ...r })) }
      if (s.startsWith('SELECT 1 FROM token_ledger WHERE telegram_id'))
        return { rows: ledger.length ? [{}] : [] }
      if (s.startsWith('SELECT 1 FROM token_ledger WHERE kind')) {
        const [kind, ref] = params
        return {
          rows: ledger.some(r => r.kind === kind && r.ref === ref) ? [{}] : [],
        }
      }
      if (s.startsWith('UPDATE user_tokens SET balance = balance - ')) {
        const [, amount] = params
        if (balance < amount) return { rows: [] }
        balance -= amount
        return { rows: [{ balance }] }
      }
      if (s.startsWith('INSERT INTO token_ledger')) {
        const [tid, delta, , kind, reason, ref] = params
        if (ref != null && ledger.some(r => r.kind === kind && r.ref === ref))
          throw Object.assign(new Error('dup'), {
            code: '23505',
            constraint: 'token_ledger_once',
          })
        const id = nextId++
        ledger.push({
          id,
          telegram_id: tid,
          delta,
          kind,
          reason,
          ref,
          created_at: new Date().toISOString(),
        })
        return { rows: [{ id }] }
      }
      if (s.startsWith('SELECT lot_id, days FROM token_burn_notices'))
        return {
          rows: [...notices].map(k => {
            const [lot_id, days] = k.split(':')
            return { lot_id, days }
          }),
        }
      if (s.startsWith('INSERT INTO token_burn_notices')) {
        const k = `${params[0]}:${params[1]}`
        if (notices.has(k)) return { rows: [] }
        notices.add(k)
        return { rows: [{ lot_id: params[0] }] }
      }
      throw new Error('unexpected SQL: ' + s.slice(0, 80))
    },
  }
  return db
}

describe('the sweep', () => {
  beforeEach(() => {
    forgetTokenLedgerTables()
    forgetTokenBurnTables()
  })

  it('adds the expire kind to a ledger created before it existed', async () => {
    const db = fakeDb([])
    await sweepTokenBurns(db, { now: T0 + DAY })
    expect(
      db.sql.some(s =>
        s.startsWith(
          'ALTER TABLE token_ledger DROP CONSTRAINT token_ledger_kind_check'
        )
      )
    ).toBe(true)
  })

  it('burns a due batch once, however many sweeps run, and tells the person', async () => {
    const db = fakeDb([
      { delta: 100, kind: 'purchase', day: 0 },
      { delta: -30, kind: 'spend', day: 2 },
      { delta: 50, kind: 'purchase', day: 20 },
    ])
    const said: string[] = []
    const send = async (_id: string, text: string) => {
      said.push(text)
    }
    const first = await sweepTokenBurns(db, { now: T0 + 31 * DAY, send })
    expect(first.burned).toBe(70)
    expect(db.balance).toBe(50)
    const burn = db.ledger.find(r => r.kind === 'expire')
    expect(burn).toMatchObject({ delta: -70, ref: 'burn:1' })

    forgetTokenBurnTables()
    const second = await sweepTokenBurns(db, { now: T0 + 31 * DAY, send })
    expect(second.burned).toBe(0)
    expect(db.balance).toBe(50)
    expect(said.filter(t => t.includes('🔥'))).toHaveLength(1)
  })

  it('warns once per threshold, then once at the next one', async () => {
    const db = fakeDb([{ delta: 100, kind: 'purchase', day: 0 }])
    const said: string[] = []
    const send = async (_id: string, text: string) => {
      said.push(text)
    }
    await sweepTokenBurns(db, { now: T0 + 23 * DAY, send })
    await sweepTokenBurns(db, { now: T0 + 23 * DAY + 600_000, send })
    expect(said).toHaveLength(1)
    expect(said[0]).toContain('7 days')
    await sweepTokenBurns(db, { now: T0 + 27 * DAY + 1, send })
    expect(said).toHaveLength(2)
    expect(said[1]).toContain('3 days')
    expect(db.balance).toBe(100)
  })

  it('leaves alone what was bought before the burn started', async () => {
    const db = fakeDb([{ delta: 100, kind: 'purchase', day: -5 }])
    const out = await sweepTokenBurns(db, { now: T0 + 90 * DAY })
    expect(out.burned).toBe(0)
    expect(db.balance).toBe(100)
  })
})
