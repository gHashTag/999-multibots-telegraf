import { describe, it, expect } from 'vitest'
import { BROWSER_BUTTONS, tapWipe } from './remoteBrowserUi'
import { closeBrowserSession, forgetBrowserProfile } from './remoteBrowser'

/**
 * Both properties below survived a source-grep test of the screen. They are
 * the difference between "I closed my browser" and "all my accounts are
 * signed out forever".
 */

describe('the two buttons are two different doors', () => {
  it('close closes, and does not wipe', () => {
    expect(BROWSER_BUTTONS.close).toBe(closeBrowserSession)
    expect(BROWSER_BUTTONS.close).not.toBe(forgetBrowserProfile)
  })

  it('forget forgets', () => {
    expect(BROWSER_BUTTONS.forget).toBe(forgetBrowserProfile)
  })
})

describe('the wipe takes two taps', () => {
  it('THE FIRST TAP NEVER WIPES', () => {
    expect(tapWipe(false)).toEqual({ confirming: true, wipeNow: false })
  })

  it('the second tap wipes and drops back to idle', () => {
    expect(tapWipe(true)).toEqual({ confirming: false, wipeNow: true })
  })

  it('never wipes twice from one confirmation', () => {
    const first = tapWipe(false)
    const second = tapWipe(first.confirming)
    const third = tapWipe(second.confirming)
    expect([first.wipeNow, second.wipeNow, third.wipeNow]).toEqual([
      false,
      true,
      false,
    ])
  })
})
