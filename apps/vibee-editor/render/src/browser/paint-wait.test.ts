import { describe, expect, it } from 'vitest'
import { isPainted, waitForPaint } from './paint-wait'

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
