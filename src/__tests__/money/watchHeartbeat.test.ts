/**
 * THE HEARTBEAT: RARE ENOUGH TO IGNORE, FREQUENT ENOUGH THAT A GAP MEANS SOMETHING.
 *
 * The TON watch runs hourly and the Robokassa watch daily. If each wrote a line
 * every run, the journal would gain twenty-five lines a day saying "nothing
 * happened" and would bury the days when money was actually owed -- which is
 * precisely why `sweep-held` is rate-limited too. If neither wrote anything,
 * a working watch and a dead one would be the same silence, which is the flaw
 * the two shipped with.
 *
 * So the rate limit is the feature, and it is per CHANNEL: a quiet TON must not
 * silence Robokassa's heartbeat, or one dead watch would hide behind the
 * other's health.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  noteWatchQuietToHive,
  resetWatchHeartbeatForTests,
} from '@/services/hiveNote'

const posted: Array<Record<string, unknown>> = []

/** A door that records what was pushed through it and always accepts. */
const fetchImpl = (async (_url: string, init: { body: string }) => {
  posted.push(JSON.parse(init.body))
  return { ok: true, status: 200 } as never
}) as unknown as typeof fetch

const HOUR = 60 * 60_000
const OWNER = '144022504'

beforeEach(() => {
  posted.length = 0
  resetWatchHeartbeatForTests()
  vi.stubEnv('RENDER_API_KEY', 'a-key-that-is-not-real')
})

describe('a quiet watch saying it is alive', () => {
  it('writes the first one, naming the channel and what it examined', async () => {
    const r = await noteWatchQuietToHive(
      OWNER,
      { channel: 'TON', examined: 2 },
      { fetchImpl, now: 0 }
    )

    expect(r).toBe('noted')
    expect(posted).toHaveLength(1)
    expect(posted[0].kind).toBe('watch-quiet')
    expect(posted[0].severity, 'a quiet watch is not a problem').toBe('normal')
    expect(String(posted[0].what)).toContain('TON')
    expect(String(posted[0].what)).toContain('2')
  })

  it('stays quiet for the rest of the heartbeat', async () => {
    await noteWatchQuietToHive(
      OWNER,
      { channel: 'TON', examined: 0 },
      { fetchImpl, now: 0 }
    )
    const second = await noteWatchQuietToHive(
      OWNER,
      { channel: 'TON', examined: 0 },
      { fetchImpl, now: 3 * HOUR }
    )

    expect(second, 'an hourly watch wrote three lines in three hours').toBe(
      'skipped'
    )
    expect(posted).toHaveLength(1)
  })

  it('speaks again once the heartbeat has passed', async () => {
    await noteWatchQuietToHive(
      OWNER,
      { channel: 'TON', examined: 0 },
      { fetchImpl, now: 0 }
    )
    const later = await noteWatchQuietToHive(
      OWNER,
      { channel: 'TON', examined: 0 },
      { fetchImpl, now: 21 * HOUR }
    )

    expect(later).toBe('noted')
    expect(posted).toHaveLength(2)
  })

  /*
   * THE PART THAT MATTERS MOST. One heartbeat for both channels would let a
   * dead watch hide behind a living one -- the journal would show a line every
   * day while half the money went unwatched.
   */
  it('keeps a heartbeat per channel', async () => {
    await noteWatchQuietToHive(
      OWNER,
      { channel: 'TON', examined: 0 },
      { fetchImpl, now: 0 }
    )
    const other = await noteWatchQuietToHive(
      OWNER,
      { channel: 'Robokassa', examined: 7 },
      { fetchImpl, now: HOUR }
    )

    expect(other, 'one channel silenced the other').toBe('noted')
    expect(posted).toHaveLength(2)
    expect(String(posted[1].what)).toContain('Robokassa')
  })

  /*
   * A heartbeat that cannot reach the journal must not be recorded as sent:
   * the next run would then wait another twenty hours, and the gap that means
   * "the watch died" would start meaning nothing again.
   */
  it('reports a refused write as not noted', async () => {
    const refusing = (async () => ({
      ok: false,
      status: 503,
    })) as unknown as typeof fetch
    const r = await noteWatchQuietToHive(
      OWNER,
      { channel: 'TON', examined: 0 },
      { fetchImpl: refusing, now: 0 }
    )
    expect(r).toBe('not noted')
  })
})
