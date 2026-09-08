import { describe, it, expect } from 'vitest'

/*
 * AN AVERAGE OVER THE TWO COHORTS DESCRIBES NOBODY.
 *
 * 1559 of the 2380 rows in `users` were created in ONE SECOND -- a bulk
 * import. Mixed into a single average they hide the finding, because the
 * imported cohort CONTINUES BETTER than the organic one: 56.9% stop after a
 * single generation against 84.6%. The blended number reads "about two thirds
 * stop", which is true of neither group.
 *
 * The import second is DETECTED rather than written down, because a hardcoded
 * timestamp stops matching after the next import and silently puts everybody
 * back into one bucket -- the exact failure this split exists to prevent.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { analyse } = require('../../../scripts/first-visit.cjs')

/*
 * A timestamp production has never seen, on purpose. The first version used
 * the real import second -- and a mutant that HARDCODED that second passed
 * every check, because the fixture handed it the answer. A control has to use
 * a value the alternative path cannot reach; this is the third time today that
 * rule has been paid for.
 */
const IMPORT = '2026-03-03T03:03:03Z'
const bulk = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    telegram_id: `i${i}`,
    created_at: IMPORT,
  }))

describe('the two cohorts are read apart', () => {
  it('detects the crowded second instead of being told it', () => {
    const r = analyse(
      [...bulk(40), { telegram_id: 'a', created_at: '2026-01-01T00:00:00Z' }],
      []
    )
    expect(r.importSize).toBe(40)
    expect(r.importSecond).toBe(IMPORT.slice(0, 19))
  })

  it('calls nothing an import when arrivals are merely spread thin', () => {
    // Two people sharing a second is a coincidence, not a bulk load. Without
    // this the split would fire on ordinary traffic and invent a cohort.
    const r = analyse(
      [
        { telegram_id: 'a', created_at: '2026-01-01T00:00:00Z' },
        { telegram_id: 'b', created_at: '2026-01-01T00:00:00Z' },
        { telegram_id: 'c', created_at: '2026-01-02T00:00:00Z' },
      ],
      []
    )
    expect(r.importSecond).toBeNull()
    expect(r.organic.none).toBe(3)
    expect(r.imported.none).toBe(0)
  })

  it('counts a repeat generator apart from a single one', () => {
    const r = analyse(
      [...bulk(30), { telegram_id: 'a', created_at: '2026-01-01T00:00:00Z' }],
      [
        { telegram_id: 'a', created_at: '2026-01-01T00:10:00Z' },
        { telegram_id: 'i0', created_at: '2025-09-16T11:00:00Z' },
        { telegram_id: 'i0', created_at: '2025-09-16T12:00:00Z' },
      ]
    )
    expect(r.organic.once).toBe(1)
    expect(r.imported.more).toBe(1)
    expect(r.imported.once).toBe(0)
  })

  it('the within-the-hour count needs the hour, not merely a generation', () => {
    const r = analyse(
      [{ telegram_id: 'a', created_at: '2026-01-01T00:00:00Z' }],
      [{ telegram_id: 'a', created_at: '2026-01-03T00:00:00Z' }]
    )
    expect(r.organic.once).toBe(1)
    expect(r.organic.withinHour).toBe(0)
  })

  it('a generation with no timestamp is not counted as one', () => {
    const r = analyse(
      [{ telegram_id: 'a', created_at: '2026-01-01T00:00:00Z' }],
      [{ telegram_id: 'a', created_at: null }]
    )
    expect(r.organic.none).toBe(1)
  })
})
