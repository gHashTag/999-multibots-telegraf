import { describe, expect, it } from 'vitest'
import { isPainted, paintStepMs, waitForPaint } from './paint-wait'

const noSleep = async () => {}
const seq = (...xs: unknown[]) => {
  let i = 0
  return async () => {
    const x = xs[Math.min(i++, xs.length - 1)]
    if (x instanceof Error) throw x
    return x
  }
}

describe('waitForPaint: a blank frame is not the page', () => {
  it('waits through loading and an empty body until something is visible', async () => {
    const v = await waitForPaint(
      seq(
        { readyState: 'loading', visible: false },
        { readyState: 'complete', visible: false },
        { readyState: 'complete', visible: true }
      ),
      { sleep: noSleep }
    )
    expect(v).toEqual({ painted: true, readyState: 'complete', attempts: 3 })
  })

  it('gives up after the bound and says not painted', async () => {
    let calls = 0
    const v = await waitForPaint(
      async () => {
        calls++
        return { readyState: 'complete', visible: false }
      },
      { attempts: 4, sleep: noSleep }
    )
    expect(v.painted).toBe(false)
    expect(calls).toBe(4)
  })

  it('a probe that throws or returns junk is "not yet", never "painted"', async () => {
    const v = await waitForPaint(seq(new Error('x'), null, 'junk'), {
      attempts: 3,
      sleep: noSleep,
    })
    expect(v.painted).toBe(false)
  })

  it('loaded but empty, and visible but still loading, are both unpainted', () => {
    expect(isPainted({ readyState: 'complete', visible: false })).toBe(false)
    expect(isPainted({ readyState: 'interactive', visible: true })).toBe(false)
    expect(isPainted({ readyState: 'complete', visible: true })).toBe(true)
    expect(isPainted(null)).toBe(false)
  })
})

describe('paintStepMs: a front-loaded gap, small early then capped', () => {
  it('starts small, grows, and never passes the cap', () => {
    expect(paintStepMs(1)).toBe(100)
    expect(paintStepMs(2)).toBe(170)
    expect(paintStepMs(3)).toBe(289)
    // 100 * 1.7^3 = 491.3 -> capped at 400, and flat from here on.
    expect(paintStepMs(4)).toBe(400)
    expect(paintStepMs(5)).toBe(400)
    expect(paintStepMs(99)).toBe(400)
  })

  it('never returns less than one millisecond', () => {
    expect(paintStepMs(1, 0)).toBe(1)
  })

  it('the total give-up wait is below the old flat 8x400 ceiling', () => {
    // Seven gaps before the eighth-and-final probe.
    const total = [1, 2, 3, 4, 5, 6, 7].reduce((s, i) => s + paintStepMs(i), 0)
    expect(total).toBeLessThan(7 * 400)
  })
})

describe('waitForPaint: the default wait is the front-loaded schedule', () => {
  it('sleeps the growing gaps between probes when no stepMs is given', async () => {
    const slept: number[] = []
    const v = await waitForPaint(
      async () => ({ readyState: 'complete', visible: false }),
      { attempts: 4, sleep: async ms => void slept.push(ms) }
    )
    expect(v.painted).toBe(false)
    expect(slept).toEqual([100, 170, 289])
  })

  it('a flat stepMs still overrides the schedule for callers that pass one', async () => {
    const slept: number[] = []
    await waitForPaint(
      async () => ({ readyState: 'complete', visible: false }),
      {
        attempts: 3,
        stepMs: 250,
        sleep: async ms => void slept.push(ms),
      }
    )
    expect(slept).toEqual([250, 250])
  })
})
