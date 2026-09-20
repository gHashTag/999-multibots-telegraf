import { describe, it, expect } from 'vitest'
import {
  askFor,
  worthRefitting,
  isPhoneWidth,
  REFIT_DEBOUNCE_MS,
  PHONE_MAX,
} from './browserFit'

/**
 * THE DESKTOP FOLLOWS THE DEVICE.
 *
 * The bug is in a photograph the owner sent: a phone held upright, and on it
 * a landscape desktop drawn as a stamp in a field of black.
 */

describe('what we ask the pod to become', () => {
  it('DOES NOT MULTIPLY BY THE DEVICE PIXEL RATIO', () => {
    /*
     * A phone at ratio 3 would ask for a 1170-wide desktop: a desktop-sized
     * layout rendered at phone width, then shown on a phone. That is the
     * original complaint in a more expensive form. Page layout is measured
     * in CSS pixels, so CSS pixels are what is asked for.
     */
    expect(askFor({ width: 390, height: 780 })).toEqual({
      width: 390,
      height: 780,
    })
  })

  it('hands on whole pixels', () => {
    expect(askFor({ width: 390.4, height: 779.6 })).toEqual({
      width: 390,
      height: 780,
    })
  })

  it('never asks for a rectangle with no area', () => {
    const a = askFor({ width: 0, height: 0 })
    expect(a.width * a.height).toBeGreaterThan(0)
  })
})

describe('when it is worth asking at all', () => {
  it('always asks the first time', () => {
    expect(worthRefitting(null, { width: 390, height: 780 })).toBe(true)
  })

  it('IGNORES THE ADDRESS BAR SLIDING AWAY', () => {
    /*
     * A phone reports a new height on every scroll. Asking the pod to resize
     * for that would restart the stream over and over -- worse than a few
     * pixels of letterbox, and the reason this threshold exists at all.
     */
    expect(
      worthRefitting({ width: 390, height: 780 }, { width: 390, height: 744 })
    ).toBe(false)
  })

  it('notices the phone being turned, however small the change', () => {
    /* 500x498 to 498x500 is four pixels and a different world. */
    expect(
      worthRefitting({ width: 500, height: 498 }, { width: 498, height: 500 })
    ).toBe(true)
  })

  it('notices a real resize', () => {
    expect(
      worthRefitting({ width: 1440, height: 810 }, { width: 700, height: 810 })
    ).toBe(true)
  })

  it('does not fire on a one-pixel twitch', () => {
    expect(
      worthRefitting({ width: 1440, height: 810 }, { width: 1441, height: 810 })
    ).toBe(false)
  })
})

describe('the two layouts', () => {
  it('calls a phone a phone and a laptop not one', () => {
    expect(isPhoneWidth(390)).toBe(true)
    expect(isPhoneWidth(430)).toBe(true)
    expect(isPhoneWidth(1440)).toBe(false)
  })

  it('draws the line where the stylesheet draws it', () => {
    /*
     * An absolute bound, not `expect(PHONE_MAX).toBe(PHONE_MAX)`: a test that
     * reads the constant it is checking grows with it and catches nothing.
     * The stylesheet's media query says 700px; if one moves, this fails.
     */
    expect(PHONE_MAX).toBe(700)
    expect(isPhoneWidth(701)).toBe(false)
  })

  it('waits long enough for a rotation to finish', () => {
    expect(REFIT_DEBOUNCE_MS).toBeGreaterThanOrEqual(300)
    expect(REFIT_DEBOUNCE_MS).toBeLessThanOrEqual(1000)
  })
})
