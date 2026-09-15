/**
 * CORRECTING THE MEMORY WITHOUT ERASING IT.
 *
 * THE DECISION, MADE BY THE OWNER ON 2026-09-15: supersede with a new record,
 * erase nothing. A mistake is not removed from the log; a later record cancels
 * it, and both stay visible.
 *
 * WHY THIS WAS NEEDED. `crm_touches` is append-only and had no correction of
 * any kind: no delete, no update, no compensating entry. A mis-tapped refusal
 * therefore could not be taken back by any means available to the owner -- and
 * `stageOf` latches on ANY refusal ever recorded, with no time window, so the
 * person stayed in the refused stage forever unless they paid.
 *
 * WHY POINT AT A ROW AND NOT JUST SAY "UNDO". A bare 'undo' kind would have to
 * mean "cancel the previous something", and the previous something is whatever
 * the ordering says at the moment it is read. `reverts_id` names the exact row,
 * which makes three things true that a bare marker cannot promise:
 *
 *   1. Two undos in a row cannot cancel the wrong entry.
 *   2. The card can SAY which act was taken back, and when.
 *   3. A reader that does not know about corrections yet still sees a plain
 *      extra row rather than a silently different history.
 *
 * WHY A FOLD AND NOT A FLAG ON THE ROW. Marking the cancelled row itself would
 * be an UPDATE -- a write that edits the past, which is the thing being avoided.
 * The log stays exactly as it was written; the CURRENT state is computed from
 * it. Every consumer therefore calls `effectiveTouches` instead of reading rows
 * directly, and the raw history remains available for the card, for an audit,
 * and for the question "what did I do and when did I undo it".
 */

/** A row as the log stores it. `id` and `revertsId` come from the database. */
export interface TouchRow {
  id?: number | null
  kind: string
  at: string
  note?: string | null
  /** The id of an earlier row this one cancels. Null for an ordinary touch. */
  revertsId?: number | null
}

/**
 * The touches that still count, newest first.
 *
 * A row is dropped when some row that ITSELF still counts names its id in
 * `revertsId`. The qualification matters: an undo of an undo voids the middle
 * record, and the original act stands again.
 *
 * The cancelling row is dropped too -- it is bookkeeping about the log, not an
 * act performed on the client, and leaving it in would make "the latest touch"
 * mean "the latest correction", which is how a cancelled refusal would come
 * back wearing a new hat.
 *
 * Order is preserved as given. Callers pass newest-first and get newest-first.
 *
 * A correction that names a row which is not present (older than the window a
 * query asked for, or already gone) still removes ITSELF, because its subject
 * is provably not in this slice and counting the bookkeeping row would be worse
 * than counting nothing.
 */
export function effectiveTouches<T extends TouchRow>(rows: T[]): T[] {
  /*
   * NEWEST FIRST, AND THE ORDER IS LOAD-BEARING.
   *
   * A cancellation only counts if the cancelling row ITSELF still counts --
   * otherwise an undo of an undo would leave both the correction and its
   * subject dead, and the original act could never come back. Since a
   * correction is always newer than what it cancels, walking newest-first means
   * every corrector is judged before its target, and one pass is enough.
   *
   * Every query in crm-touches.ts returns rows newest-first (ORDER BY at DESC).
   * Given some other order, a correction could be read before it is known to be
   * void; the contract is stated here rather than defended by re-sorting,
   * because a silent re-sort would hide a caller that got it wrong.
   */
  const killed = new Set<number>()
  const dead = new Set<T>()
  for (const r of rows) {
    const id = r?.id
    const isDead = typeof id === 'number' && killed.has(id)
    if (isDead) {
      dead.add(r)
      continue
    }
    const target = r?.revertsId
    if (typeof target === 'number' && Number.isFinite(target))
      killed.add(target)
  }
  return rows.filter(r => {
    if (dead.has(r)) return false
    // A correction is bookkeeping about the log, not an act performed on the
    // client. Leaving it in would make "the latest touch" mean "the latest
    // correction", and a cancelled refusal would come back wearing a new hat.
    return !(typeof r?.revertsId === 'number' && Number.isFinite(r.revertsId))
  })
}

/**
 * Did this row get taken back, and by which one?
 *
 * For the lead card, which shows the whole history INCLUDING the mistakes: an
 * act that was undone should read as undone rather than quietly disappear. That
 * is the difference between a log that can be trusted and one that has been
 * tidied.
 */
export function revocationOf<T extends TouchRow>(
  rows: T[],
  row: T
): T | undefined {
  const id = row?.id
  if (typeof id !== 'number') return undefined
  return rows.find(r => r?.revertsId === id)
}

/**
 * The row a correction should name, given what the owner just asked to undo.
 *
 * "Take back the refusal" means the LATEST refusal that still counts -- not the
 * latest touch of any kind, and not one that has already been taken back. Rows
 * are expected newest-first, as every query in crm-touches.ts returns them.
 *
 * Returns undefined when there is nothing of that kind left to undo, which the
 * caller must report rather than writing a correction that names nothing.
 */
export function latestToRevert<T extends TouchRow>(
  rows: T[],
  kind: string
): T | undefined {
  return effectiveTouches(rows).find(
    r => r.kind === kind && typeof r.id === 'number'
  )
}

/**
 * The last thing that ACTUALLY happened, ignoring notes.
 *
 * A `note` is a fact somebody wrote down, not an act: the owner writes one
 * from crm_touch, and the seller writes one when a subscription is cancelled
 * or a managed bot appears. Readers that take "the newest row" then treat a
 * note as the latest act, and every one of them has a branch per kind and
 * none for `note`.
 *
 * It lived in crm-stages.ts and was applied only by stageOf and waitingOn.
 * The three readers that actually CHOOSE THE QUEUE -- the score penalty, the
 * "talk" veto and refusedLately -- read a single row handed to them by
 * touchedSince, and it still carried notes. So one card could say
 * stage='refused' and segment='talk' at the same time: one fact, two answers,
 * which is exactly what the fix before this one claimed to have ended.
 *
 * Here because this module is already the one place that says what still
 * counts, and because both callers import it.
 */
export function lastAct<T extends { kind: string }>(
  touches: readonly T[] | undefined
): T | undefined {
  return (touches ?? []).find(t => t?.kind !== 'note')
}
