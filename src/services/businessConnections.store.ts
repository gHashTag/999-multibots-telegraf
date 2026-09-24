/**
 * THE OWNER'S BUSINESS CONNECTION, REMEMBERED ACROSS RESTARTS.
 *
 * WHAT WENT WRONG, 2026-09-24. A client (@Ryabinika_Perm) had waited five days
 * for an answer. The owner said "send it". The text was written in his voice --
 * "Лена, это Дима" -- and there was NO WAY TO SEND IT AS HIM: a message in his
 * own DM with her can only be sent with a `business_connection_id`, and this
 * process keeps those in a Map (businessBotService.ts `connections`). Telegram
 * sends `business_connection` only when the LINK CHANGES, never on restart, so
 * after any deploy -- several a day here -- the Map is empty and the id is gone
 * until the client writes again. The answer went from a bot instead, and the
 * channel had to be explained inside the message.
 *
 * That is the whole defect: the ability to start a conversation as the owner
 * exists for as long as the process lives and no longer, and nothing said so.
 * `lookupConnection` papers over the REPLY path -- an incoming message carries
 * the id, so it can be re-fetched -- but a reply is not an initiation, and only
 * the initiation was lost.
 *
 * SO THE ID LIVES IN POSTGRES, next to `user_tokens` and `assistant_opt_outs`:
 * same database, same env vars, table created on first use, because this
 * repository has no migration runner and a second convention would be a schema
 * nobody runs.
 *
 * WHAT THIS MODULE IS NOT. It does not send anything and it holds no policy
 * about when the platform may write as a person -- that decision belongs where
 * the sending happens. It answers one question: which connection, if any, lets
 * us speak as this owner today.
 *
 * ── WHY A DISABLED CONNECTION IS KEPT AND NOT DELETED ──────────────────────
 * `is_enabled: false` means the owner unlinked the bot. Deleting the row would
 * make "never connected" and "connected and then turned it off" the same state,
 * and they are not: the second is a person who changed their mind, and writing
 * as them after that would be exactly the thing they switched off. The row
 * stays, `enabled` goes false, and `connectionForOwner` refuses it.
 */

import { Pool } from 'pg'
import { logger } from '@/utils/logger'

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

/** The table. Created on first use, like client_events and user_tokens. */
export const CONNECTIONS_TABLE = `CREATE TABLE IF NOT EXISTS business_connections (
  connection_id text PRIMARY KEY,
  owner_id text NOT NULL,
  owner_chat_id text NOT NULL,
  bot_name text,
  can_reply boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  connected_at bigint,
  seen_at timestamptz NOT NULL DEFAULT now()
)`

/**
 * The newest connection through which we may speak AS this owner.
 *
 * `can_reply` is Telegram's own permission and is not ours to assume: a link
 * without it lets the bot read the correspondence and not write in it.
 */
export const CONNECTION_FOR_OWNER = `SELECT connection_id, owner_chat_id, bot_name
  FROM business_connections
  WHERE owner_id = $1 AND enabled AND can_reply
  ORDER BY seen_at DESC
  LIMIT 1`

export interface StoredConnection {
  connectionId: string
  ownerId: string
  ownerChatId: string
  botName: string | null
  canReply: boolean
  enabled: boolean
  connectedAt: number | null
}

let pool: Pool | null = null
let injected: Db | null = null
let schemaReady: Promise<void> | null = null
let unconfiguredSaid = false

function db(): Db | null {
  if (injected) return injected
  if (pool) return pool
  const url =
    process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''
  if (!url) {
    if (!unconfiguredSaid) {
      unconfiguredSaid = true
      logger.error(
        '[business-conn] TOKENS_DATABASE_URL is not set: business connections live in memory only, so the platform cannot write as an owner after a restart',
        {}
      )
    }
    return null
  }
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 5_000,
  })
  pool.on('error', error => {
    logger.error('[business-conn] pool error', { error: error.message })
  })
  return pool
}

/** For tests: a database double, or null to go back to the environment. */
export function setConnectionsDbForTests(d: Db | null): void {
  injected = d
  schemaReady = null
}

function ensureSchema(d: Db): Promise<void> {
  if (schemaReady) return schemaReady
  schemaReady = d
    .query(CONNECTIONS_TABLE)
    .then(() => undefined)
    .catch(error => {
      // A failed attempt must not latch: the next call retries.
      schemaReady = null
      throw error
    })
  return schemaReady
}

async function run(sql: string, params: unknown[]): Promise<any[] | null> {
  const d = db()
  if (!d) return null
  try {
    await ensureSchema(d)
    const r = await d.query(sql, params)
    return r.rows ?? []
  } catch (error) {
    /*
     * Said out loud and swallowed. This store exists so a FUTURE message can be
     * sent as the owner; a database blip here must never take down the business
     * reply path that is answering a client right now.
     */
    logger.error('[business-conn] query failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Write down a connection Telegram told us about. Called for both states:
 * `enabled: false` marks an owner who unlinked, which is not the same as one
 * we never knew.
 */
export async function rememberConnection(c: {
  connectionId: string
  ownerId: string | number
  ownerChatId: string | number
  botName?: string | null
  canReply: boolean
  enabled: boolean
  connectedAt?: number | null
}): Promise<void> {
  if (!c.connectionId || !String(c.ownerId ?? '').trim()) return
  await run(
    `INSERT INTO business_connections
       (connection_id, owner_id, owner_chat_id, bot_name, can_reply, enabled,
        connected_at, seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (connection_id) DO UPDATE
       SET owner_id = EXCLUDED.owner_id,
           owner_chat_id = EXCLUDED.owner_chat_id,
           bot_name = coalesce(EXCLUDED.bot_name, business_connections.bot_name),
           can_reply = EXCLUDED.can_reply,
           enabled = EXCLUDED.enabled,
           connected_at = coalesce(EXCLUDED.connected_at,
                                   business_connections.connected_at),
           seen_at = now()`,
    [
      c.connectionId,
      String(c.ownerId),
      String(c.ownerChatId ?? c.ownerId),
      c.botName ?? null,
      Boolean(c.canReply),
      Boolean(c.enabled),
      Number.isFinite(Number(c.connectedAt)) ? Number(c.connectedAt) : null,
    ]
  )
}

/**
 * The connection to speak as this owner, or null when there is none we may use.
 * Null is an answer, not an error: most owners have never linked an account.
 */
export async function connectionForOwner(
  ownerId: string | number
): Promise<{ connectionId: string; ownerChatId: string } | null> {
  const rows = await run(CONNECTION_FOR_OWNER, [String(ownerId)])
  const row = rows?.[0]
  if (!row?.connection_id) return null
  return {
    connectionId: String(row.connection_id),
    ownerChatId: String(row.owner_chat_id),
  }
}

/**
 * Every usable connection, for filling the in-process registry at startup.
 *
 * This is the half that was missing: the registry used to begin every process
 * empty, so the platform could not write as anybody until that person's client
 * happened to write first.
 */
export async function knownConnections(): Promise<StoredConnection[]> {
  const rows = await run(
    `SELECT connection_id, owner_id, owner_chat_id, bot_name, can_reply,
            enabled, connected_at
       FROM business_connections WHERE enabled
       ORDER BY seen_at DESC`,
    []
  )
  return (rows ?? []).map(r => ({
    connectionId: String(r.connection_id),
    ownerId: String(r.owner_id),
    ownerChatId: String(r.owner_chat_id),
    botName: r.bot_name ? String(r.bot_name) : null,
    canReply: Boolean(r.can_reply),
    enabled: Boolean(r.enabled),
    connectedAt: r.connected_at === null ? null : Number(r.connected_at),
  }))
}
