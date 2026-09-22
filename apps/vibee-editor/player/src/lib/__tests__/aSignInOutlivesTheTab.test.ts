/**
 * A SIGN-IN OUTLIVES THE TAB, AND A BAD MINUTE DOES NOT END IT.
 *
 * Measured 2026-09-22 against production (render session.ts, player
 * appSession.ts): the 60-day refresh token lived in the tab's sessionStorage,
 * so every new tab was signed out -- the owner's "I have to log in every
 * time" -- and any non-OK refresh reply, a 429 from the brake or a 502 during a
 * deploy included, threw the session away.
 *
 * These tests call the module the way the app does and read what it did.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_SESSION_CLEARED,
  TransientSessionError,
  clearAppSession,
  getAppAccessToken,
  hasRenewableAppSession,
  refreshAppSession,
  storeAppSession,
} from '../appSession'

const REFRESH_KEY = 'trinity.app.session.refresh'
const MARKER_KEY = 'trinity.app.session.cookie'

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('a refresh that fails for a reason that is not the session', () => {
  beforeEach(() => {
    storeAppSession({
      access_token: 'still-good', // secret-guard-ok: invented test value
      refresh_token: 'held-token', // secret-guard-ok: invented test value
      expires_in: 600,
    })
  })
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
  })

  for (const [what, status] of [
    ['the brake (429)', 429],
    ['the render during a deploy (503)', 503],
    ["Railway's edge (502)", 502],
    ['an older render that does not read the cookie yet (400)', 400],
  ] as const) {
    it(`keeps the session through ${what}`, async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(reply(status, { error: 'x' }))
      )
      await expect(refreshAppSession()).rejects.toBeInstanceOf(
        TransientSessionError
      )
      expect(getAppAccessToken()).toBe('still-good')
      expect(hasRenewableAppSession()).toBe(true)
    })
  }

  it('keeps the session when the network is not up yet (waking from sleep)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(refreshAppSession()).rejects.toBeInstanceOf(
      TransientSessionError
    )
    expect(getAppAccessToken()).toBe('still-good')
  })
})

describe('a refresh the server refuses for good', () => {
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
  })

  it('ends the session on 401, and says so to the rest of the app', async () => {
    storeAppSession({
      access_token: 'a', // secret-guard-ok: invented test value
      refresh_token: 'spent', // secret-guard-ok: invented test value
      expires_in: 600,
    })
    const heard = vi.fn()
    window.addEventListener(APP_SESSION_CLEARED, heard)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply(401, { error: 'auth_refresh_failed' }))
    )
    await expect(refreshAppSession()).rejects.not.toBeInstanceOf(
      TransientSessionError
    )
    expect(getAppAccessToken()).toBe('')
    expect(hasRenewableAppSession()).toBe(false)
    // The header learns the person is gone, instead of keeping the avatar
    // with neither Login nor Logout.
    expect(heard).toHaveBeenCalledTimes(1)
    window.removeEventListener(APP_SESSION_CLEARED, heard)
  })
})

describe('where the refresh token is kept', () => {
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
  })

  it('keeps nothing in the tab when the server put it in the cookie', () => {
    storeAppSession({
      access_token: 'a', // secret-guard-ok: invented test value
      refresh_transport: 'cookie',
      expires_in: 600,
    })
    expect(window.sessionStorage.getItem(REFRESH_KEY)).toBeNull()
    // Only a hint that the jar may hold a session -- never the token.
    expect(window.localStorage.getItem(MARKER_KEY)).toBe('1')
  })

  it('keeps it in the tab when an older render sent it in the body', () => {
    // The two services deploy independently; whichever lands first, a
    // sign-in must still work.
    storeAppSession({
      access_token: 'a', // secret-guard-ok: invented test value
      refresh_token: 'from-an-older-render', // secret-guard-ok: invented test value
      expires_in: 600,
    })
    expect(window.sessionStorage.getItem(REFRESH_KEY)).toBe(
      'from-an-older-render'
    )
  })

  it('drops a copy left from before the move once the cookie holds it', () => {
    window.sessionStorage.setItem(REFRESH_KEY, 'left-over')
    storeAppSession({
      access_token: 'a', // secret-guard-ok: invented test value
      refresh_transport: 'cookie',
      expires_in: 600,
    })
    expect(window.sessionStorage.getItem(REFRESH_KEY)).toBeNull()
  })

  it('takes the hint away on sign-out, so no tab keeps trying', () => {
    storeAppSession({
      access_token: 'a', // secret-guard-ok: invented test value
      refresh_transport: 'cookie',
      expires_in: 600,
    })
    clearAppSession()
    expect(window.localStorage.getItem(MARKER_KEY)).toBeNull()
  })
})
