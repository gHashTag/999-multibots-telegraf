/**
 * WHAT CLIENTS ACTUALLY DO INSIDE THE BOTS.
 *
 * Owner, 2026-09-20: he wants to see every event that happens in the bots --
 * who went where and where they got stuck. Nothing recorded that. The one
 * module that looked like it did (navigation/middleware/analyticsMiddleware)
 * was never imported by anything, counted an "enter" on every update while
 * already inside a scene, and kept its totals in process memory — so a
 * redeploy erased the day. It is deleted in the same change that adds this.
 *
 * Three decisions worth keeping:
 *
 *  - ONE ROW PER TRANSITION, not per update. A scene sends and receives many
 *    updates; only the move from one scene to another is an event a human can
 *    read. Update-level rows would be a wall nobody reads (same reason the
 *    hive journal rolls `bot-errors` up to one line per ten minutes).
 *
 *  - RENDER POSTGRES, next to `user_tokens`. The wallet already proved this
 *    database outlives deploys; process memory does not. The table is created
 *    on first use, so there is no migration to forget.
 *
 *  - A WRITE NEVER BREAKS AN UPDATE. Recording is best-effort and swallows its
 *    own failures: a telemetry outage must not cost a client their generation.
 *    Reading is the opposite -- it throws, so the report can say "not counted"
 *    instead of printing a zero that means "the database was down".
 */

import { Pool } from 'pg'
import { logger } from '@/utils/logger'

/**
 * Not knowing what happened is not the same as nothing having happened.
 * Readers must let this propagate rather than report an empty day.
 */
export class TelemetryUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelemetryUnavailableError'
  }
}

export interface ClientEventInput {
  telegramId: string
  botName: string
  username: string | null
  fromScene: string | null
  toScene: string | null
}

export interface ClientEventRow {
  telegramId: string
  botName: string
  username: string | null
  fromScene: string | null
  toScene: string | null
  at: number
}

let pool: Pool | null = null
let schemaReady: Promise<void> | null = null

/**
 * The telemetry database.
 *
 * Same env vars as the wallet on purpose — it is the same render Postgres —
 * and deliberately NOT `DATABASE_URL`, which points elsewhere in more than one
 * shell.
 */
function getPool(): Pool {
  if (pool) return pool
  const url =
    process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''
  if (!url) {
    throw new TelemetryUnavailableError(
      'TOKENS_DATABASE_URL is not set: client events cannot be stored or read'
    )
  }
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 4,
    connectionTimeoutMillis: 8000,
    idle_in_transaction_session_timeout: 10000,
  })
  pool.on('error', error => {
    logger.error('client telemetry pool error', { error: error.message })
  })
  return pool
}

/** For tests: drop the cached pool and schema latch so a new env is picked up. */
export function resetClientEventsPool(): void {
  pool = null
  schemaReady = null
}

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS client_events (
     id BIGSERIAL PRIMARY KEY,
     telegram_id TEXT NOT NULL,
     bot_name TEXT NOT NULL DEFAULT '',
     username TEXT,
     from_scene TEXT,
     to_scene TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS client_events_created_at_idx
     ON client_events (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS client_events_person_idx
     ON client_events (telegram_id, created_at DESC)`,
]

/** Created once per process; concurrent callers await the same promise. */
function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    const p = getPool()
    for (const sql of SCHEMA_SQL) await p.query(sql)
  })().catch(error => {
    // A failed attempt must not latch forever: the next call retries.
    schemaReady = null
    throw error
  })
  return schemaReady
}

/**
 * Record one move between scenes. Best-effort by contract: callers do not
 * await it in the update path and it never rejects.
 */
export async function recordClientEvent(e: ClientEventInput): Promise<void> {
  const id = String(e.telegramId ?? '').trim()
  if (!id) return
  if (!e.fromScene && !e.toScene) return
  try {
    await ensureSchema()
    await getPool().query(
      `INSERT INTO client_events
         (telegram_id, bot_name, username, from_scene, to_scene)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        e.botName || '',
        e.username || null,
        e.fromScene || null,
        e.toScene || null,
      ]
    )
  } catch (error) {
    logger.warn('client telemetry: event not recorded', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: id,
    })
  }
}

/**
 * Every event since `sinceMs`, oldest first.
 *
 * Throws when the database cannot answer — see the class comment above.
 */
export async function fetchClientEvents(
  sinceMs: number
): Promise<ClientEventRow[]> {
  try {
    await ensureSchema()
    const { rows } = await getPool().query(
      `SELECT telegram_id, bot_name, username, from_scene, to_scene, created_at
         FROM client_events
        WHERE created_at >= to_timestamp($1 / 1000.0)
        ORDER BY created_at ASC
        LIMIT 20000`,
      [sinceMs]
    )
    return rows.map(r => ({
      telegramId: String(r.telegram_id),
      botName: String(r.bot_name ?? ''),
      username: r.username ? String(r.username) : null,
      fromScene: r.from_scene ? String(r.from_scene) : null,
      toScene: r.to_scene ? String(r.to_scene) : null,
      at: new Date(r.created_at).getTime(),
    }))
  } catch (error) {
    if (error instanceof TelemetryUnavailableError) throw error
    throw new TelemetryUnavailableError(
      error instanceof Error ? error.message : String(error)
    )
  }
}

/**
 * Drop events older than `days`. The report is a daily read; keeping a year of
 * per-update rows would only grow the table that the wallet shares.
 */
export async function pruneClientEvents(days = 45): Promise<number> {
  try {
    await ensureSchema()
    const { rowCount } = await getPool().query(
      `DELETE FROM client_events WHERE created_at < now() - ($1 || ' days')::interval`,
      [String(days)]
    )
    return rowCount || 0
  } catch (error) {
    logger.warn('client telemetry: prune failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}
