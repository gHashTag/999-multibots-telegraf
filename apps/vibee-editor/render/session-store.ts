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
import { digest, revokeNow } from './session'

type Pool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

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
       ON app_sessions (telegram_id, created_at DESC)`)
  // The revocation poller reads exactly this: live sessions marked revoked.
  await pool.query(
    `CREATE INDEX IF NOT EXISTS app_sessions_revoked
       ON app_sessions (revoked_at) WHERE revoked_at IS NOT NULL`)

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
       ON app_refresh_tokens (family_id)`)

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

  готово = true
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

    async markUsed(hash: string, replacedByHash: string) {
      /**
       * `WHERE used_at IS NULL` is what makes rotation single-use under
       * concurrency. Two requests arriving with the same token both read
       * `used_at = null`; without this guard both would proceed and neither
       * would look like reuse. With it, exactly one wins and the loser is
       * seen for what it is.
       */
      await pool.query(
        `UPDATE app_refresh_tokens
            SET used_at = now(), replaced_by = $2
          WHERE token_hash = $1 AND used_at IS NULL`,
        [hash, replacedByHash]
      )
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

    async insert(hash: string, familyId: string, expiresAt: Date) {
      // session_id comes from the family: every token in a chain belongs to
      // the same device, and carrying it separately would let the two drift.
      await pool.query(
        `INSERT INTO app_refresh_tokens (token_hash, family_id, session_id, expires_at)
         SELECT $1, $2, id, $3 FROM app_sessions WHERE family_id = $2 LIMIT 1`,
        [hash, familyId, expiresAt.toISOString()]
      )
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
  for (const id of ids) revokeNow(id)
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
