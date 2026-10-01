/**
 * WHICH BOTS WE MANAGE, AND FOR WHOM -- remembered across restarts.
 *
 * Telegram sends `managed_bot` once, when a bot is created (or its token or
 * owner changes). After a deploy nothing re-announces it, so without a row the
 * bot would fall silent at the first restart. The row is the list of bots to
 * bring back up; it holds NO TOKEN: `getManagedBotToken` hands the current one
 * to the manager on every launch, which also means a token the owner rotated
 * is picked up without anybody telling us.
 *
 * Same database and same create-on-first-use convention as
 * businessConnections.store.ts, for the reason written there: this repository
 * has no migration runner.
 */

import { Pool } from 'pg'
import { logger } from '@/utils/logger'
import type { ManagedBotEvent } from './protocol'

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export const MANAGED_BOTS_TABLE = `CREATE TABLE IF NOT EXISTS managed_bots (
  bot_id bigint PRIMARY KEY,
  bot_username text NOT NULL,
  bot_name text NOT NULL DEFAULT '',
  owner_id bigint NOT NULL,
  owner_username text,
  manager_bot text NOT NULL,
  status text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)`

/*
 * An upsert, because Telegram re-sends `managed_bot` when the token or the
 * owner changes: the newest owner wins, and a bot that was paused stays paused
 * -- a token rotation is not a reason to switch an agent back on.
 */
export const UPSERT_MANAGED_BOT = `INSERT INTO managed_bots
  (bot_id, bot_username, bot_name, owner_id, owner_username, manager_bot)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (bot_id) DO UPDATE SET
    bot_username = EXCLUDED.bot_username,
    bot_name = EXCLUDED.bot_name,
    owner_id = EXCLUDED.owner_id,
    owner_username = EXCLUDED.owner_username,
    manager_bot = EXCLUDED.manager_bot,
    updated_at = now()`

export const LIVE_FOR_MANAGER = `SELECT bot_id, bot_username, bot_name, owner_id, owner_username
  FROM managed_bots
  WHERE manager_bot = $1 AND status = 'live'
  ORDER BY created_at`

export const BOTS_OF_OWNER = `SELECT bot_id, bot_username, status
  FROM managed_bots
  WHERE owner_id = $1
  ORDER BY created_at`

export interface ManagedBotRow {
  botId: number
  botUsername: string
  botName: string
  ownerId: number
  ownerUsername?: string
}

let pool: Pool | null = null
let injected: Db | null = null
let schemaReady: Promise<void> | null = null

function db(): Db | null {
  if (injected) return injected
  if (pool) return pool
  const url =
    process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''
  if (!url) return null
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 5_000,
  })
  pool.on('error', error => {
    logger.error('[managed-bots] pool error', { error: error.message })
  })
  return pool
}

/** For tests: a database double, or null to go back to the environment. */
export function setManagedBotsDbForTests(d: Db | null): void {
  injected = d
  schemaReady = null
}

function ensureSchema(d: Db): Promise<void> {
  if (schemaReady) return schemaReady
  schemaReady = d
    .query(MANAGED_BOTS_TABLE)
    .then(() => undefined)
    .catch(error => {
      // A failed attempt must not latch: the next call retries.
      schemaReady = null
      throw error
    })
  return schemaReady
}

async function run(sql: string, params: unknown[]): Promise<any[]> {
  const d = db()
  if (!d) {
    throw new Error(
      'managed_bots: TOKENS_DATABASE_URL is not set, a created bot cannot be remembered'
    )
  }
  await ensureSchema(d)
  const r = await d.query(sql, params)
  return r.rows ?? []
}

/**
 * Remember a bot. THROWS when it cannot: the caller tells the owner the bot
 * was made but is not yet answering, rather than promising an agent that will
 * be gone after the next deploy.
 */
export async function rememberManagedBot(
  event: ManagedBotEvent,
  managerBot: string
): Promise<void> {
  await run(UPSERT_MANAGED_BOT, [
    event.botId,
    event.botUsername,
    event.botName,
    event.ownerId,
    event.ownerUsername ?? null,
    managerBot,
  ])
}

const toRow = (r: any): ManagedBotRow => ({
  botId: Number(r.bot_id),
  botUsername: String(r.bot_username),
  botName: String(r.bot_name ?? ''),
  ownerId: Number(r.owner_id),
  ...(r.owner_username ? { ownerUsername: String(r.owner_username) } : {}),
})

/** The bots to bring up at boot for this manager. */
export async function liveManagedBots(
  managerBot: string
): Promise<ManagedBotRow[]> {
  return (await run(LIVE_FOR_MANAGER, [managerBot])).map(toRow)
}

/** What one person owns, for /mybot. */
export async function managedBotsOf(
  ownerId: number
): Promise<{ botUsername: string; status: string }[]> {
  return (await run(BOTS_OF_OWNER, [ownerId])).map(r => ({
    botUsername: String(r.bot_username),
    status: String(r.status),
  }))
}
