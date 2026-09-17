/**
 * A CENSUS IS ONLY WORTH THE RULES IT COUNTS BY.
 *
 * The network half of hive-failures.cjs cannot be tested without production, and
 * faking it would only test the fake. What CAN go wrong without anyone noticing
 * is the reading: a note whose wording drifts and stops matching, a reason that
 * silently becomes "unknown", the same row counted twice because it is both a
 * failure and a lost picture.
 *
 * The rows below are invented -- synthetic ids, roles instead of names -- and
 * shaped exactly like what the journal returns.
 */
import { describe, expect, it } from 'vitest'

const census = require('./hive-failures.cjs')

const lostRow = (
  id: string,
  reason: string,
  at = '2026-09-16T10:00:00.000Z'
) => ({
  at,
  kind: 'failure',
  who: '900000012',
  bot: 'a_bot',
  note: `фото-черновик ${id} ${reason}: картинка сделана, но не отправлена`,
  severity: 'normal',
})

describe('what counts as a lost picture', () => {
  it('reads the reason out of the note', () => {
    expect(census.reasonOf(lostRow('530531f8d51f', 'replaced'))).toBe(
      'replaced'
    )
    expect(census.reasonOf(lostRow('b909a7a25b67', 'expired'))).toBe('expired')
    expect(census.reasonOf(lostRow('3c03eb0522ef', 'cancelled'))).toBe(
      'cancelled'
    )
  })

  /*
   * An unparsed note must land in a visible bucket rather than vanish. A census
   * that drops what it does not understand reports a falling trend when the only
   * thing that fell is its own reading.
   */
  it('calls an unreadable note unknown instead of dropping it', () => {
    const row = {
      at: '2026-09-16T10:00:00.000Z',
      kind: 'failure',
      note: 'no id here: картинка сделана, но не отправлена',
    }
    expect(census.isLostPicture(row)).toBe(true)
    expect(census.reasonOf(row)).toBe('unknown')
  })

  it('counts a lost picture whichever kind it was filed under', () => {
    const asFailure = lostRow('530531f8d51f', 'replaced')
    const asDraft = {
      ...lostRow('530531f8d51f', 'replaced'),
      kind: 'draft-unsent',
    }
    expect(census.isLostPicture(asFailure)).toBe(true)
    expect(census.isLostPicture(asDraft)).toBe(true)
  })

  it('does not count an ordinary card as a loss', () => {
    const card = {
      at: '2026-09-16T10:00:00.000Z',
      kind: 'sweep-card',
      note: 'подготовлен подарок proposal 2076d16e0ede',
    }
    expect(census.isLostPicture(card)).toBe(false)
  })
})

describe('the two buckets do not overlap', () => {
  /*
   * This is the arithmetic that makes the headline honest: 44 + 7 must be the
   * whole of the failures, not 44 + 7 with a dozen rows in both columns.
   */
  it('never counts one row as both a loss and another failure', () => {
    const rows = [
      lostRow('530531f8d51f', 'replaced'),
      {
        at: '2026-09-16T09:00:00.000Z',
        kind: 'sweep-failed',
        note: 'terminated',
      },
      {
        at: '2026-09-16T08:00:00.000Z',
        kind: 'sweep-card',
        note: 'card is ready',
      },
    ]
    const lost = rows.filter(census.isLostPicture)
    const other = rows.filter(census.isOtherFailure)
    expect(lost).toHaveLength(1)
    expect(other).toHaveLength(1)
    expect(lost.filter(r => other.includes(r))).toHaveLength(0)
  })

  it('ignores a success even when its kind is not a failure kind', () => {
    const rows = [
      {
        at: '2026-09-16T08:00:00.000Z',
        kind: 'published',
        note: 'awaiting approval',
      },
    ]
    expect(rows.filter(census.isOtherFailure)).toHaveLength(0)
  })
})

describe('tally', () => {
  it('groups and orders by count, biggest first', () => {
    const rows = [
      lostRow('a1b2c3d4e5f6', 'replaced'),
      lostRow('a1b2c3d4e5f7', 'replaced'),
      lostRow('a1b2c3d4e5f8', 'expired'),
    ]
    expect(census.tally(rows, census.reasonOf)).toEqual([
      ['replaced', 2],
      ['expired', 1],
    ])
  })
})

describe('splitting the window at the running build', () => {
  const row = (at: string, kind = 'sweep-card') => ({ at, kind, note: 'x' })

  it('puts an event before the start on the left and after it on the right', () => {
    const rows = [
      row('2026-09-16T16:00:00.000Z'),
      row('2026-09-16T14:00:00.000Z'),
    ]
    const half = census.splitAtDeploy(rows, '2026-09-16T15:15:15.762Z')
    expect(half.dated).toBe(true)
    expect(half.before).toHaveLength(1)
    expect(half.since).toHaveLength(1)
    expect(half.before[0].at).toBe('2026-09-16T14:00:00.000Z')
  })

  /*
   * An event stamped exactly at the start belongs to what came before: the
   * process was not yet serving when it was written.
   */
  it('counts an event at the exact start as before', () => {
    const half = census.splitAtDeploy(
      [row('2026-09-16T15:15:15.762Z')],
      '2026-09-16T15:15:15.762Z'
    )
    expect(half.before).toHaveLength(1)
    expect(half.since).toHaveLength(0)
  })

  /*
   * With no start time there is no split to make, and pretending otherwise
   * would date every event to a build nobody can name. Everything lands in one
   * column and `dated` says the column means nothing.
   */
  it('refuses to date anything when the build start is unknown', () => {
    const rows = [row('2026-09-16T16:00:00.000Z')]
    for (const bad of [null, undefined, '', 'not a date']) {
      const half = census.splitAtDeploy(rows, bad as never)
      expect(half.dated).toBe(false)
      expect(half.before).toHaveLength(0)
      expect(half.since).toHaveLength(1)
    }
  })
})

describe('the later of two deploys is the ruler', () => {
  /*
   * THE FIRST VERSION SPLIT AT THE RENDER'S START AND THEN JUDGED THE SWEEP BY
   * IT. The sweep lives in the bot. Two deployments with their own restarts
   * were being measured with one ruler, and the wrong one -- the render
   * redeploys on nearly every merge, so the window kept resetting to nothing
   * while the bot sat unchanged for hours.
   *
   * Later of the two, on purpose: only past that moment is the whole pipeline
   * the new one. It can call a fixed thing unproven; it cannot call a broken
   * thing fixed.
   */
  it('takes the later instant', () => {
    expect(census.laterOf('2026-09-17T07:09:51Z', '2026-09-17T07:15:32Z')).toBe(
      '2026-09-17T07:15:32Z'
    )
    expect(census.laterOf('2026-09-17T07:15:32Z', '2026-09-17T07:09:51Z')).toBe(
      '2026-09-17T07:15:32Z'
    )
  })

  /*
   * One service unreachable is not the same as no information: the half that
   * answered still anchors the split, and the header says which half is
   * missing.
   */
  it('uses whichever half answered when the other did not', () => {
    expect(census.laterOf(null, '2026-09-17T07:15:32Z')).toBe(
      '2026-09-17T07:15:32Z'
    )
    expect(census.laterOf('2026-09-17T07:09:51Z', null)).toBe(
      '2026-09-17T07:09:51Z'
    )
  })

  it('has nothing to anchor on when neither answered', () => {
    expect(census.laterOf(null, null)).toBeNull()
    // and the split refuses to date anything, which splitAtDeploy already pins
    expect(
      census.splitAtDeploy([{ at: 'x' }], census.laterOf(null, null)).dated
    ).toBe(false)
  })
})
