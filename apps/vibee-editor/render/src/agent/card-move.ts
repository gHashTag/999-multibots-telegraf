import type { IncomingMessage, ServerResponse } from 'node:http'
import * as SPEC from '../spec/kanban-card-chat.gen'
import { keepers } from '../hive/roles'
import { forgetQueenIndex, queenMove } from '../hive/queen-client'

/**
 * MOVE_PROXY: a keeper's tap in the card sheet reaches the Queen's one-card
 * door (spec kanban-card-chat.t27 v5, S16).
 *
 * The Queen's `/queen/move` admits the deployment's own credential and nothing
 * else, so no browser can call it. Render checks that the person keeps the
 * hive, then calls the door with the token from MOVE_TOKEN_ENV; the token is
 * never written into an answer. The Queen's status and reason come back as she
 * said them: she knows the column now, the person saw a column a moment ago.
 *
 *   GET  -> 200 {offered, keeper, configured, door}   what the sheet may show
 *   POST {number, from, to, reason?} -> her answer, or ours when we stop first
 */

/** Column names as the board publishes them, by the spec's column codes. */
export const COLUMN_NAMES = [
  'backlog',
  'blocked',
  'running',
  'review',
  'done',
  'dropped',
] as const

export function columnCode(name: string): number {
  const i = (COLUMN_NAMES as readonly string[]).indexOf(name)
  return i < 0 ? SPEC.MOVE_NONE : i
}

/** The button shows to a keeper, when render holds the token and the door is deployed. */
export function moveAllowed(
  isKeeper: boolean,
  tokenSet: boolean,
  doorExists: boolean
): boolean {
  return isKeeper && tokenSet && doorExists
}

/** The one move offered from a column, or MOVE_NONE. */
export function moveChoice(col: number): number {
  if (col === SPEC.COL_BACKLOG || col === SPEC.COL_BLOCKED)
    return SPEC.COL_DROPPED
  if (col === SPEC.COL_DROPPED) return SPEC.COL_BACKLOG
  return SPEC.MOVE_NONE
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 4096) return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function handleCardMove(
  req: IncomingMessage,
  res: ServerResponse,
  who: string,
  opts: {
    env?: Record<string, string | undefined>
    fetchImpl?: typeof fetch
    doorExists?: boolean
    keeperIds?: () => string[]
  } = {}
): Promise<void> {
  const send = (code: number, body: unknown) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }
  const isKeeper = (opts.keeperIds ?? keepers)().includes(String(who))
  const token = (opts.env ?? process.env)[SPEC.MOVE_TOKEN_ENV]
  const door = opts.doorExists ?? SPEC.MOVE_DOOR_EXISTS
  const offered = moveAllowed(isKeeper, Boolean(token), door)

  if (req.method === 'GET') {
    return send(200, {
      offered,
      keeper: isKeeper,
      configured: Boolean(token),
      door,
    })
  }
  if (req.method !== 'POST')
    return send(405, { moved: false, reason: 'GET or POST' })
  if (!isKeeper) {
    return send(403, {
      moved: false,
      reason: 'only a keeper of the hive moves cards',
    })
  }
  if (!door) {
    return send(503, {
      moved: false,
      reason: 'the Queen has no move door yet -- nothing moved',
    })
  }
  if (!token) {
    return send(503, {
      moved: false,
      configured: false,
      reason: 'the move is not configured on this server -- nothing moved',
    })
  }

  const body = (await readBody(req)) as Record<string, unknown> | null
  const number = Number(body?.number)
  const from = typeof body?.from === 'string' ? body.from : ''
  const to = typeof body?.to === 'string' ? body.to : ''
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > SPEC.NUMBER_MAX ||
    moveChoice(columnCode(from)) === SPEC.MOVE_NONE ||
    moveChoice(columnCode(from)) !== columnCode(to)
  ) {
    return send(400, {
      moved: false,
      reason: 'from this column the sheet offers no such move',
    })
  }
  if (reason.length > SPEC.MOVE_REASON_MAX) {
    return send(400, {
      moved: false,
      reason: `a reason is one sentence, at most ${SPEC.MOVE_REASON_MAX} characters`,
    })
  }

  try {
    const said = await queenMove(
      { number, from, to, reason, by: `tg:${who}` },
      token,
      opts.fetchImpl
    )
    if (said.moved) forgetQueenIndex()
    return send(said.status, {
      moved: said.moved,
      reason: said.reason,
      column: said.column,
    })
  } catch {
    return send(502, {
      moved: false,
      reason: 'the Queen did not answer -- nothing moved',
    })
  }
}
