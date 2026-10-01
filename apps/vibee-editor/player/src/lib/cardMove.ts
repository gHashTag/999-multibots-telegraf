import * as SPEC from '../spec/kanban-card-chat.gen'

/**
 * MOVING A CARD FROM ITS SHEET: THE CONTRACT, NOT YET A BUTTON (spec
 * kanban-card-chat.t27 v4, S15).
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
