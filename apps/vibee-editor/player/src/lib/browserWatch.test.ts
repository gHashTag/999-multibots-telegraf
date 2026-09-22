import { describe, it, expect } from 'vitest'
import {
  shouldFollow,
  shouldPoll,
  wentOut,
  wheelAfterTouch,
  wheelAfterHandBack,
  BROWSER_ROUTE,
  WATCH_INTERVAL_MS,
} from './browserWatch'

const base = {
  state: 'live' as const,
  sessionId: 's1',
  currentPath: '/feed',
  followedSessionId: null,
}

/**
 * The tab exists so an agent's work can be watched. These rules decide when
 * the screen moves on its own -- and a screen that moves when it should not
 * is worse than one that never moves at all.
 */

describe('following an agent to the browser', () => {
  it('jumps when a session goes live while the person is elsewhere', () => {
    expect(shouldFollow(base)).toBe(true)
  })

  it('does nothing when there is no browser running', () => {
    for (const state of [
      'none',
      'starting',
      'unavailable',
      'signin',
    ] as const) {
      expect(shouldFollow({ ...base, state })).toBe(false)
    }
  })

  it('does not interrupt somebody already watching', () => {
    expect(shouldFollow({ ...base, currentPath: BROWSER_ROUTE })).toBe(false)
    expect(shouldFollow({ ...base, currentPath: '/browser/anything' })).toBe(
      false
    )
  })

  it('FOLLOWS A SESSION ONCE, then leaves the person alone', () => {
    /*
     * Without this the app would drag them back to the browser every ten
     * seconds for as long as the pod lives.
     */
    expect(shouldFollow({ ...base, followedSessionId: 's1' })).toBe(false)
  })

  it('treats a new session as a new thing worth seeing', () => {
    expect(
      shouldFollow({ ...base, sessionId: 's2', followedSessionId: 's1' })
    ).toBe(true)
  })

  it('will not jump to a session it cannot name', () => {
    expect(shouldFollow({ ...base, sessionId: undefined })).toBe(false)
  })
})

describe('when to ask at all', () => {
  it('stops while the app is in the background', () => {
    expect(
      shouldPoll({
        hidden: true,
        embedded: false,
        unavailable: false,
        signedOut: false,
      })
    ).toBe(false)
    expect(
      shouldPoll({
        hidden: false,
        embedded: false,
        unavailable: false,
        signedOut: false,
      })
    ).toBe(true)
  })

  it('NEVER asks from inside the game frame', () => {
    /*
     * There the app holds no session at all, so every request answers 401 --
     * once every ten seconds, for every guest who opens the game. Caught by
     * embed-guest-panel.test.tsx, not by me.
     */
    expect(
      shouldPoll({
        hidden: false,
        embedded: true,
        unavailable: false,
        signedOut: false,
      })
    ).toBe(false)
    expect(
      shouldPoll({
        hidden: true,
        embedded: true,
        unavailable: false,
        signedOut: false,
      })
    ).toBe(false)
  })

  it('STOPS ENTIRELY where pods cannot run', () => {
    /*
     * Railway answers 503 by design. Without this the app would send one
     * request per person every ten seconds, forever, for a feature that
     * cannot work there.
     */
    expect(
      shouldPoll({
        hidden: false,
        embedded: false,
        unavailable: true,
        signedOut: false,
      })
    ).toBe(false)
  })

  it('STOPS when nobody is signed in', () => {
    /* A signed-out app would otherwise ask every ten seconds forever. */
    expect(
      shouldPoll({
        hidden: false,
        embedded: false,
        unavailable: false,
        signedOut: true,
      })
    ).toBe(false)
  })

  it('asks slowly enough to be invisible', () => {
    expect(WATCH_INTERVAL_MS).toBeGreaterThanOrEqual(5000)
  })
})

describe('when the browser is suddenly gone', () => {
  it('explains it only to somebody who HAD one', () => {
    /*
     * Idle pods stop after ten minutes. Without a word, a person coming back
     * reads the empty screen as "it logged me out" -- and they are wrong.
     */
    expect(wentOut('live', 'none')).toBe(true)
    expect(wentOut(null, 'none')).toBe(false)
    expect(wentOut('none', 'none')).toBe(false)
  })

  it('says nothing while it is still there', () => {
    expect(wentOut('live', 'live')).toBe(false)
    expect(wentOut('live', 'starting')).toBe(false)
  })
})

describe('who is driving', () => {
  it('a touch takes the wheel', () => {
    expect(wheelAfterTouch()).toBe('person')
  })

  it('handing it back is a deliberate press, not a timeout', () => {
    /* A browser that silently returns to an agent mid-sentence is one
     * nobody trusts. */
    expect(wheelAfterHandBack()).toBe('agent')
    expect(wheelAfterTouch()).not.toBe(wheelAfterHandBack())
  })
})

/*
 * The server holds the wheel too: every touch would otherwise post, so the
 * lease is renewed at most every WHEEL_RENEW_MS.
 */
describe('shouldRenewWheel', () => {
  it('the first touch sends, the next ones only after the renew interval', async () => {
    const { shouldRenewWheel, WHEEL_RENEW_MS } = await import('./browserWatch')
    expect(shouldRenewWheel(null, 1000)).toBe(true)
    expect(shouldRenewWheel(1000, 1000 + WHEEL_RENEW_MS - 1)).toBe(false)
    expect(shouldRenewWheel(1000, 1000 + WHEEL_RENEW_MS)).toBe(true)
    expect(WHEEL_RENEW_MS).toBeLessThan(10 * 60 * 1000)
  })
})
