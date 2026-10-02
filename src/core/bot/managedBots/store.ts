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
  media boolean NOT NULL DEFAULT false,
  paid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)`

/**
 * THE TRIAL A NEW BOT ANSWERS FOR, before anybody has paid for it.
 *
 * Every client message is a model call the platform pays for: on a business
 * turn the render bills the CLIENT's id, and the client of a managed bot has
 * no wallet with us. So a bot answers while `paid_until` is ahead, and a
 * person who creates one through /mybot gets these days to see it work.
 * Provisional (2026-10-01) until the owner names the number.
 */
export const TRIAL_DAYS = 3

/*
 * An upsert, because Telegram re-sends `managed_bot` when the token or the
 * owner changes: the newest owner wins, and a bot that was paused stays paused
 * -- a token rotation is not a reason to switch an agent back on. Nor is it a
 * reason for a new trial: `paid_until` and `media` are written on the first
 * insert only.
 */
export const UPSERT_MANAGED_BOT = `INSERT INTO managed_bots
  (bot_id, bot_username, bot_name, owner_id, owner_username, manager_bot, paid_until)
  VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7))
  ON CONFLICT (bot_id) DO UPDATE SET
    bot_username = EXCLUDED.bot_username,
    bot_name = EXCLUDED.bot_name,
    owner_id = EXCLUDED.owner_id,
    owner_username = EXCLUDED.owner_username,
    manager_bot = EXCLUDED.manager_bot,
    updated_at = now()`

export const LIVE_FOR_MANAGER = `SELECT bot_id, bot_username, bot_name, owner_id, owner_username, media
  FROM managed_bots
  WHERE manager_bot = $1 AND status = 'live'
  ORDER BY created_at`

export const BOTS_OF_OWNER = `SELECT bot_id, bot_username, status, paid_until
  FROM managed_bots
  WHERE owner_id = $1
  ORDER BY created_at`

/*
 * A payment moves the date forward from whichever is later, today or the
 * date already paid for: paying early never loses the days left.
 */
export const EXTEND_MANAGED_BOT = `UPDATE managed_bots SET
    paid_until = greatest(coalesce(paid_until, now()), now()) + make_interval(days => $2),
    media = coalesce($3, media),
    status = 'live',
    updated_at = now()
  WHERE lower(bot_username) = lower($1)
  RETURNING bot_id, bot_username, owner_id, media, paid_until`

export const ACCESS_OF_BOT = `SELECT media, paid_until > now() AS paid
  FROM managed_bots
  WHERE bot_id = $1`

export interface ManagedBotRow {
  botId: number
  botUsername: string
  botName: string
  ownerId: number
  ownerUsername?: string
  /**
   * Whether the bot's package makes media. False is the Manager Agent: a text
   * model for the CRM, and the render is told to hand it no media tool.
   */
  media?: boolean
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
    TRIAL_DAYS,
  ])
}

const toRow = (r: any): ManagedBotRow => ({
  botId: Number(r.bot_id),
  botUsername: String(r.bot_username),
  botName: String(r.bot_name ?? ''),
  ownerId: Number(r.owner_id),
  ...(r.owner_username ? { ownerUsername: String(r.owner_username) } : {}),
  media: r.media === true,
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
): Promise<{ botUsername: string; status: string; paidUntil?: Date }[]> {
  return (await run(BOTS_OF_OWNER, [ownerId])).map(r => ({
    botUsername: String(r.bot_username),
    status: String(r.status),
    ...(r.paid_until ? { paidUntil: new Date(r.paid_until) } : {}),
  }))
}

export interface ManagedBotAccess {
  paid: boolean
  media: boolean
}

const ACCESS_TTL_MS = 60_000
const accessCache = new Map<number, { at: number; access: ManagedBotAccess }>()

/**
 * May this bot answer now, and with what. Read on every client message, so
 * it is cached for a minute; a payment clears the cache for its bot.
 *
 * A database that does not answer lets the bot answer as text only: a client
 * left unanswered by our outage is worse than one text reply we were not
 * paid for, and text is the cheapest thing the agent does.
 */
export async function managedBotAccess(
  botId: number,
  now = Date.now()
): Promise<ManagedBotAccess> {
  const hit = accessCache.get(botId)
  if (hit && now - hit.at < ACCESS_TTL_MS) return hit.access
  let access: ManagedBotAccess
  try {
    const [r] = await run(ACCESS_OF_BOT, [botId])
    access = { paid: r?.paid === true, media: r?.media === true }
  } catch (error) {
    logger.warn('[managed-bots] access unknown, answering as text', {
      botId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { paid: true, media: false }
  }
  accessCache.set(botId, { at: now, access })
  return access
}

export interface ExtendedBot {
  botId: number
  botUsername: string
  ownerId: number
  media: boolean
  paidUntil: Date
}

/**
 * Pay a bot forward by `days` (the team's /agentbot, after the owner paid).
 * `media` switches the package when given and is left alone when not.
 * Null when no bot has that username.
 */
export async function extendManagedBot(
  botUsername: string,
  days: number,
  media?: boolean
): Promise<ExtendedBot | null> {
  const [r] = await run(EXTEND_MANAGED_BOT, [
    botUsername.replace(/^@/, ''),
    days,
    media ?? null,
  ])
  if (!r) return null
  const botId = Number(r.bot_id)
  accessCache.delete(botId)
  return {
    botId,
    botUsername: String(r.bot_username),
    ownerId: Number(r.owner_id),
    media: r.media === true,
    paidUntil: new Date(r.paid_until),
  }
}

/** For tests: forget every cached access. */
export function clearManagedBotAccessCache(): void {
  accessCache.clear()
}
