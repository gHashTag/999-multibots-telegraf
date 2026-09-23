import { describe, it, expect } from 'vitest'
import { tileBounds, sideBySide, MAX_WINDOWS } from './windows'

const SCREEN = { width: 1496, height: 880 }

describe('where each desk s window sits', () => {
  it('two desks split the screen, and nothing is left bare', () => {
    const a = tileBounds(SCREEN, 0, 2)
    const b = tileBounds(SCREEN, 1, 2)
    expect(a).toEqual({ left: 0, top: 0, width: 748, height: 880 })
    expect(b.left).toBe(748)
    expect(a.width + b.width).toBe(SCREEN.width)
    expect(b.height).toBe(SCREEN.height)
  })

  it('an odd screen gives the remainder to the last column', () => {
    const w = [0, 1, 2].map(i => tileBounds({ width: 1000, height: 600 }, i, 3))
    expect(w.map(b => b.width).reduce((x, y) => x + y)).toBe(1000)
    expect(w[0].left).toBe(0)
    expect(w[2].left).toBe(666)
  })

  it('never more columns than windows are allowed, and never fewer than one', () => {
    /* Asked for 99 columns, it gives three; asked for the 9th, the last. */
    const far = tileBounds(SCREEN, 9, 99)
    expect(far.left).toBe(2 * Math.floor(SCREEN.width / MAX_WINDOWS))
    expect(far.left + far.width).toBe(SCREEN.width)
    expect(tileBounds(SCREEN, 0, 0)).toEqual({
      left: 0,
      top: 0,
      width: SCREEN.width,
      height: SCREEN.height,
    })
  })

  it('a window is never a sliver', () => {
    expect(tileBounds({ width: 300, height: 400 }, 0, 3).width).toBe(320)
  })
})

describe('desks working side by side', () => {
  it('runs at most the limit at once, and keeps the order of the answers', async () => {
    let now = 0
    let most = 0
    const work = async (n: number) => {
      now += 1
      most = Math.max(most, now)
      await new Promise(r => setTimeout(r, 5))
      now -= 1
      return n * 2
    }
    const out = await sideBySide([1, 2, 3, 4, 5], 2, work)
    expect(out).toEqual([2, 4, 6, 8, 10])
    expect(most).toBe(2)
  })

  it('one at a time when asked, and never more than the cap', async () => {
    let now = 0
    let most = 0
    const work = async () => {
      now += 1
      most = Math.max(most, now)
      await new Promise(r => setTimeout(r, 3))
      now -= 1
      return null
    }
    await sideBySide([1, 2, 3], 1, work)
    expect(most).toBe(1)
    most = 0
    await sideBySide([1, 2, 3, 4, 5, 6], 99, work)
    expect(most).toBe(MAX_WINDOWS)
  })

  it('an empty list runs nothing and answers nothing', async () => {
    expect(await sideBySide([], 3, async () => 1)).toEqual([])
  })
})
