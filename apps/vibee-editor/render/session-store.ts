/**
 * Storage for app sessions: tables, and the store `rotateRefreshToken` needs.
 *
 * WHY SEPARATE FROM session.ts. That module holds no database handle, which is
 * what lets its twelve tests run without one. Everything that touches Postgres
 * lives here, so the crypto stays testable and the SQL stays in one place.
 *
 * WHY CREATE TABLE IF NOT EXISTS RATHER THAN A MIGRATION FILE. This project
 * has no migration runner; every other table in it (`user_tokens`,
 * `agent_renders`, `user_skills`) is created the same way, on first use.
 * Inventing a second convention for four more tables would mean two ways to
 * get a schema, and the one nobody runs would drift.
 */

import crypto from 'node:crypto'
import { digest, revokeNow, setRevokedSessions } from './session'

type PoolClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
  release: () => void
}

type Pool = {
  query: PoolClient['query']
}

type PairingPool = Pool & {
  connect: () => Promise<PoolClient>
}

let готово = false

/**
 * Create the four tables. Idempotent, and cheap after the first call.
 *
 * Called from the auth routes rather than at boot: a server that cannot reach
 * Postgres should still serve `/health` and the public feed, and failing at
 * startup would take those down too.
 */
export async function ensureAuthTables(pool: Pool): Promise<void> {
  if (готово) return

  // Pending authorization requests. Short-lived by design: a row older than
  // five minutes is a request nobody finished, and keeping it alive only
  // widens the window in which a stolen `state` is worth something.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oidc_auth_requests (
      state text PRIMARY KEY,
      code_verifier text NOT NULL,
      device_pubkey text NOT NULL,
      device_name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz
    )`)

  // A session is one device. Revocation works on this row, and the in-memory
  // set in session.ts is filled from it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id text PRIMARY KEY,
      telegram_id text NOT NULL,
      device_pubkey text NOT NULL,
      device_name text,
      family_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz,
      revoked_at timestamptz
    )`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS app_sessions_owner
       ON app_sessions (telegram_id, created_at DESC)`
  )
  // The revocation poller reads exactly this: live sessions marked revoked.
  await pool.query(
    `CREATE INDEX IF NOT EXISTS app_sessions_revoked
       ON app_sessions (revoked_at) WHERE revoked_at IS NOT NULL`
  )

  /**
   * Refresh tokens. `token_hash` is the primary key on purpose: the raw token
   * has no column at all, so there is no version of this table that could leak
   * one. `family_id` ties a chain of rotations together — see the reuse
   * handling in session.ts.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_refresh_tokens (
      token_hash text PRIMARY KEY,
      family_id text NOT NULL,
      session_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      replaced_by text,
      revoked_at timestamptz
    )`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS app_refresh_family
       ON app_refresh_tokens (family_id)`
  )

  /**
   * One-time tickets for streaming endpoints.
   *
   * EventSource cannot send headers, and putting a Bearer token in the query
   * string would leave it in proxy logs and in Referer — the exact flaw that
   * already makes `?initData=` unacceptable. A ticket is worth sixty seconds
   * and one connection.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_stream_tickets (
      ticket_hash text PRIMARY KEY,
      session_id text NOT NULL,
      telegram_id text NOT NULL,
      scope text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz
    )`)

  // A signed Login Widget assertion may mint exactly one long-lived session.
  // Only a digest is stored; replay is rejected by the primary key in the
  // same transaction that writes the profile and refresh-token family.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_widget_assertions (
      assertion_hash text PRIMARY KEY,
      telegram_id text NOT NULL,
      consumed_at timestamptz NOT NULL DEFAULT now()
    )`)

  /**
   * Pairing codes: how a client with no Telegram signature gets a session.
   *
   * The native app is not inside Telegram, so it can never hold initData. It
   * has been holding an agent key typed in by a person instead — the one
   * manual step left in the whole product.
   *
   * The code crosses the gap through the person's eyes, not through a URL.
   * A deep link would have been fewer taps, but a refresh token in a query
   * string lands in logs, in pasteboard history, and in whatever app renders
   * the link. Six digits read off one screen and typed into another leave no
   * copy anywhere.
   *
   * `code_hash` is the primary key and the raw code has NO column: a database
   * dump must not be a list of working credentials. Same rule as refresh
   * tokens, for the same reason.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_pairing_codes (
      code_hash text PRIMARY KEY,
      telegram_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      attempts int NOT NULL DEFAULT 0
    )`)
  // Repair any historical race result before enforcing the invariant. The
  // newest unconsumed code wins; older siblings become inert, never deleted.
  await pool.query(`
    WITH ranked AS (
      SELECT code_hash,
             row_number() OVER (
               PARTITION BY telegram_id
               ORDER BY created_at DESC, code_hash DESC
             ) AS position
        FROM app_pairing_codes
       WHERE consumed_at IS NULL
    )
    UPDATE app_pairing_codes AS codes
       SET consumed_at = now()
      FROM ranked
     WHERE codes.code_hash = ranked.code_hash
       AND ranked.position > 1`)
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS app_pairing_one_live_owner
       ON app_pairing_codes (telegram_id) WHERE consumed_at IS NULL`
  )

  готово = true
}

/** How long a pairing code lives, and how wrong you may be about it. */
export const PAIRING = {
  /** Two minutes: long enough to walk to the other device, short enough that
   *  a shoulder-surfed code is stale before it is useful. */
  TTL_SECONDS: 120,
  /** Six digits is a million codes. That is only safe because the window is
   *  two minutes AND because guesses are counted — see `claimPairingCode`. */
  DIGITS: 6,
  MAX_ATTEMPTS: 5,
} as const

/**
 * Mint a pairing code for an ALREADY VERIFIED telegram_id.
 *
 * Callers must have checked the Telegram signature. This function cannot do
 * it — it takes an id, and an id is not proof of anything.
 */
export async function issuePairingCode(
  pool: PairingPool,
  telegramId: string,
  mint: () => string
): Promise<{ code: string; expiresAt: Date }> {
  /**
   * One live code per person.
   *
   * Without this, pressing the button twice leaves two valid codes and the
   * person cannot tell which screen is current. Worse, the abandoned one stays
   * guessable for its full two minutes with its own attempt counter — every
   * press would widen the window instead of restarting it.
   */
  const code = mint()
  const expiresAt = new Date(Date.now() + PAIRING.TTL_SECONDS * 1000)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialize starts for one owner across tabs and server instances. The
    // partial unique index is a second, database-level invariant.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [telegramId]
    )
    await client.query(
      `UPDATE app_pairing_codes SET consumed_at = now()
        WHERE telegram_id = $1 AND consumed_at IS NULL`,
      [telegramId]
    )
    await client.query(
      `INSERT INTO app_pairing_codes (code_hash, telegram_id, expires_at)
       VALUES ($1, $2, $3)`,
      [digest(code), telegramId, expiresAt.toISOString()]
    )
    await client.query('COMMIT')
    return { code, expiresAt }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export type PairingOutcome =
  | { ok: true; telegramId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'exhausted' }

/**
 * Redeem a code. Single use, enforced by the WHERE clause and not by a
 * read-then-write — two devices racing the same code must not both win.
 */
export async function claimPairingCode(
  pool: Pool,
  code: string
): Promise<PairingOutcome> {
  const hash = digest(code)

  const hit = await pool.query(
    `SELECT telegram_id, expires_at, consumed_at, attempts
       FROM app_pairing_codes WHERE code_hash = $1`,
    [hash]
  )

  if (!hit.rows.length) {
    // A miss has no owner. Mutating every live code here lets one anonymous
    // caller invalidate every user's login. The HTTP boundary rate-limits the
    // request source; storage leaves unrelated rows untouched.
    return { ok: false, reason: 'unknown' }
  }

  const row = hit.rows[0]
  if (row.attempts >= PAIRING.MAX_ATTEMPTS)
    return { ok: false, reason: 'exhausted' }

  const consumed = await pool.query(
    `UPDATE app_pairing_codes SET consumed_at = now()
      WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING telegram_id`,
    [hash]
  )
  if (!consumed.rows.length) return { ok: false, reason: 'expired' }

  return { ok: true, telegramId: String(consumed.rows[0].telegram_id) }
}

/** Storage adapter for `rotateRefreshToken`. */
export function refreshStore(pool: Pool) {
  return {
    async find(hash: string) {
      const r = await pool.query(
        `SELECT family_id, used_at, revoked_at, expires_at
           FROM app_refresh_tokens WHERE token_hash = $1`,
        [hash]
      )
      if (!r.rows.length) return null
      const row = r.rows[0]
      return {
        familyId: String(row.family_id),
        usedAt: row.used_at ? new Date(row.used_at) : null,
        revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
        expiresAt: new Date(row.expires_at),
      }
    },

    async consumeAndInsert(
      hash: string,
      replacedByHash: string,
      expiresAt: Date
    ) {
      /**
       * `WHERE used_at IS NULL` is what makes rotation single-use under
       * concurrency. Two requests arriving with the same token both read
       * `used_at = null`; without this guard both would proceed and neither
       * would look like reuse. With it, exactly one wins and the loser is
       * seen for what it is.
       */
      const claimed = await pool.query(
        `WITH consumed AS (
           UPDATE app_refresh_tokens
              SET used_at = now(), replaced_by = $2
            WHERE token_hash = $1
              AND used_at IS NULL
              AND revoked_at IS NULL
              AND expires_at > now()
            RETURNING family_id, session_id
         )
         INSERT INTO app_refresh_tokens
           (token_hash, family_id, session_id, expires_at)
         SELECT $2, family_id, session_id, $3 FROM consumed
         RETURNING token_hash`,
        [hash, replacedByHash, expiresAt.toISOString()]
      )
      return claimed.rows.length === 1
    },

    async revokeFamily(familyId: string) {
      await pool.query(
        `UPDATE app_refresh_tokens SET revoked_at = now()
          WHERE family_id = $1 AND revoked_at IS NULL`,
        [familyId]
      )
      const r = await pool.query(
        `UPDATE app_sessions SET revoked_at = now()
          WHERE family_id = $1 AND revoked_at IS NULL
          RETURNING id`,
        [familyId]
      )
      return r.rows.map((x: any) => String(x.id))
    },
  }
}

/**
 * Refresh the in-memory revoked set from the database.
 *
 * Deliberately does NOT clear rows: a session revoked long ago has an expired
 * access token anyway, and keeping every revocation forever would grow the set
 * without bound. Ninety minutes is nine access-token lifetimes — long enough
 * that nothing slips through, short enough that the set stays small.
 */
export async function pollRevocations(pool: Pool): Promise<number> {
  const r = await pool.query(
    `SELECT id FROM app_sessions
      WHERE revoked_at IS NOT NULL AND revoked_at > now() - interval '90 minutes'`
  )
  const ids = r.rows.map((x: any) => String(x.id))
  setRevokedSessions(ids)
  return ids.length
}

/** A ticket for one stream connection. Returns the raw value once. */
export async function issueStreamTicket(
  pool: Pool,
  params: { sessionId: string; telegramId: string; scope: string }
): Promise<string> {
  const ticket = crypto.randomBytes(32).toString('base64url')
  await pool.query(
    `INSERT INTO app_stream_tickets (ticket_hash, session_id, telegram_id, scope, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '60 seconds')`,
    [digest(ticket), params.sessionId, params.telegramId, params.scope]
  )
  return ticket
}

/**
 * Spend a ticket. Returns the owner, or null.
 *
 * Consumption is the UPDATE itself, guarded by `consumed_at IS NULL`, so a
 * ticket replayed from a proxy log finds nothing to spend. Checking first and
 * updating after would leave exactly the window this is meant to close.
 */
export async function consumeStreamTicket(
  pool: Pool,
  ticket: string,
  scope: string
): Promise<{ sessionId: string; telegramId: string } | null> {
  const r = await pool.query(
    `UPDATE app_stream_tickets SET consumed_at = now()
      WHERE ticket_hash = $1 AND scope = $2
        AND consumed_at IS NULL AND expires_at > now()
      RETURNING session_id, telegram_id`,
    [digest(ticket), scope]
  )
  if (!r.rows.length) return null
  return {
    sessionId: String(r.rows[0].session_id),
    telegramId: String(r.rows[0].telegram_id),
  }
}
