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
