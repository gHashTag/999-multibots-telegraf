/**
 * THE BRAKE: AN AGENT ASKS BEFORE IT DOES SOMETHING THAT CANNOT BE UNDONE.
 *
 * Until this existed, "send the email", "pay", "delete the account" were one
 * `browser_click` away and nobody was asked. The architecture said they must
 * be confirmed by a person (docs/architecture/remote-browser-per-user.md
 * §4.5); there was simply no channel to ask through.
 *
 * ── HOW IT ASKS ───────────────────────────────────────────────────────────
 *
 * Two URL buttons in Telegram, pointing at this server. Not callback buttons:
 * those are handled by the BOT, a different service, and a confirmation that
 * has to cross a service boundary is a confirmation that stops working the
 * day that boundary moves. A link lands here, is spent, and answers.
 *
 * ── WHAT IS HONEST ABOUT ITS LIMITS ───────────────────────────────────────
 *
 * This is a brake an agent PULLS. Nothing here can force an agent to ask:
 * `browser_click` still exists and still clicks. Enforcement by construction
 * would mean classifying every possible click as reversible or not, which
 * nothing can do from outside a page. So: the tool descriptions require it,
 * this makes asking possible and cheap, and the limit is written down instead
 * of being discovered.
 *
 * What it DOES guarantee, and this is worth having: when an agent asks, the
 * answer is a real person's, it cannot be forged by the agent (the token is
 * server-side), it expires, and it is spent exactly once.
 */

import { randomBytes } from 'node:crypto'
import type { Queryable } from './sessions'

export type ApprovalState = 'pending' | 'allowed' | 'denied' | 'expired'

export interface Approval {
  id: string
  telegramId: string
  what: string
  state: ApprovalState
}

/** Long enough for somebody to look at their phone, short enough to expire. */
export const APPROVAL_TTL_MS = 10 * 60 * 1000

let tableReady = false

export async function ensureApprovals(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS browser_approvals (
       id          text PRIMARY KEY,
       telegram_id text NOT NULL,
       what        text NOT NULL,
       state       text NOT NULL CHECK (state IN ('pending','allowed','denied','expired')),
       allow_token text NOT NULL,
       deny_token  text NOT NULL,
       created_at  timestamptz NOT NULL DEFAULT now(),
       decided_at  timestamptz
     )`,
    []
  )
  tableReady = true
}

/** Test seam: the cached flag would otherwise leak between test cases. */
export function resetApprovalsCache(): void {
  tableReady = false
}

export function newApprovalToken(): string {
  return randomBytes(24).toString('base64url')
}

export interface AskInput {
  telegramId: string
  what: string
  newId: () => string
  newToken: () => string
}

export async function askFor(
  q: Queryable,
  input: AskInput
): Promise<{ id: string; allowToken: string; denyToken: string }> {
  const id = input.newId()
  const allowToken = input.newToken()
  const denyToken = input.newToken()
  await q.query(
    `INSERT INTO browser_approvals
       (id, telegram_id, what, state, allow_token, deny_token)
     VALUES ($1, $2, $3, 'pending', $4, $5)`,
    [id, input.telegramId, input.what, allowToken, denyToken]
  )
  return { id, allowToken, denyToken }
}

/**
 * Spend one link.
 *
 * ONE DECISION, ONCE. `state = 'pending'` in the WHERE clause is the whole
 * guard: a second press, a forwarded message, a link somebody keeps -- all of
 * them find nothing to change. Without it an old "allow" could be replayed
 * against a new question.
 *
 * The token is compared IN THE STATEMENT rather than fetched and checked
 * here, so a wrong token and a missing row are the same answer, and neither
 * says whether the id exists.
 */
export async function decide(
  q: Queryable,
  id: string,
  token: string,
  ttlMs: number = APPROVAL_TTL_MS
): Promise<ApprovalState | null> {
  /*
   * THE AGE IS CHECKED HERE, NOT ONLY WHEN READING.
   *
   * Found by the database check, not by a unit test: without this clause an
   * hour-old "Allow" button still worked when pressed. `readApproval` called
   * that question expired while `decide` happily granted it -- two answers to
   * the same question, and the generous one won.
   *
   * It belongs in this statement because this statement is the gate: one
   * atomic decide-and-filter, no read-check-write, no race.
   */
  const { rows } = await q.query(
    `UPDATE browser_approvals
        SET state = CASE WHEN allow_token = $2 THEN 'allowed' ELSE 'denied' END,
            decided_at = now()
      WHERE id = $1
        AND state = 'pending'
        AND created_at > now() - ($3::bigint * interval '1 millisecond')
        AND (allow_token = $2 OR deny_token = $2)
      RETURNING state`,
    [id, token, ttlMs]
  )
  return rows[0] ? (String(rows[0].state) as ApprovalState) : null
}

/**
 * THE SAME DECISION, MADE BY THE TOKEN ALONE.
 *
 * Owner, 2026-09-24: the two buttons were `url` buttons, so pressing one left
 * Telegram for the phone's default browser -- where he is not signed in, and
 * where, on his phone, nothing happened at all. The rule has been written
 * down since 2026-09-22 and lives two files away (announce.ts: "a web_app
 * button, NEVER a url one"); the approval flow never got it.
 *
 * A callback button carries at most 64 bytes, and an id and a token are 65
 * together. The token alone is enough and loses nothing: it is 24 random
 * bytes, it already says WHICH answer (allow or deny), and it was always the
 * thing that authorised the decision -- the id was only where to look.
 *
 * Same single atomic statement as `decideApproval`, same age clause, for the
 * same reason: an hour-old button that still worked was found in production,
 * not by a unit test.
 */
export async function decideByToken(
  q: Queryable,
  token: string,
  ttlMs = APPROVAL_TTL_MS
): Promise<{ state: ApprovalState; id: string; telegramId: string } | null> {
  if (!token) return null
  const { rows } = await q.query(
    `UPDATE browser_approvals
        SET state = CASE WHEN allow_token = $1 THEN 'allowed' ELSE 'denied' END,
            decided_at = now()
      WHERE state = 'pending'
        AND created_at > now() - ($2::bigint * interval '1 millisecond')
        AND (allow_token = $1 OR deny_token = $1)
      RETURNING id, telegram_id, state`,
    [token, ttlMs]
  )
  const row = rows[0]
  return row
    ? {
        state: String(row.state) as ApprovalState,
        id: String(row.id),
        telegramId: String(row.telegram_id),
      }
    : null
}

export async function readApproval(
  q: Queryable,
  id: string
): Promise<Approval | null> {
  const { rows } = await q.query(
    `SELECT id, telegram_id, what, state,
            extract(epoch from created_at) * 1000 AS created_ms
       FROM browser_approvals WHERE id = $1`,
    [id]
  )
  const row = rows[0]
  if (!row) return null
  /* An answer that never came is a refusal, not a permission. */
  const age = Date.now() - (Number(row.created_ms) || 0)
  const state =
    String(row.state) === 'pending' && age > APPROVAL_TTL_MS
      ? 'expired'
      : (String(row.state) as ApprovalState)
  return {
    id: String(row.id),
    telegramId: String(row.telegram_id),
    what: String(row.what),
    state,
  }
}

/*
 * THE QUESTION ON THE PERSON'S OWN SCREEN, NOT ONLY IN TELEGRAM.
 *
 * Owner, 2026-09-22: the agent stood still on a Google settings page waiting
 * for "Allow", and the owner, watching the Browser tab, never saw the
 * question -- it was a message in another app. The tab now shows the open
 * question with two buttons. No token travels to the app: the person's own
 * door (a Mini App signature or an app session; an agent key is refused in
 * routes.ts) IS the proof, and the statement only lets them decide their
 * OWN question, once, while it is fresh.
 */
export async function pendingApprovalFor(
  q: Queryable,
  telegramId: string,
  ttlMs: number = APPROVAL_TTL_MS
): Promise<{ id: string; what: string } | null> {
  const { rows } = await q.query(
    `SELECT id, what FROM browser_approvals
      WHERE telegram_id = $1 AND state = 'pending'
        AND created_at > now() - ($2::bigint * interval '1 millisecond')
      ORDER BY created_at DESC LIMIT 1`,
    [telegramId, ttlMs]
  )
  const row = rows[0]
  return row ? { id: String(row.id), what: String(row.what) } : null
}

export async function decideAsPerson(
  q: Queryable,
  telegramId: string,
  id: string,
  allow: boolean,
  ttlMs: number = APPROVAL_TTL_MS
): Promise<ApprovalState | null> {
  const { rows } = await q.query(
    `UPDATE browser_approvals
        SET state = $3, decided_at = now()
      WHERE id = $1 AND telegram_id = $2
        AND state = 'pending'
        AND created_at > now() - ($4::bigint * interval '1 millisecond')
      RETURNING state`,
    [id, telegramId, allow ? 'allowed' : 'denied', ttlMs]
  )
  return rows[0] ? (String(rows[0].state) as ApprovalState) : null
}
