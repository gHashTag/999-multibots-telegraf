import * as SPEC from '../spec/kanban-card-chat.gen'

/**
 * MOVING A CARD FROM ITS SHEET (spec kanban-card-chat.t27 v4 S15, v5 S16).
 *
 * The Queen computes a card's column when the board is read: registry task
 * first, then the dispatch verdict, then the open issue. No route sets a
 * column, and the one write that could (PUT /queen/registry) replaces the
 * whole task array -- a sheet that used it to move one card would race every
 * other writer. So the sheet offers no move until the Queen has a door for
 * ONE card (MOVE_DOOR); these are the rules that door is held to.
 *
 * Relative imports only: render's binding test imports this file.
 */

/** The sheet offers a move only when the Queen has a door for one card. */
export function moveOffered(doorExists: boolean, oneCard: boolean): boolean {
  return doorExists && oneCard
}

/**
 * A person may ask only for "later" or "not doing": running and review are a
 * dispatch, blocked is a boundary, done is the Queen's acceptance.
 */
export function moveTargetOk(to: number): boolean {
  return to === SPEC.COL_BACKLOG || to === SPEC.COL_DROPPED
}

/**
 * A move happens when the door exists, the person tapped, the column is still
 * the one they saw (MOVE_SAYS_FROM), the target is theirs to ask for, and the
 * Queen accepted.
 */
export function moveApplies(
  doorExists: boolean,
  tapped: boolean,
  fromMatches: boolean,
  to: number,
  queenAccepts: boolean
): boolean {
  return doorExists && tapped && fromMatches && moveTargetOk(to) && queenAccepts
}

/** Column names as the board publishes them, by the spec's column codes. */
export const COLUMN_NAMES = [
  'backlog',
  'blocked',
  'running',
  'review',
  'done',
  'dropped',
] as const

export function columnCode(name: string | undefined): number {
  const i = (COLUMN_NAMES as readonly string[]).indexOf(name ?? '')
  return i < 0 ? SPEC.MOVE_NONE : i
}

/**
 * The one move the sheet offers from a column, or MOVE_NONE: a card nobody
 * has yet can be dropped, a dropped card can go back. The Queen refuses, with
 * her reason, an undrop of her own verdict -- the sheet shows what she said.
 */
export function moveChoice(col: number): number {
  if (col === SPEC.COL_BACKLOG || col === SPEC.COL_BLOCKED)
    return SPEC.COL_DROPPED
  if (col === SPEC.COL_DROPPED) return SPEC.COL_BACKLOG
  return SPEC.MOVE_NONE
}

export interface MoveAnswer {
  moved: boolean
  reason: string
  column?: string
}

/**
 * Whether render offers the button to this person (keeper, token, door). Not
 * asked at all while the spec says the door does not exist: no request is
 * spent on a button that cannot light.
 */
export async function readMoveOffer(
  base: string,
  headers: HeadersInit,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!SPEC.MOVE_DOOR_EXISTS) return false
  try {
    const r = await fetchImpl(`${base}${SPEC.MOVE_PROXY}`, { headers })
    if (!r.ok) return false
    const body = (await r.json()) as { offered?: unknown }
    return body?.offered === true
  } catch {
    return false
  }
}

function withJson(headers: HeadersInit): Headers {
  const h = new Headers(headers)
  h.set('Content-Type', 'application/json')
  return h
}

/** Ask render to move one card; the answer always carries a reason. */
export async function requestMove(
  base: string,
  headers: HeadersInit,
  move: { number: number; from: string; to: string; reason?: string },
  fetchImpl: typeof fetch = fetch
): Promise<MoveAnswer> {
  try {
    const r = await fetchImpl(`${base}${SPEC.MOVE_PROXY}`, {
      method: 'POST',
      headers: withJson(headers),
      body: JSON.stringify(move),
    })
    const body = (await r.json().catch(() => null)) as MoveAnswer | null
    if (body && typeof body.reason === 'string')
      return {
        moved: body.moved === true,
        reason: body.reason,
        column: body.column,
      }
    return { moved: false, reason: '' }
  } catch {
    return { moved: false, reason: '' }
  }
}
