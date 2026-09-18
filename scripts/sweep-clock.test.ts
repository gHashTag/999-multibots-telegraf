/**
 * THE VERDICT IS TESTED AGAINST INVENTED JOURNALS, BECAUSE THE STATES THAT
 * MATTER CANNOT BE ARRANGED IN PRODUCTION.
 *
 * "Silent for thirteen hours" and "never swept at all" are exactly the shapes
 * this tool exists to name, and waiting for either to happen is not a test.
 * The fetching stays outside `judge`, so the judgement can be fed a journal.
 *
 * What it must never do is what the previous generation of these tools did:
 * report a clean verdict about something it did not look at. An empty window
 * is "nothing to judge", not "fine".
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

const require_ = createRequire(__filename)
const { judge, HEARTBEAT_MS, ALARM_MS } = require_(
  path.join(__dirname, 'sweep-clock.cjs')
) as {
  judge: (
    events: Array<{ kind: string; at: string }>,
    now: number,
    window?: number
  ) => {
    state: string
    sweeps: Array<{ kind: string; at: number }>
    since: number | null
    longestGap: number | null
  }
  HEARTBEAT_MS: number
  ALARM_MS: number
}

const NOW = Date.parse('2026-09-18T15:00:00.000Z')
const agoMinutes = (m: number) => new Date(NOW - m * 60_000).toISOString()

describe("the seller's clock", () => {
  it('calls it beating while lines keep arriving', () => {
    const r = judge(
      [
        { kind: 'sweep-idle', at: agoMinutes(5) },
        { kind: 'sweep-idle', at: agoMinutes(35) },
        { kind: 'sweep-card', at: agoMinutes(65) },
      ],
      NOW
    )
    expect(r.state).toBe('beating')
    expect(r.since).toBeLessThan(HEARTBEAT_MS)
    expect(r.longestGap).toBe(30 * 60_000)
  })

  /*
   * THE 39-MINUTE SCARE, 2026-09-18. A tick is due every thirty minutes, so a
   * gap looks like a miss -- but a holding seller is allowed six hours of
   * silence by design, and reading that gap as a fault cost a detour.
   */
  it('does not call a gap shorter than the heartbeat a fault', () => {
    const r = judge([{ kind: 'sweep-held', at: agoMinutes(39) }], NOW)
    expect(r.state).toBe('beating')
  })

  it('says quiet once the heartbeat has passed without a line', () => {
    const r = judge([{ kind: 'sweep-held', at: agoMinutes(7 * 60) }], NOW)
    expect(r.state).toBe('quiet')
    expect(r.since).toBeGreaterThan(HEARTBEAT_MS)
    expect(r.since).toBeLessThan(ALARM_MS)
  })

  /*
   * TWO MISSED HEARTBEATS. There is no legitimate state that says nothing for
   * half a day -- this is the same threshold the render's own watchdog uses.
   */
  it('raises the alarm past two missed heartbeats', () => {
    const r = judge([{ kind: 'sweep-idle', at: agoMinutes(13 * 60) }], NOW)
    expect(r.state).toBe('alarm')
  })

  /*
   * AN EMPTY WINDOW IS NOT HEALTH. This is the failure the whole family of
   * these tools keeps having: a green verdict about nothing looked at.
   */
  it('refuses to judge a window with no sweep line in it', () => {
    const r = judge([{ kind: 'sign-in', at: agoMinutes(5) }], NOW)
    expect(r.state).toBe('never swept')
    expect(r.since).toBeNull()
  })

  /*
   * The picture is drawn for a window, so the numbers under it must be about
   * that window. Measuring the gap over the whole fetch printed "longest gap
   * 12.0 h" beneath eight hours of drawing.
   */
  it('measures the gap inside the window it was given', () => {
    const events = [
      { kind: 'sweep-idle', at: agoMinutes(30) },
      { kind: 'sweep-idle', at: agoMinutes(120) },
      // Older than the window below, and a twelve-hour gap away.
      { kind: 'sweep-idle', at: agoMinutes(12 * 60) },
    ]
    const wide = judge(events, NOW)
    const narrow = judge(events, NOW, 4 * 3_600_000)

    expect(wide.longestGap).toBe(10 * 3_600_000)
    expect(narrow.longestGap).toBe(90 * 60_000)
    expect(narrow.sweeps.length).toBe(2)
  })

  /*
   * Kinds that are not the sweep must not prop the clock up: a busy journal
   * full of sign-ins would otherwise hide a seller that stopped.
   */
  it('ignores everything that is not a sweep line', () => {
    const r = judge(
      [
        { kind: 'sign-in', at: agoMinutes(1) },
        { kind: 'published', at: agoMinutes(2) },
        { kind: 'sweep-idle', at: agoMinutes(13 * 60) },
      ],
      NOW
    )
    expect(r.state).toBe('alarm')
  })
})
