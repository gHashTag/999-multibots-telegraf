/**
 * UNSPENT TOKENS BURN A MONTH AFTER THEY LAND -- and the person hears about it
 * at seven, three and one day before.
 *
 * Owner, 2026-10-01: all money goes into tokens, and tokens not spent within
 * the month burn, so a person who paid makes content instead of saving it. The
 * numbers are the wallet spec's (packages/vibee-atoms/src/spec/token-wallet.t27):
 * a month is MONTH_DAYS, the spend order is SPEND_ORDER ("soonest-burn-first"),
 * and BURNS_BACKDATED is false -- nothing held before the burn started burns.
 * The welcome screen promised this before it existed; this file is what makes
 * the promise true.
 *
 * NO NEW BALANCE. The ledger already holds every movement with its date, so
 * the batches ("lots") are read from it, not kept beside it: every credit is a
 * lot, every debit eats the lot that burns soonest, and a burn is one more
 * ledger row (kind 'expire', ref `burn:<lot id>`) written through moveTokens
 * -- the only door -- with `once`, so two instances sweeping during a deploy
 * cannot burn the same lot twice.
 *
 * WHAT BURNS AND WHAT DOES NOT.
 *   purchase  -- TOPUP_DAYS after it landed (owner's rule: bought tokens burn
 *                like the package month);
 *   grant     -- START_DAYS for the welcome gift, MONTH_DAYS for any other;
 *   refund    -- a fresh TOPUP_DAYS from the refund: the tokens come back as a
 *                new batch rather than into the one they were spent from,
 *                which can only ever give a person more time, never less;
 *   adjustment, and every credit dated before the burn started -- never.
 *
 * The burn start is the moment the first sweep ran, recorded once in
 * token_burn_clock and never moved: a person who bought before the rule was
 * live keeps those tokens.
 */
import {
  MONTH_DAYS,
  START_DAYS,
  TOPUP_DAYS,
  WARN_DAYS_FIRST,
  WARN_DAYS_LAST,
  WARN_DAYS_SECOND,
} from '../../packages/vibee-atoms/src/spec/token-wallet.gen'
import { ensureTokenLedger, moveTokens, type Queryable } from './token-ledger'

const DAY_MS = 24 * 60 * 60 * 1000

/** Smallest first: a lot is warned at the smallest threshold it has reached. */
export const WARN_DAYS = [WARN_DAYS_LAST, WARN_DAYS_SECOND, WARN_DAYS_FIRST]

export const BURN_REASON = 'unspent tokens burned a month after they landed'

export interface LedgerEntry {
  id: number
  delta: number
  kind: string
  reason: string
  ref: string | null
  /** ms since epoch */
  createdAt: number
}

export interface Lot {
  /** The ledger row that credited it. */
  id: number
  amount: number
  left: number
  /** ms since epoch; null for tokens that never burn. */
  burnsAt: number | null
}

/** Days a credit lives, or null when it never burns. */
export function lifeDaysOf(
  e: Pick<LedgerEntry, 'kind' | 'reason'>
): number | null {
  if (e.kind === 'purchase' || e.kind === 'refund') return TOPUP_DAYS
  if (e.kind === 'grant')
    return e.reason === 'welcome tokens' ? START_DAYS : MONTH_DAYS
  return null
}

function lotOfBurnRef(ref: string | null): number | null {
  const m = /^burn:(\d+)$/.exec(ref ?? '')
  return m ? Number(m[1]) : null
}

/**
 * The person's batches as they stand after every ledger row, replayed in the
 * order they were written. A debit takes from the lot that burns soonest; the
 * lots that never burn are spent last. A burn row takes from its own lot.
 */
export function lotsOf(
  entries: readonly LedgerEntry[],
  burnStart: number
): Lot[] {
  const lots: Lot[] = []
  const byId = new Map<number, Lot>()
  const sorted = [...entries].sort((a, b) => a.id - b.id)
  for (const e of sorted) {
    if (e.delta > 0) {
      const life = lifeDaysOf(e)
      const lot: Lot = {
        id: e.id,
        amount: e.delta,
        left: e.delta,
        burnsAt:
          life != null && e.createdAt >= burnStart
            ? e.createdAt + life * DAY_MS
            : null,
      }
      lots.push(lot)
      byId.set(lot.id, lot)
      continue
    }
    let owed = -e.delta
    if (e.kind === 'expire') {
      const own = byId.get(lotOfBurnRef(e.ref) ?? -1)
      if (own) {
        const take = Math.min(owed, own.left)
        own.left -= take
        owed -= take
      }
    }
    if (owed <= 0) continue
    const order = lots
      .filter(l => l.left > 0)
      .sort(
        (a, b) =>
          (a.burnsAt ?? Infinity) - (b.burnsAt ?? Infinity) || a.id - b.id
      )
    for (const l of order) {
      if (owed <= 0) break
      const take = Math.min(owed, l.left)
      l.left -= take
      owed -= take
    }
    // A debit larger than every lot means the ledger began after the balance
    // did (no opening row) -- nothing left to attribute it to, nothing burns.
  }
  return lots
}

export interface DueBurn {
  lotId: number
  tokens: number
  burnsAt: number
}

/**
 * Lots past their date with tokens still in them, capped by what the person
 * actually holds: a burn is never larger than the balance.
 */
export function dueBurns(
  lots: readonly Lot[],
  now: number,
  balance: number
): DueBurn[] {
  let room = Math.max(0, balance)
  const out: DueBurn[] = []
  const due = lots
    .filter(l => l.burnsAt != null && l.burnsAt <= now && l.left > 0)
    .sort(
      (a, b) => (a.burnsAt as number) - (b.burnsAt as number) || a.id - b.id
    )
  for (const l of due) {
    const tokens = Math.min(l.left, room)
    if (tokens <= 0) break
    out.push({ lotId: l.id, tokens, burnsAt: l.burnsAt as number })
    room -= tokens
  }
  return out
}

export interface DueWarning {
  lotId: number
  /** The threshold reached: 7, 3 or 1. */
  days: number
  /** Whole days until the burn, rounded up (1..days). */
  daysLeft: number
  tokens: number
  burnsAt: number
}

/**
 * Lots that reached a warning threshold not yet sent for them. Only the
 * smallest threshold reached is due: a sweep that missed the seven-day mark
 * because the service was down says "three days", not both.
 */
export function dueWarnings(
  lots: readonly Lot[],
  now: number,
  sent: ReadonlySet<string>
): DueWarning[] {
  const out: DueWarning[] = []
  for (const l of lots) {
    if (l.burnsAt == null || l.left <= 0 || l.burnsAt <= now) continue
    const daysLeft = Math.ceil((l.burnsAt - now) / DAY_MS)
    const days = WARN_DAYS.find(t => daysLeft <= t)
    if (days == null || sent.has(`${l.id}:${days}`)) continue
    out.push({
      lotId: l.id,
      days,
      daysLeft,
      tokens: l.left,
      burnsAt: l.burnsAt,
    })
  }
  return out
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * What the person reads. Both languages in one message: render does not know
 * a person's language (it lives in the bot's users table), and a warning in
 * the wrong language is still a warning, while a missing one costs tokens.
 */
export function warningText(ws: readonly DueWarning[]): string {
  const tokens = ws.reduce((n, w) => n + w.tokens, 0)
  const soonest = ws.reduce((a, b) => (a.burnsAt <= b.burnsAt ? a : b))
  const d = soonest.daysLeft
  return [
    `⏳ ${tokens} токенов сгорят через ${d} дн. (${dayOf(soonest.burnsAt)}), если их не потратить. Сделайте на них контент — рилс, портрет, пост.`, // cyrillic-ok
    `⏳ ${tokens} tokens burn in ${d} day${d === 1 ? '' : 's'} (${dayOf(soonest.burnsAt)}) unless spent. Turn them into content — a reel, a portrait, a post.`,
  ].join('\n\n')
}

export function burnText(tokens: number, balance: number): string {
  return [
    `🔥 Сгорело ${tokens} неиспользованных токенов: с их поступления прошёл месяц. Баланс: ${balance}.`, // cyrillic-ok
    `🔥 ${tokens} unspent tokens burned: a month has passed since they arrived. Balance: ${balance}.`,
  ].join('\n\n')
}

type Client = Queryable & { release: () => void }
type MaybePool = Queryable & { connect?: () => Promise<Client> }

let tablesReady = false

/** Tests only. */
export function forgetTokenBurnTables(): void {
  tablesReady = false
}

/**
 * The burn's own tables, and 'expire' in the ledger's kind list on a database
 * whose ledger was created before the kind existed. The CHECK is replaced in
 * one ALTER only when its definition lacks 'expire', so a second start does
 * nothing.
 */
export async function ensureTokenBurn(q: Queryable): Promise<void> {
  if (tablesReady) return
  await ensureTokenLedger(q)
  const c = await q.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'token_ledger'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%kind%'`,
    []
  )
  for (const row of c.rows as Array<{ conname: string; def: string }>) {
    if (String(row.def).includes(`'expire'`)) continue
    if (!/^[a-z0-9_]+$/.test(String(row.conname))) continue
    await q.query(
      `ALTER TABLE token_ledger DROP CONSTRAINT ${row.conname},
         ADD CONSTRAINT ${row.conname} CHECK (kind IN ('purchase','grant','spend','refund','adjustment','expire'))`,
      []
    )
  }
  await q.query(
    `CREATE TABLE IF NOT EXISTS token_burn_clock (
       one boolean PRIMARY KEY DEFAULT true CHECK (one),
       started_at timestamptz NOT NULL DEFAULT now()
     )`,
    []
  )
  await q.query(
    `CREATE TABLE IF NOT EXISTS token_burn_notices (
       lot_id bigint NOT NULL,
       days int NOT NULL,
       telegram_id text NOT NULL,
       sent_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (lot_id, days)
     )`,
    []
  )
  tablesReady = true
}

/** When the burn started: written by the first sweep, never moved after. */
export async function burnStartOf(q: Queryable): Promise<number> {
  await q.query(
    `INSERT INTO token_burn_clock DEFAULT VALUES ON CONFLICT DO NOTHING`,
    []
  )
  const r = await q.query(`SELECT started_at FROM token_burn_clock`, [])
  const at = new Date(r.rows[0]?.started_at).getTime()
  if (!Number.isFinite(at)) throw new Error('token_burn_clock has no start')
  return at
}

async function inOwnTransaction<T>(
  pool: MaybePool,
  work: (q: Queryable) => Promise<T>
): Promise<T> {
  if (typeof pool.connect !== 'function') return work(pool)
  const client = await pool.connect()
  try {
    await client.query('BEGIN', [])
    const out = await work(client)
    await client.query('COMMIT', [])
    return out
  } catch (e) {
    await client.query('ROLLBACK', []).catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

export interface SweepOutcome {
  people: number
  burned: number
  warned: number
}

/**
 * One pass: burn what is due, warn whoever reached a threshold. Safe to run
 * from two instances at once -- the person's balance row is locked for the
 * pass, a burn is written `once` per lot, and a warning is sent only by the
 * pass whose INSERT into token_burn_notices went through.
 */
export async function sweepTokenBurns(
  pool: MaybePool,
  opts: {
    now?: number
    send?: (telegramId: string, text: string) => Promise<void>
  } = {}
): Promise<SweepOutcome> {
  const now = opts.now ?? Date.now()
  await ensureTokenBurn(pool)
  const burnStart = await burnStartOf(pool)
  const out: SweepOutcome = { people: 0, burned: 0, warned: 0 }
  if (burnStart > now) return out

  // Who might have something due: a burning credit since the burn started,
  // old enough to be inside the first warning. The 120-day floor only bounds
  // the scan; a sweep runs every few minutes, so nothing waits that long.
  const longest = Math.max(MONTH_DAYS, START_DAYS, TOPUP_DAYS)
  const shortest = Math.min(MONTH_DAYS, START_DAYS, TOPUP_DAYS)
  const from = Math.max(burnStart, now - (longest + 90) * DAY_MS)
  const to = now - (shortest - WARN_DAYS_FIRST) * DAY_MS
  const who = await pool.query(
    `SELECT DISTINCT telegram_id FROM token_ledger
      WHERE kind IN ('purchase','grant','refund')
        AND created_at >= $1 AND created_at <= $2`,
    [new Date(from).toISOString(), new Date(to).toISOString()]
  )

  for (const { telegram_id } of who.rows as Array<{ telegram_id: string }>) {
    const tid = String(telegram_id)
    try {
      const done = await inOwnTransaction(pool, async q => {
        const bal = await q.query(
          `SELECT balance FROM user_tokens WHERE telegram_id = $1 FOR UPDATE`,
          [tid]
        )
        let balance = Number(bal.rows[0]?.balance ?? 0)
        const rows = await q.query(
          `SELECT id, delta, kind, reason, ref, created_at FROM token_ledger
            WHERE telegram_id = $1 ORDER BY id`,
          [tid]
        )
        const lots = lotsOf(
          (rows.rows as any[]).map(r => ({
            id: Number(r.id),
            delta: Number(r.delta),
            kind: String(r.kind),
            reason: String(r.reason ?? ''),
            ref: r.ref == null ? null : String(r.ref),
            createdAt: new Date(r.created_at).getTime(),
          })),
          burnStart
        )

        let burned = 0
        for (const b of dueBurns(lots, now, balance)) {
          const moved = await moveTokens(q as MaybePool, {
            telegramId: tid,
            delta: -b.tokens,
            kind: 'expire',
            reason: BURN_REASON,
            ref: `burn:${b.lotId}`,
            once: true,
            meta: { lot: b.lotId, burns_at: new Date(b.burnsAt).toISOString() },
          })
          if (moved.ok) {
            burned += b.tokens
            balance = moved.balance
            const lot = lots.find(l => l.id === b.lotId)
            if (lot) lot.left -= b.tokens
          }
        }

        const sentRows = await q.query(
          `SELECT lot_id, days FROM token_burn_notices WHERE telegram_id = $1`,
          [tid]
        )
        const sent = new Set(
          (sentRows.rows as any[]).map(
            r => `${Number(r.lot_id)}:${Number(r.days)}`
          )
        )
        const warnings: DueWarning[] = []
        for (const w of dueWarnings(lots, now, sent)) {
          // Mark this threshold and every larger one: a lot warned at three
          // days is not warned at seven afterwards.
          let mine = false
          for (const t of WARN_DAYS.filter(t => t >= w.days)) {
            const ins = await q.query(
              `INSERT INTO token_burn_notices (lot_id, days, telegram_id)
                 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING lot_id`,
              [w.lotId, t, tid]
            )
            if (t === w.days && ins.rows.length > 0) mine = true
          }
          if (mine) warnings.push(w)
        }
        return { burned, balance, warnings }
      })

      // Messages go out after the commit: no network call holds the lock.
      const send = opts.send
      if (done.burned > 0 || done.warnings.length > 0) out.people++
      if (done.burned > 0) {
        out.burned += done.burned
        if (send)
          await send(tid, burnText(done.burned, done.balance)).catch(e =>
            console.warn(
              '[token-burn] burn notice not sent:',
              String(e).slice(0, 160)
            )
          )
      }
      if (done.warnings.length > 0) {
        out.warned++
        if (send)
          await send(tid, warningText(done.warnings)).catch(e =>
            console.warn(
              '[token-burn] warning not sent:',
              String(e).slice(0, 160)
            )
          )
      }
    } catch (e) {
      console.error(`[token-burn] ${tid}:`, String(e).slice(0, 300))
    }
  }
  return out
}
