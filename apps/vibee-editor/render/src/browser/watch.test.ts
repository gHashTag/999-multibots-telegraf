/**
 * The rule that answers "since when". Every case here is a SEQUENCE -- broke,
 * stayed broken, restarted, came back -- which is exactly why the rule is pure.
 */
import { describe, it, expect } from 'vitest'
import {
  describeWatch,
  minutesBetween,
  nextWatch,
  FIRST_WATCH,
  type WatchState,
} from './watch'

const T0 = 1_800_000_000_000
const min = (n: number) => n * 60 * 1000

const probe = (ok: boolean, bootId: string, at: number) => ({ ok, bootId, at })

describe('nextWatch', () => {
  it('starts the clock on the first probe', () => {
    const s = nextWatch(null, probe(true, 'boot-1', T0))
    expect(s.ok).toBe(true)
    expect(s.since).toBe(T0)
    expect(s.lastOkAt).toBe(T0)
    expect(s.fails).toBe(0)
  })

  it('KEEPS THE MOMENT IT BROKE, not the moment it was last looked at', () => {
    /*
     * This is the whole point. The pod was unreadable for three days and every
     * probe printed a fresh line, so nothing could say when it started.
     */
    let s: WatchState = nextWatch(null, probe(true, 'boot-1', T0))
    s = nextWatch(s, probe(false, '', T0 + min(5)))
    s = nextWatch(s, probe(false, '', T0 + min(10)))
    s = nextWatch(s, probe(false, '', T0 + min(15)))
    expect(s.since).toBe(T0 + min(5))
    expect(s.fails).toBe(3)
    expect(s.lastOkAt).toBe(T0)
    expect(describeWatch(s, T0 + min(15))).toContain('NOT answering for 10m')
  })

  it('restarts the clock when it comes back', () => {
    let s: WatchState = nextWatch(null, probe(false, '', T0))
    s = nextWatch(s, probe(true, 'boot-2', T0 + min(5)))
    expect(s.since).toBe(T0 + min(5))
    expect(s.fails).toBe(0)
    expect(describeWatch(s, T0 + min(11))).toBe('answering for 6m')
  })

  it('counts a boot only when both identities were readable', () => {
    /*
     * An unreadable pod reports ''. Counting that as a change would score two
     * boots for every outage -- one into the dark and one back out of it.
     */
    let s: WatchState = nextWatch(null, probe(true, 'boot-1', T0))
    s = nextWatch(s, probe(false, '', T0 + min(5)))
    expect(s.boots).toBe(0)
    s = nextWatch(s, probe(true, 'boot-1', T0 + min(10)))
    expect(s.boots).toBe(0)
    s = nextWatch(s, probe(true, 'boot-2', T0 + min(15)))
    expect(s.boots).toBe(1)
  })

  it('remembers the last identity it could read', () => {
    let s: WatchState = nextWatch(null, probe(true, 'boot-1', T0))
    s = nextWatch(s, probe(false, '', T0 + min(5)))
    expect(s.bootId).toBe('boot-1')
  })
})

describe('describeWatch', () => {
  it('says plainly that nobody has looked yet', () => {
    expect(describeWatch(null, T0)).toBe('never probed')
    expect(describeWatch(FIRST_WATCH, T0)).toBe('never probed')
  })

  it('does not pretend a browser answered once when it never did', () => {
    const s = nextWatch(null, probe(false, '', T0))
    expect(describeWatch(s, T0)).toContain('never answered once')
  })
})

/*
 * A WATCHER NOBODY CALLS IS THE BUG IT WAS WRITTEN AGAINST. The rule above is
 * pure and green whether or not anything ever runs it, and "the state existed
 * only in the moment" is exactly what a well-tested unused module reproduces.
 * So the wiring is asserted as text, the way the frames socket is.
 */
describe('the wiring, read as text', () => {
  it('IS ON A CLOCK IN THE SERVER, not merely importable', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '..', '..', 'render-server.ts'),
      'utf8'
    )
    expect(src).toContain("import('./src/browser/watch')")
    expect(src).toMatch(/runWatch\(/)
    /* Slower than ~45 minutes never fires here: Railway swaps the process. */
    const every = src.match(/runWatch[\s\S]{0,400}?\},\s*(\d+)\s*\*\s*60_000\)/)
    expect(every).not.toBeNull()
    expect(Number(every?.[1])).toBeLessThanOrEqual(15)
  })

  it('is readable from outside, so the answer is one request', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, 'routes.ts'), 'utf8')
    expect(src).toContain("'/api/browser/watch'")
    expect(src).toContain("import('./watch')")
  })
})

describe('minutesBetween', () => {
  it('floors, and reads a clock that went backwards as zero', () => {
    expect(minutesBetween(T0, T0 + min(3) + 59_000)).toBe(3)
    expect(minutesBetween(T0, T0 - min(5))).toBe(0)
    expect(minutesBetween(0, T0)).toBe(0)
  })
})
