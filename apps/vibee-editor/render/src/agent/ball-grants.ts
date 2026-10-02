/**
 * WHO BESIDES THE OWNER MAY SEE THE MAIL CARDS OF THE BALL BOARD.
 *
 * Owner, 2026-10-01: every task from the mail visible to the owner when signed
 * in, "and to others if I allowed it -- sort out privacy and security".
 *
 * The spec of record is gHashTag/t27 specs/automation/ball-grants.t27,
 * vendored as src/spec/ball-grants.t27 with its generated module. Its `fn`s
 * are implemented here, once, and bound by src/spec/ball-grants.test.ts.
 *
 * WHAT A GRANT IS
 *
 * One row: this viewer (a telegram id -- a username can change hands) may see
 * the mail cards of this client (or of every LINKED client, `*`) until this
 * date. The owner makes it with `ball_grant`; nobody else can, and the owner
 * cannot grant to themselves. Every grant ends: unsized means a month, and
 * nothing outlives a quarter (DAYS_DEFAULT, DAYS_MAX).
 *
 * WHAT IT DOES NOT OPEN
 *
 * - The github column: private repositories' titles stay the owner's.
 * - A matter no link names: it has no client to be granted, so it reaches no
 *   viewer, whatever the grant says.
 * - The owner's links and the counterparties' addresses: the links are applied
 *   on the server, and no card carries an address.
 * - Counts of what was not sent: a viewer's numbers are of cards in hand.
 * - The t27.ai game token: ball_board is not in GAME_TOKEN_TOOLS (routes.ts);
 *   that token was consented for a name and a picture, not for mail.
 *
 * And the owner sees who looked: every viewer read stamps `last_read_at`, and
 * `ball_grant` with `list` shows it.
 */

import * as SPEC from '../spec/ball-grants.gen'
import { OWNER_TELEGRAM_ID, requireOwner } from './telegram-tools'
import type { AgentTool, ToolContext } from './tools'

type Pool = ToolContext['pool']

/* ------------------------------------------------------ the spec's decisions */

/** The spec's `may_read_mail`: the owner, or a caller holding a live grant. */
export function mayReadMail(
  callerIsOwner: boolean,
  hasLiveGrant: boolean
): boolean {
  return callerIsOwner || hasLiveGrant
}

/** The spec's `may_grant`: only the owner, and never to the owner. */
export function mayGrant(
  callerIsOwner: boolean,
  viewerIsOwner: boolean
): boolean {
  return callerIsOwner && !viewerIsOwner
}

/**
 * The spec's `grant_covers`. Both sides arrive already in the board's client
 * key form (ball-board.ts clientKey), so "Acme" and "acme" are one client and
 * a telegram id is one person; an unlinked card arrives as ''.
 */
export function grantCovers(grantClient: string, cardClient: string): boolean {
  if (cardClient === '') return false
  if (grantClient === SPEC.ALL_CLIENTS) return true
  return grantClient === cardClient
}

/** The spec's `grant_days`: unsized is the default, oversized the ceiling. */
export function grantDays(asked: number): number {
  if (asked === 0) return SPEC.DAYS_DEFAULT
  if (asked > SPEC.DAYS_MAX) return SPEC.DAYS_MAX
  return asked
}

/* ----------------------------------------------------------------- storage */

export async function ensureGrantTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SPEC.TABLE} (
      owner text NOT NULL,
      viewer text NOT NULL,
      client text NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      last_read_at timestamptz,
      PRIMARY KEY (owner, viewer, client)
    )
  `)
}

/**
 * The clients this viewer holds a live grant for, as stored. Empty for the
 * owner (who needs none) and for anybody the owner has not granted. The
 * board asks this BEFORE it reads any mail.
 */
export async function liveGrantsFor(
  pool: Pool,
  viewer: string
): Promise<string[]> {
  if (viewer === OWNER_TELEGRAM_ID) return []
  await ensureGrantTable(pool)
  const r = await pool.query(
    `SELECT client FROM ${SPEC.TABLE}
     WHERE owner = $1 AND viewer = $2 AND expires_at > now()`,
    [OWNER_TELEGRAM_ID, viewer]
  )
  return (r.rows ?? []).map(x => String(x.client))
}

/** The spec's READ_RECORDED: the owner's list says who looked, and when. */
export async function recordRead(pool: Pool, viewer: string): Promise<void> {
  await pool.query(
    `UPDATE ${SPEC.TABLE} SET last_read_at = now()
     WHERE owner = $1 AND viewer = $2 AND expires_at > now()`,
    [OWNER_TELEGRAM_ID, viewer]
  )
}

function callerIsOwner(ctx: ToolContext): boolean {
  try {
    requireOwner(ctx)
    return true
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------- tool */

export const BALL_GRANT_TOOLS: AgentTool[] = [
  {
    name: SPEC.TOOL,
    description:
      "Owner only. Let another person (by telegram id) see the ball board's MAIL cards of one client, " +
      `or of every linked client ("${SPEC.ALL_CLIENTS}"), for N days (default ${SPEC.DAYS_DEFAULT}, max ${SPEC.DAYS_MAX}); revoke it; or list who has access and when they last looked. ` +
      'Never opens the github column, unlinked matters, addresses or links.',
    parameters: {
      type: 'object',
      properties: {
        viewer: { type: 'string', description: 'telegram id, digits only' },
        client: {
          type: 'string',
          description: 'a client as linked with ball_link, or "*"',
        },
        days: { type: 'number' },
        revoke: { type: 'boolean' },
        list: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    async handler(args, ctx: ToolContext) {
      requireOwner(ctx)
      await ensureGrantTable(ctx.pool)
      const owner = OWNER_TELEGRAM_ID

      if (args.list || args.viewer === undefined) {
        const r = await ctx.pool.query(
          `SELECT viewer, client, granted_at, expires_at, last_read_at,
                  expires_at > now() AS live
           FROM ${SPEC.TABLE} WHERE owner = $1
           ORDER BY viewer, client`,
          [owner]
        )
        return { grants: r.rows ?? [] }
      }

      const viewer = String(args.viewer ?? '').trim()
      const client = String(args.client ?? '').trim()
      if (!/^\d{5,15}$/.test(viewer)) {
        throw new Error('viewer must be a telegram id (digits only)')
      }
      if (!client) throw new Error('client must be non-empty, or "*"')
      if (!mayGrant(callerIsOwner(ctx), viewer === owner)) {
        throw new Error('the owner needs no grant to their own board')
      }

      if (args.revoke) {
        await ctx.pool.query(
          `DELETE FROM ${SPEC.TABLE}
           WHERE owner = $1 AND viewer = $2 AND client = $3`,
          [owner, viewer, client]
        )
        return { revoked: { viewer, client } }
      }

      const days = grantDays(
        Math.max(0, Math.floor(Number(args.days ?? 0) || 0))
      )
      const r = await ctx.pool.query(
        `INSERT INTO ${SPEC.TABLE} (owner, viewer, client, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(days => $4))
         ON CONFLICT (owner, viewer, client)
         DO UPDATE SET granted_at = now(), expires_at = EXCLUDED.expires_at
         RETURNING expires_at`,
        [owner, viewer, client, days]
      )
      return {
        granted: {
          viewer,
          client,
          days,
          expires_at: r.rows?.[0]?.expires_at ?? null,
          opens: SPEC.SOURCE,
        },
      }
    },
  },
]
