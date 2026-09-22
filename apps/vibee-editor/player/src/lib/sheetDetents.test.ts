import { describe, it, expect } from 'vitest'
import { detentHeights, settle, nextDetent, PEEK_PX } from './sheetDetents'

const h = detentHeights(800) // peek 96, half 400, full 744

describe('where a dragged sheet comes to rest', () => {
  it('has three detents that fit the screen', () => {
    expect(h).toEqual({ peek: PEEK_PX, half: 400, full: 744 })
  })

  it('a slow release goes to the nearest detent', () => {
    expect(settle(120, 0, h)).toBe('peek')
    expect(settle(350, 0.1, h)).toBe('half')
    expect(settle(700, -0.1, h)).toBe('full')
  })

  it('a flick goes to the next detent in its direction', () => {
    expect(settle(130, 0.9, h)).toBe('half') // up from just above peek
    expect(settle(420, 0.9, h)).toBe('full') // up from just above half
    expect(settle(700, -0.9, h)).toBe('half') // down from near full
    expect(settle(380, -0.9, h)).toBe('peek') // down from just under half
  })

  it('a flick past the ends stays at the ends', () => {
    expect(settle(744, 2, h)).toBe('full')
    expect(settle(96, -2, h)).toBe('peek')
  })

  it('a tap on the grabber cycles', () => {
    expect([
      nextDetent('peek'),
      nextDetent('half'),
      nextDetent('full'),
    ]).toEqual(['half', 'full', 'peek'])
  })
})
