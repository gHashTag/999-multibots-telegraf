/**
 * WHEN A CLIENT ASKS THE ASSISTANT TO STOP, IT STOPS -- AND STAYS STOPPED.
 *
 * The owner's own takeover (businessBotService OWNER_TAKEOVER_MS) is thirty
 * minutes in process memory, and every deploy forgets it. That is right for a
 * pause the owner chose. It is wrong for a CLIENT's "switch the bot off":
 * forgetting that on the next deploy -- several times a day here -- answers
 * the person who asked for silence with the machine they asked to silence.
 *
 * So the client's request lives in the render's Postgres, next to
 * `user_tokens` (same database, same env vars as src/core/wallet), keyed by
 * the owner AND the client: a person who switched off one seller's assistant
 * has not switched off another's.
 *
 * ONE QUESTION, ONE ANSWER. `assistantAllowed` is the only place the bot asks
 * "may the assistant speak to this person for this owner?". The business
 * auto-reply and the proactive sweep both call it; the render asks the same
 * row with the same SQL (render/src/agent/assistant-opt-out.ts -- the two
 * copies of the table and the list query are pinned identical by
 * src/__tests__/services/aClientCanSwitchTheAssistantOff.sweep.test.ts).
 *
 * WHEN THE DATABASE CANNOT ANSWER. Every decision says what it does then, out
 * loud, instead of pretending: a stop this process has seen is honoured from
 * memory; beyond that the caller picks. The business reply passes 'allow'
 * (a database blip must not silence every client of every owner), and says
 * so in the log at error level.
 *
 * TABLE CREATED ON FIRST USE, as client_events and user_tokens are: this
 * repository has no migration runner, and a second convention would be a
 * schema nobody runs.
 */

import { Pool } from 'pg'
import { logger } from '@/utils/logger'

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

/*
 * The table. BYTE-IDENTICAL to the render's copy -- the parity test compares
 * the strings. `active` is the switch; the row is kept after a resume so the
 * next stop is a new episode that is announced again, not a silent re-use.
 */
export const OPT_OUT_TABLE = `CREATE TABLE IF NOT EXISTS assistant_opt_outs (
  owner_id text NOT NULL,
  client_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  since timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'client',
  owner_told_at timestamptz,
  client_told_at timestamptz,
  resumed_at timestamptz,
  PRIMARY KEY (owner_id, client_id)
)`

/** Who this owner's assistant must not speak to. Identical in the render. */
export const OPT_OUT_LIST = `SELECT client_id, since FROM assistant_opt_outs
  WHERE owner_id = $1 AND active`

/**
 * The client's request. A row that is already active is left alone (RETURNING
 * nothing) -- that is what makes the second "stop" in a row quiet. A row that
 * was resumed becomes a new episode with both notices unclaimed.
 */
export const OPT_OUT_STOP = `INSERT INTO assistant_opt_outs
  (owner_id, client_id, active, since, source, owner_told_at, client_told_at, resumed_at)
  VALUES ($1, $2, true, now(), 'client', NULL, NULL, NULL)
  ON CONFLICT (owner_id, client_id) DO UPDATE SET
    active = true, since = now(), source = 'client',
    owner_told_at = NULL, client_told_at = NULL, resumed_at = NULL
  WHERE assistant_opt_outs.active = false
  RETURNING client_id`

/** First caller wins the owner's notice for this episode. */
export const OPT_OUT_CLAIM_OWNER_NOTICE = `UPDATE assistant_opt_outs
  SET owner_told_at = now()
  WHERE owner_id = $1 AND client_id = $2 AND active AND owner_told_at IS NULL
  RETURNING client_id`

/** A notice that did not leave is given back, so the next message retries. */
export const OPT_OUT_RELEASE_OWNER_NOTICE = `UPDATE assistant_opt_outs
  SET owner_told_at = NULL
  WHERE owner_id = $1 AND client_id = $2 AND active`

/** First caller wins the client's acknowledgement for this episode. */
export const OPT_OUT_CLAIM_CLIENT_ACK = `UPDATE assistant_opt_outs
  SET client_told_at = now()
  WHERE owner_id = $1 AND client_id = $2 AND active AND client_told_at IS NULL
  RETURNING client_id`

/** The owner turns the assistant back on. Only the owner's key reaches it. */
export const OPT_OUT_RESUME = `UPDATE assistant_opt_outs
  SET active = false, resumed_at = now()
  WHERE owner_id = $1 AND client_id = $2 AND active
  RETURNING client_id`

/** How long a decision may wait for the database before it is "unknown". */
export const OPT_OUT_READ_MS = 2_000

let pool: Pool | null = null
let injected: Db | null = null
let schemaReady: Promise<void> | null = null
let unconfiguredSaid = false

/*
 * WHAT THIS PROCESS HAS SEEN, for the moments the database cannot answer.
 *
 * owner-scope: every key is `${owner}:${client}`, never a bare client.
 */
const knownOff = new Set<string>()
// owner-scope: keyed `${owner}:${client}`, the local fallback of the claims.
const claimedHere = new Set<string>()
/*
 * Stops this process could not write. Kept apart from `knownOff` because a
 * successful read of the list must not wash them out: the database not having
 * a row it never received is not the client changing their mind.
 *
 * owner-scope: keyed `${owner}:${client}`.
 */
const unsaved = new Set<string>()

const keyOf = (owner: string | number, client: string | number) =>
  `${String(owner)}:${String(client)}`

function db(): Db | null {
  if (injected) return injected
  if (pool) return pool
  const url =
    process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''
  if (!url) {
    if (!unconfiguredSaid) {
      unconfiguredSaid = true
      logger.error(
        '[opt-out] TOKENS_DATABASE_URL is not set: a client asking the assistant to stop is kept in memory only',
        {}
      )
    }
    return null
  }
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: OPT_OUT_READ_MS,
    idle_in_transaction_session_timeout: 10_000,
  })
  pool.on('error', error => {
    logger.error('[opt-out] pool error', { error: error.message })
  })
  return pool
}

/** For tests: a database double, or null to go back to the environment. */
export function setOptOutDbForTests(d: Db | null): void {
  injected = d
  schemaReady = null
}

/** For tests: forget everything this "process" has seen -- a restart. */
export function forgetOptOutMemoryForTests(): void {
  knownOff.clear()
  claimedHere.clear()
  unsaved.clear()
  schemaReady = null
}

function ensureSchema(d: Db): Promise<void> {
  if (schemaReady) return schemaReady
  schemaReady = d
    .query(OPT_OUT_TABLE)
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
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const work = (async () => {
      await ensureSchema(d)
      return (await d.query(sql, params)).rows ?? []
    })()
    // Lost the race: its late failure is already reported as the timeout.
    work.catch(() => undefined)
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer in ${OPT_OUT_READ_MS} ms`)),
        OPT_OUT_READ_MS
      )
    })
    return await Promise.race([work, late])
  } catch (error) {
    logger.error('[opt-out] database did not answer', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** The owner's opted-out clients, or null when the database cannot say. */
export async function optedOutClients(
  owner: string | number
): Promise<Map<string, string | null> | null> {
  const rows = await run(OPT_OUT_LIST, [String(owner)])
  if (!rows) return null
  const out = new Map<string, string | null>()
  for (const r of rows) {
    const since = r.since
      ? new Date(r.since as string | Date).toISOString()
      : null
    out.set(String(r.client_id), since)
  }
  // The database answered: this process's memory follows it, both ways --
  // except for stops it never received, which are written now.
  const prefix = `${String(owner)}:`
  for (const k of [...knownOff])
    if (k.startsWith(prefix) && !unsaved.has(k)) knownOff.delete(k)
  for (const client of out.keys()) knownOff.add(keyOf(owner, client))
  for (const k of [...unsaved]) {
    if (!k.startsWith(prefix)) continue
    const client = k.slice(prefix.length)
    if (!out.has(client) && (await run(OPT_OUT_STOP, [String(owner), client])))
      unsaved.delete(k)
    if (!out.has(client)) out.set(client, null)
  }
  return out
}

export type Decision =
  | { allowed: true; known: boolean }
  | { allowed: false; known: boolean; since?: string | null }

/**
 * MAY THE ASSISTANT SPEAK TO THIS CLIENT FOR THIS OWNER? The one question.
 *
 * `whenUnknown` is the caller's answer for a database that cannot be read and
 * a client this process has never seen stop. It is required, so no caller
 * gets a default it did not choose.
 */
export async function assistantAllowed(
  owner: string | number,
  client: string | number,
  opts: { whenUnknown: 'allow' | 'refuse' }
): Promise<Decision> {
  const off = await optedOutClients(owner)
  if (off) {
    return off.has(String(client))
      ? { allowed: false, known: true, since: off.get(String(client)) }
      : { allowed: true, known: true }
  }
  if (knownOff.has(keyOf(owner, client)))
    return { allowed: false, known: false }
  // `run` has already said at error level that the database did not answer.
  return opts.whenUnknown === 'allow'
    ? { allowed: true, known: false }
    : { allowed: false, known: false }
}

/**
 * Synchronous: has THIS process seen the client stop? For the check before
 * every chunk of a reply already being written, which cannot wait for a
 * database between two sends.
 */
export function stoppedHere(
  owner: string | number,
  client: string | number
): boolean {
  return knownOff.has(keyOf(owner, client))
}

/**
 * Record the client's request. Marks this process at once (before any await),
 * so a reply being written right now stops before its next chunk.
 *
 * `fresh`: a new episode (first stop, or first since a resume).
 * `stored`: the database has it; false means only this process knows.
 */
export async function recordClientStop(
  owner: string | number,
  client: string | number
): Promise<{ fresh: boolean; stored: boolean }> {
  const key = keyOf(owner, client)
  const seenBefore = knownOff.has(key)
  knownOff.add(key)
  const rows = await run(OPT_OUT_STOP, [String(owner), String(client)])
  if (rows) {
    unsaved.delete(key)
    return { fresh: rows.length > 0, stored: true }
  }
  unsaved.add(key)
  return { fresh: !seenBefore, stored: false }
}

async function claim(
  sql: string,
  owner: string | number,
  client: string | number,
  what: 'owner' | 'client'
): Promise<boolean> {
  // A stop the database never received has no row to claim on: decided here.
  const rows = unsaved.has(keyOf(owner, client))
    ? null
    : await run(sql, [String(owner), String(client)])
  if (rows) return rows.length > 0
  // No database: once per process, which is the most this process can promise.
  const k = `${what}:${keyOf(owner, client)}`
  if (claimedHere.has(k)) return false
  claimedHere.add(k)
  return true
}

/** True for exactly one caller per episode: that caller tells the owner. */
export function claimOwnerNotice(
  owner: string | number,
  client: string | number
): Promise<boolean> {
  return claim(OPT_OUT_CLAIM_OWNER_NOTICE, owner, client, 'owner')
}

/** The notice did not leave: give the claim back so the next message retries. */
export async function releaseOwnerNotice(
  owner: string | number,
  client: string | number
): Promise<void> {
  claimedHere.delete(`owner:${keyOf(owner, client)}`)
  await run(OPT_OUT_RELEASE_OWNER_NOTICE, [String(owner), String(client)])
}

/** True for exactly one caller per episode: that caller answers the client. */
export function claimClientAck(
  owner: string | number,
  client: string | number
): Promise<boolean> {
  return claim(OPT_OUT_CLAIM_CLIENT_ACK, owner, client, 'client')
}

/**
 * The owner turns the assistant back on for this client. Returns true when
 * something was actually off. THROWS when the database cannot be written: the
 * owner must hear "not done" rather than believe it was.
 */
export async function resumeAssistant(
  owner: string | number,
  client: string | number
): Promise<boolean> {
  const key = keyOf(owner, client)
  const wasHere = knownOff.has(key)
  const forget = () => {
    knownOff.delete(key)
    unsaved.delete(key)
    claimedHere.delete(`owner:${key}`)
    claimedHere.delete(`client:${key}`)
  }
  if (!db()) {
    // Nothing was ever stored: this process's memory is the whole state.
    forget()
    return wasHere
  }
  const rows = await run(OPT_OUT_RESUME, [String(owner), String(client)])
  if (!rows) throw new Error('the opt-out store did not answer')
  forget()
  return rows.length > 0 || wasHere
}
