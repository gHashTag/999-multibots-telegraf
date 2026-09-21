import { Pool } from 'pg'
import { logger } from '@/utils/logger'

/**
 * WHAT PEOPLE DO BETWEEN ARRIVING AND PAYING.
 *
 * Two tables already record the ends of the funnel: `payments_v2` knows about
 * invoices and charges, `prompts_history` knows about generations. Nothing
 * knows the middle -- and the middle is where everybody stops. 2380 people have
 * registered; 354 have ever generated anything.
 *
 * It is also why a payment defect lived nine months unnoticed. Top-ups stopped
 * completing in December 2025 and the only trace was rows sitting in PENDING.
 * The logs could not hold the evidence either: measured 2026-09-08, the whole
 * available log window is as old as the container, and this service deploys
 * many times a day. A population that a deploy erases is not a population.
 *
 * ── WHY THIS WROTE NOTHING FOR TWO WEEKS ───────────────────────────────────
 *
 * Measured 2026-09-22: `user_events` existed in NEITHER database. The rows
 * went to cloud Supabase through PostgREST, which cannot create a table, the
 * migration (sql/migrations/20260908_user_events.sql) was never applied, and
 * a missing table was treated here as an ordinary outcome that deserved no log
 * line. So every step since 2026-09-08 was dropped in silence -- including the
 * one question the club needed answered: did anybody even SEE it?
 *
 * Now the table lives in the render Postgres, next to `user_tokens` and
 * `client_events` (the same database, the same env vars as the wallet), and is
 * created on first use, so there is no migration left to forget. And a failed
 * write is LOGGED, every time: silence is what hid the last two weeks.
 *
 * THE ONE RULE THAT STAYS: writing this may never be a reason a person waits,
 * and may never be a reason a person gets nothing. So every call site is
 * fire-and-forget -- `void track(...)`, not `await` -- and nothing here ever
 * reaches the caller as an exception.
 */

/**
 * The steps worth recording, and no others.
 *
 * Kept to a closed list on purpose: a free-text event name drifts, and a funnel
 * counted over drifting names measures the naming rather than the people.
 */
export type TrackedEvent =
  /** /start received -- the top of the funnel, and the only step everybody takes. */
  | 'start'
  /** The main menu was shown. Every path in the product ends here. */
  | 'menu_shown'
  /** They asked to top up: pressed the button or entered the payment scene. */
  | 'topup_opened'
  /** They asked for something paid and did not have the balance for it. */
  | 'refused_no_balance'
  /** They wrote something and nothing in the whole chain answered. */
  | 'unanswered_message'
  /** They pressed a button whose id reached no handler. */
  | 'unanswered_press'
  /** The club card (price, what is inside, the join button) was shown. */
  | 'club_card_shown'
  /** They pressed join and the cashier minted a club invoice for them. */
  | 'club_invoice_created'
  /** Telegram charged a club month (the first one or a renewal). */
  | 'club_paid'
  /** An invoice was minted and no charge followed it (see markAbandonedClubInvoices). */
  | 'club_invoice_abandoned'

interface Ctx {
  from?: { id?: number | string }
  botInfo?: { username?: string }
  chat?: { type?: string }
}

/** The slice of `pg` this file uses; a test passes a double of exactly this. */
export interface EventsPool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

let pool: EventsPool | null = null
let schemaReady: Promise<void> | null = null

/**
 * The events database: the render Postgres.
 *
 * Deliberately NOT `DATABASE_URL`, for the reason the wallet gives: a shell
 * (and more than one service) already has that pointing somewhere else, and a
 * funnel that silently attaches to the wrong database counts nobody.
 */
function getPool(): EventsPool {
  if (pool) return pool
  const url =
    process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''
  if (!url) {
    throw new Error(
      'TOKENS_DATABASE_URL is not set: funnel events cannot be stored'
    )
  }
  const p = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 8000,
    idle_in_transaction_session_timeout: 10000,
  })
  p.on('error', error => {
    logger.error('funnel events pool error', { error: error.message })
  })
  pool = p
  return p
}

/** For tests: a double in place of the database, or null to drop it. */
export function setEventsPoolForTests(p: EventsPool | null): void {
  pool = p
  schemaReady = null
}

/**
 * The shape the migration file always described, plus one index: a marked
 * abandoned invoice is marked once, whoever runs the sweep and however often.
 */
const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS user_events (
     id BIGSERIAL PRIMARY KEY,
     telegram_id TEXT NOT NULL,
     bot_name TEXT,
     event TEXT NOT NULL,
     detail JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_user_events_created_at
     ON user_events (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_user_events_telegram_id
     ON user_events (telegram_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_user_events_event
     ON user_events (event, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_events_abandoned_once
     ON user_events ((detail->>'invoice_event'))
     WHERE event = 'club_invoice_abandoned'`,
]

/** Created once per process; a failed attempt is retried on the next call. */
function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    const p = getPool()
    for (const sql of SCHEMA_SQL) await p.query(sql)
  })().catch(error => {
    schemaReady = null
    throw error
  })
  return schemaReady
}

/**
 * Record one step. Never throws, never blocks, never awaited by the caller.
 *
 * Returns whether the row landed, so a test (and a caller that wants to log
 * it) can tell; production calls it as `void track(...)` and moves on.
 */
export async function track(
  ctx: Ctx,
  event: TrackedEvent,
  detail?: Record<string, unknown>
): Promise<'recorded' | 'not recorded'> {
  const telegramId = ctx?.from?.id
  if (!telegramId) return 'not recorded'
  try {
    await ensureSchema()
    await getPool().query(
      `INSERT INTO user_events (telegram_id, bot_name, event, detail)
       VALUES ($1, $2, $3, $4)`,
      [
        String(telegramId),
        ctx?.botInfo?.username ?? null,
        event,
        detail ? JSON.stringify(detail) : null,
      ]
    )
    return 'recorded'
  } catch (error) {
    /*
     * Logged, not swallowed. This is the line whose absence let the whole
     * funnel go dark for two weeks: a missing table and a working one looked
     * the same from the outside.
     */
    logger.warn('[track] event not recorded', {
      event,
      telegramId: String(telegramId),
      error:
        error instanceof Error ? error.message.slice(0, 160) : String(error),
    })
    return 'not recorded'
  }
}

/** One club event as the sweep reads it. */
export interface ClubEventRow {
  id: string
  telegram_id: string
  bot_name: string | null
  event: TrackedEvent
  detail: Record<string, unknown> | null
  /** `pg` hands a timestamptz back as a Date; a test double may hand an ISO string. */
  created_at: string | Date
}

/** How long an unpaid invoice waits before it counts as abandoned. */
export const ABANDON_AFTER_MS = 60 * 60 * 1000

/** How far back the sweep looks: a week of invoices, more than enough for an hourly pass. */
export const ABANDON_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * WHICH INVOICES WERE LEFT: the rule, apart from the database, so it can be
 * read and tested on its own.
 *
 * An invoice is abandoned when it is older than `graceMs`, no `club_paid` for
 * the same person came at or after it, and it has not been marked already.
 * A payment that comes after the mark does not unmark it: both facts stay in
 * the table, and the reader sees "abandoned, then came back and paid".
 */
export function abandonedClubInvoices(
  rows: ClubEventRow[],
  now: number,
  graceMs: number = ABANDON_AFTER_MS
): ClubEventRow[] {
  const at = (r: ClubEventRow) => new Date(r.created_at).getTime()
  const marked = new Set(
    rows
      .filter(r => r.event === 'club_invoice_abandoned')
      .map(r => String(r.detail?.invoice_event ?? ''))
  )
  return rows.filter(inv => {
    if (inv.event !== 'club_invoice_created') return false
    if (now - at(inv) < graceMs) return false
    if (marked.has(String(inv.id))) return false
    const paid = rows.some(
      p =>
        p.event === 'club_paid' &&
        p.telegram_id === inv.telegram_id &&
        at(p) >= at(inv)
    )
    return !paid
  })
}

/**
 * The hourly pass: write `club_invoice_abandoned` for every invoice nobody
 * paid. Returns how many it marked. Throws when the database cannot be read,
 * so the scheduler's failure handler says so instead of a quiet zero -- "we
 * could not look" and "nobody walked away" must not print the same.
 */
export async function markAbandonedClubInvoices(
  now: number = Date.now()
): Promise<number> {
  await ensureSchema()
  const p = getPool()
  const { rows } = await p.query(
    `SELECT id::text AS id, telegram_id, bot_name, event, detail, created_at
       FROM user_events
      WHERE event = ANY($1)
        AND created_at >= $2
      ORDER BY created_at ASC`,
    [
      ['club_invoice_created', 'club_paid', 'club_invoice_abandoned'],
      new Date(now - ABANDON_LOOKBACK_MS).toISOString(),
    ]
  )
  const left = abandonedClubInvoices(rows as ClubEventRow[], now)
  let marked = 0
  for (const inv of left) {
    const r = await p.query(
      `INSERT INTO user_events (telegram_id, bot_name, event, detail)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        inv.telegram_id,
        inv.bot_name,
        'club_invoice_abandoned',
        JSON.stringify({ invoice_event: String(inv.id) }),
      ]
    )
    if (r.rows?.length) marked++
  }
  return marked
}
