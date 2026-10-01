import { describe, expect, it } from 'vitest'
import { bandAt, easeHue, mixHue } from './orbMath'

describe('easeHue', () => {
  it('goes the short way round the wheel', () => {
    // 350 -> 10 is 20 degrees forward through 0, not 340 back.
    expect(easeHue(350, 10, 0.5)).toBeCloseTo(0)
    expect(easeHue(10, 350, 0.5)).toBeCloseTo(0)
    expect(easeHue(100, 200, 0.5)).toBeCloseTo(150)
  })

  it('arrives at the target and stays on the wheel', () => {
    expect(easeHue(40, 300, 1)).toBeCloseTo(300)
    const h = easeHue(5, 355, 0.9)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(360)
  })

  it('mixHue is the same blend', () => {
    expect(mixHue(188, 226, 0)).toBeCloseTo(188)
    expect(mixHue(188, 226, 1)).toBeCloseTo(226)
  })
})

describe('bandAt', () => {
  const bands = [1, 0.5, 0]

  it('bass at the top, treble at the bottom, mirrored', () => {
    expect(bandAt(bands, 0)).toBeCloseTo(1)
    expect(bandAt(bands, Math.PI)).toBeCloseTo(0)
    expect(bandAt(bands, Math.PI / 2)).toBeCloseTo(bandAt(bands, -Math.PI / 2))
  })

  it('interpolates between bands instead of stepping', () => {
    expect(bandAt(bands, Math.PI / 4)).toBeCloseTo(0.75)
  })

  it('takes any angle, including negative and past a full turn', () => {
    expect(bandAt(bands, Math.PI * 2)).toBeCloseTo(1)
    expect(bandAt(bands, -Math.PI)).toBeCloseTo(0)
  })
})
