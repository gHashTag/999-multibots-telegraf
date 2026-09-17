import { describe, expect, it } from 'vitest'
import { appBox, shouldRequestFullscreen } from './telegramFullscreen'

/**
 * THE WHOLE SCREEN, AND THE ROOM IT COSTS AT THE TOP.
 *
 * The owner, 2026-09-17: the Mini App opened as a sheet with Telegram's white
 * header over a black interface. Fullscreen fixes that and moves the danger:
 * the WebView then runs under the status bar and under Telegram's own Close
 * and menu buttons. What is pinned here is who gets fullscreen, and that the
 * app's box is measured from Telegram's numbers -- both of them.
 */

const client = (over: Record<string, unknown> = {}) =>
  ({
    platform: 'ios',
    isFullscreen: false,
    isVersionAtLeast: (v: string) => Number(v) <= 8,
    requestFullscreen: () => {},
    ...over,
  }) as any

describe('who is asked for the whole screen', () => {
  it('phones on a client that knows the call', () => {
    expect(shouldRequestFullscreen(client({ platform: 'ios' }))).toBe(true)
    expect(shouldRequestFullscreen(client({ platform: 'android' }))).toBe(true)
  })

  it('not a computer: there the same call takes over the whole WINDOW', () => {
    for (const platform of ['tdesktop', 'macos', 'weba', 'webk', 'unknown']) {
      expect(shouldRequestFullscreen(client({ platform }))).toBe(false)
    }
  })

  it('not a client older than Bot API 8.0, whatever it claims to have', () => {
    const old = client({ isVersionAtLeast: (v: string) => Number(v) <= 7.7 })
    expect(shouldRequestFullscreen(old)).toBe(false)
    // The method check is separate: a client can pass the version gate and
    // still lack the function, and calling undefined would break the launch.
    expect(
      shouldRequestFullscreen(client({ requestFullscreen: undefined }))
    ).toBe(false)
  })

  it('not twice: a client already there answers ALREADY_FULLSCREEN', () => {
    expect(shouldRequestFullscreen(client({ isFullscreen: true }))).toBe(false)
  })

  it('a client whose version check throws is simply left as a sheet', () => {
    const broken = client({
      isVersionAtLeast: () => {
        throw new Error('not a function in this build')
      },
    })
    expect(shouldRequestFullscreen(broken)).toBe(false)
    expect(shouldRequestFullscreen(null)).toBe(false)
  })
})

describe('the box the app may draw in', () => {
  const phone = {
    viewportHeight: 852,
    viewportStableHeight: 852,
    safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 46, bottom: 0, left: 0, right: 0 },
  }

  it('in fullscreen it starts below BOTH insets and is that much shorter', () => {
    /*
     * The device inset alone clears the clock and leaves the page under
     * Telegram's Close button; the content inset alone does the opposite.
     * The room is their sum, and the heights lose exactly that sum -- with
     * different live and stable heights, so neither is mistaken for the other.
     */
    const box = appBox({ ...phone, viewportHeight: 516, isFullscreen: true })
    expect(box).toEqual({
      fullscreen: true,
      topInset: 105,
      vh: 411,
      vhStable: 747,
    })
  })

  it('as a sheet nothing is taken off: Telegram has already inset the view', () => {
    // Bot API 8.0 clients report the insets outside fullscreen too. Using them
    // there leaves an empty band under Telegram's header.
    expect(appBox({ ...phone, isFullscreen: false })).toEqual({
      fullscreen: false,
      topInset: 0,
      vh: 852,
      vhStable: 852,
    })
    expect(appBox({ ...phone, isFullscreen: undefined }).topInset).toBe(0)
  })

  it('a missing height stays missing, so the CSS default survives', () => {
    // 'undefinedpx' and 'NaNpx' silently invalidate every calc() built on the
    // variable; the stylesheet's 100dvh must stay in force instead.
    const box = appBox({
      isFullscreen: true,
      safeAreaInset: phone.safeAreaInset,
      contentSafeAreaInset: phone.contentSafeAreaInset,
      viewportHeight: undefined as unknown as number,
      viewportStableHeight: Number.NaN,
    })
    expect(box).toEqual({ fullscreen: true, topInset: 105 })
  })

  it('insets that are absent, negative or not numbers count as zero', () => {
    const box = appBox({
      isFullscreen: true,
      viewportHeight: 800,
      viewportStableHeight: 800,
      safeAreaInset: { top: -5, bottom: 0, left: 0, right: 0 },
      contentSafeAreaInset: undefined,
    })
    expect(box.topInset).toBe(0)
    expect(box.vhStable).toBe(800)
  })

  it('a box is never taller than the screen or shorter than nothing', () => {
    const box = appBox({ ...phone, isFullscreen: true, viewportHeight: 60 })
    expect(box.vh).toBe(0)
  })
})
