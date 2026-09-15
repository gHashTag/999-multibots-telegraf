/**
 * THE CORRECTION MODEL: supersede, never erase.
 *
 * The owner's decision, 2026-09-15: supersede with a new record, erase
 * nothing. These cases pin what that means in practice, including the ones
 * that are easy to get wrong -- a double undo, an undo of an undo, and a
 * correction whose subject is outside the slice a query returned.
 */
import { describe, it, expect } from 'vitest'
import {
  effectiveTouches,
  latestToRevert,
  revocationOf,
  lastAct,
  type TouchRow,
} from './crm-supersede'

/** Newest first, as every query in crm-touches.ts returns them. */
const rows = (...r: TouchRow[]) => r

describe('what still counts', () => {
  it('leaves an ordinary history untouched', () => {
    const log = rows(
      { id: 3, kind: 'replied', at: '2026-09-03' },
      { id: 2, kind: 'written', at: '2026-09-02' },
      { id: 1, kind: 'note', at: '2026-09-01' }
    )
    expect(effectiveTouches(log).map(r => r.id)).toEqual([3, 2, 1])
  })

  it('drops the cancelled act AND the row that cancels it', () => {
    const log = rows(
      { id: 5, kind: 'refused', at: '2026-09-05', revertsId: 4 },
      { id: 4, kind: 'refused', at: '2026-09-04' },
      { id: 2, kind: 'written', at: '2026-09-02' }
    )
    // The correction is bookkeeping about the log, not an act on the client:
    // counting it would make "the latest touch" mean "the latest correction".
    expect(effectiveTouches(log).map(r => r.id)).toEqual([2])
  })

  it('keeps the mistake visible in the raw log — nothing is erased', () => {
    const log = rows(
      { id: 5, kind: 'refused', at: '2026-09-05', revertsId: 4 },
      { id: 4, kind: 'refused', at: '2026-09-04' }
    )
    // The caller still holds both rows; only the DERIVED view drops them.
    expect(log).toHaveLength(2)
    expect(revocationOf(log, log[1])?.id).toBe(5)
    expect(revocationOf(log, log[0])).toBeUndefined()
  })

  it('cancels only the row it names, not every row of that kind', () => {
    const log = rows(
      { id: 9, kind: 'later', at: '2026-09-09', revertsId: 7 },
      { id: 8, kind: 'later', at: '2026-09-08' },
      { id: 7, kind: 'later', at: '2026-09-07' }
    )
    expect(effectiveTouches(log).map(r => r.id)).toEqual([8])
  })

  it('an undo of an undo brings the original act back', () => {
    // Row 6 cancels row 5, and row 5 was itself the cancellation of row 4.
    // With 5 out of the way, 4 stands again -- which is what "supersede"
    // has to mean if corrections are themselves ordinary records.
    const log = rows(
      { id: 6, kind: 'refused', at: '2026-09-06', revertsId: 5 },
      { id: 5, kind: 'refused', at: '2026-09-05', revertsId: 4 },
      { id: 4, kind: 'refused', at: '2026-09-04' }
    )
    expect(effectiveTouches(log).map(r => r.id)).toEqual([4])
  })

  it('a correction whose subject is outside this slice removes only itself', () => {
    // touchedSince asks for 60 days; the refusal it cancels is 400 days old and
    // simply is not here. Counting the bookkeeping row would be worse than
    // counting nothing.
    const log = rows({
      id: 11,
      kind: 'refused',
      at: '2026-09-11',
      revertsId: 2,
    })
    expect(effectiveTouches(log)).toEqual([])
  })

  it('survives rows with no id, and a malformed revertsId', () => {
    const log = rows(
      { kind: 'written', at: '2026-09-02' },
      { id: 1, kind: 'note', at: '2026-09-01', revertsId: null },
      { id: 0, kind: 'later', at: '2026-08-31' }
    )
    expect(effectiveTouches(log)).toHaveLength(3)
    expect(effectiveTouches([])).toEqual([])
  })
})

describe('what a correction should name', () => {
  const log = rows(
    { id: 9, kind: 'written', at: '2026-09-09' },
    { id: 8, kind: 'refused', at: '2026-09-08' },
    { id: 7, kind: 'refused', at: '2026-09-07' }
  )

  it('picks the latest act of that kind, not the latest act', () => {
    expect(latestToRevert(log, 'refused')?.id).toBe(8)
  })

  it('will not name one that was already taken back', () => {
    const undone = rows(
      { id: 10, kind: 'refused', at: '2026-09-10', revertsId: 8 },
      ...log
    )
    expect(latestToRevert(undone, 'refused')?.id).toBe(7)
  })

  it('finds nothing when there is nothing left to undo', () => {
    expect(latestToRevert(log, 'bought')).toBeUndefined()
    const allUndone = rows(
      { id: 12, kind: 'refused', at: '2026-09-12', revertsId: 8 },
      { id: 11, kind: 'refused', at: '2026-09-11', revertsId: 7 },
      { id: 8, kind: 'refused', at: '2026-09-08' },
      { id: 7, kind: 'refused', at: '2026-09-07' }
    )
    // The caller must say there is nothing to undo, rather than write one
    // that names nothing.
    expect(latestToRevert(allUndone, 'refused')).toBeUndefined()
  })
})

/**
 * A NOTE IS NOT AN ACT, AND THREE READERS TAKE THE TOP ROW.
 *
 * `lastAct` lived in crm-stages.ts and was applied only by stageOf and
 * waitingOn. The three readers that actually CHOOSE THE QUEUE -- the score
 * penalty, the veto on next='talk', and refusedLately -- all read a single row
 * handed to them by touchedSince, and it still carried notes. So a note
 * written on somebody who had refused made the refusal invisible to every one
 * of them, while the stage, read from the full history, still said 'refused'.
 * One card, two answers -- the very thing the fix before this one claimed to
 * have ended.
 */
describe('the latest ACT, not the latest row', () => {
  it('looks past a note to the act underneath', () => {
    const log = rows(
      { id: 3, kind: 'note', at: '2026-09-10' },
      { id: 2, kind: 'refused', at: '2026-09-08' },
      { id: 1, kind: 'written', at: '2026-09-01' }
    )
    expect(lastAct(log)?.id).toBe(2)
  })

  it('looks past several notes in a row', () => {
    const log = rows(
      { id: 4, kind: 'note', at: '2026-09-11' },
      { id: 3, kind: 'note', at: '2026-09-10' },
      { id: 2, kind: 'refused', at: '2026-09-08' }
    )
    expect(lastAct(log)?.id).toBe(2)
  })

  it('answers nothing when a person has only ever been noted', () => {
    // Not an act at all: they should read as never touched, not as something.
    expect(
      lastAct(rows({ id: 1, kind: 'note', at: '2026-09-01' }))
    ).toBeUndefined()
    expect(lastAct([])).toBeUndefined()
    expect(lastAct(undefined)).toBeUndefined()
  })

  it('composes with the fold: a cancelled act is not the act either', () => {
    // The two are applied together everywhere: fold first, then the act.
    const log = rows(
      { id: 4, kind: 'note', at: '2026-09-12' },
      { id: 3, kind: 'refused', at: '2026-09-11', revertsId: 2 },
      { id: 2, kind: 'refused', at: '2026-09-08' },
      { id: 1, kind: 'written', at: '2026-09-01' }
    )
    expect(lastAct(effectiveTouches(log))?.id).toBe(1)
  })
})
