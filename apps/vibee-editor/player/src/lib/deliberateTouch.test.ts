import { describe, it, expect } from 'vitest'
import { isDeliberate, CLICK_SLOP_PX, CLICK_HOLD_MS } from './deliberateTouch'

const at = (x: number, y: number, t: number) => ({ x, y, at: t })

describe('a deliberate touch is a click, not a passing mouse', () => {
  it('pressed and released in the same place, quickly', () => {
    expect(isDeliberate(at(100, 100, 0), at(102, 101, 120))).toBe(true)
    expect(isDeliberate(at(100, 100, 0), at(100, 100, CLICK_HOLD_MS))).toBe(
      true
    )
  })

  it('a drag is somebody selecting or scrolling, not taking the wheel', () => {
    expect(
      isDeliberate(at(100, 100, 0), at(100 + CLICK_SLOP_PX + 1, 100, 100))
    ).toBe(false)
  })

  it('a long press is not a click either', () => {
    expect(isDeliberate(at(100, 100, 0), at(100, 100, CLICK_HOLD_MS + 1))).toBe(
      false
    )
  })

  it('a release with no press before it changes nothing', () => {
    expect(isDeliberate(null, at(100, 100, 10))).toBe(false)
  })
})
