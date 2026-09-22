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
  APP_SESSION_PERSON,
  TransientSessionError,
  clearAppSession,
  exchangeTelegramLaunch,
  getAppAccessToken,
  hasRenewableAppSession,
  refreshAppSession,
  storeAppSession,
} from '../appSession'
import { API_BASE } from '../../config'

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

/*
 * What an adversarial review broke in the first version, pinned down so it
 * cannot come back quietly.
 */
describe('the person never outruns the token', () => {
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
  })

  it('arrives with a renewed session, in the store the app renders', async () => {
    const { userAtom } = await import('../../atoms/user')
    const { editorStore } = await import('../../atoms/Provider')
    editorStore.set(userAtom, null)
    storeAppSession({
      access_token: 'a', // secret-guard-ok: invented test value
      refresh_token: 'r', // secret-guard-ok: invented test value
      expires_in: 600,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply(200, {
          access_token: 'renewed', // secret-guard-ok: invented test value
          refresh_transport: 'cookie',
          expires_in: 600,
          telegram_user: { id: 42, first_name: 'Owner', auth_date: 1 },
        })
      )
    )
    await refreshAppSession()
    // The token is stored before the person appears, so Header's guest sweep
    // never sees a person without one.
    expect(getAppAccessToken()).toBe('renewed')
    expect(editorStore.get(userAtom)).toMatchObject({ id: 42, is_admin: false })
  })

  it('keeps the same person as they are, admin mark included', async () => {
    const { userAtom } = await import('../../atoms/user')
    const { editorStore } = await import('../../atoms/Provider')
    editorStore.set(userAtom, {
      id: 7,
      first_name: 'Here',
      auth_date: 1,
      is_admin: true,
    })
    window.dispatchEvent(
      new CustomEvent(APP_SESSION_PERSON, {
        detail: { id: 7, first_name: 'Here', auth_date: 2 },
      })
    )
    expect(editorStore.get(userAtom)).toMatchObject({ id: 7, is_admin: true })
  })

  it('shows whoever the token now acts as, when that is someone else', async () => {
    // The browser keeps one cookie; another tab signing in as another account
    // moves this tab's requests to that account. The header must follow, or
    // it names one person while every request acts as another.
    const { userAtom } = await import('../../atoms/user')
    const { editorStore } = await import('../../atoms/Provider')
    editorStore.set(userAtom, { id: 7, first_name: 'Here', auth_date: 1 })
    window.dispatchEvent(
      new CustomEvent(APP_SESSION_PERSON, {
        detail: { id: 42, first_name: 'Other', auth_date: 1 },
      })
    )
    expect(editorStore.get(userAtom)).toMatchObject({
      id: 42,
      is_admin: false,
    })
  })

  it('leaves with the session, in the store the app renders', async () => {
    const { userAtom } = await import('../../atoms/user')
    const { editorStore } = await import('../../atoms/Provider')
    editorStore.set(userAtom, { id: 7, first_name: 'Here', auth_date: 1 })
    clearAppSession()
    expect(editorStore.get(userAtom)).toBeNull()
  })
})

describe('the launch door never touches the cookie', () => {
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
  })

  it('calls the API host with no transport header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        access_token: 'a', // secret-guard-ok: invented test value
        refresh_token: 'r', // secret-guard-ok: invented test value
        expires_in: 600,
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    await exchangeTelegramLaunch('query_id=x&user=%7B%7D&hash=y')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    // initData can arrive in any browser from a link (#tgWebAppData), so this
    // door must never write a persistent, browser-wide credential.
    expect(url).toBe(`${API_BASE}/api/auth/telegram`)
    const headers = new Headers(init.headers)
    expect(headers.get('X-Session-Transport')).toBeNull()
    expect(init.credentials).not.toBe('include')
  })
})

describe('the brake is not spent during a backoff', () => {
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
  })

  it('refuses without calling the server while backing off', async () => {
    storeAppSession({
      access_token: 'a', // secret-guard-ok: invented test value
      refresh_token: 'r', // secret-guard-ok: invented test value
      expires_in: 600,
    })
    const fetchMock = vi.fn().mockResolvedValue(reply(429, { error: 'x' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(refreshAppSession()).rejects.toBeInstanceOf(
      TransientSessionError
    )
    await expect(refreshAppSession()).rejects.toBeInstanceOf(
      TransientSessionError
    )
    // Every path to the server goes through the one gate: the second call
    // never reached the brake, ten attempts a minute shared with sign-in.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not carry one session's backoff into the next sign-in", async () => {
    storeAppSession({
      access_token: 'a', // secret-guard-ok: invented test value
      refresh_token: 'r', // secret-guard-ok: invented test value
      expires_in: 600,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(503, {})))
    await expect(refreshAppSession()).rejects.toBeInstanceOf(
      TransientSessionError
    )
    clearAppSession()
    storeAppSession({
      access_token: 'b', // secret-guard-ok: invented test value
      refresh_token: 's', // secret-guard-ok: invented test value
      expires_in: 600,
    })
    const fresh = vi.fn().mockResolvedValue(
      reply(200, {
        access_token: 'c', // secret-guard-ok: invented test value
        refresh_token: 't', // secret-guard-ok: invented test value
        expires_in: 600,
      })
    )
    vi.stubGlobal('fetch', fresh)
    await refreshAppSession()
    expect(fresh).toHaveBeenCalledTimes(1)
  })
})

describe('a duplicated tab whose copy of the token was already rotated', () => {
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('ends its own session and does not present the spent copy again', async () => {
    // Duplicate Tab copies sessionStorage, so two tabs hold one token. The
    // other tab rotated it; its successor is in that tab's storage only. A
    // second presentation after the server's grace window is reuse, which
    // revokes the family and signs the other tab out too.
    storeAppSession({
      access_token: 'a', // secret-guard-ok: invented test value
      refresh_token: 'shared-copy', // secret-guard-ok: invented test value
      expires_in: 600,
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply(409, { error: 'auth_refresh_raced' }))
    vi.stubGlobal('fetch', fetchMock)
    const cleared = vi.fn()
    window.addEventListener(APP_SESSION_CLEARED, cleared)

    const outcome = await refreshAppSession().then(
      () => 'renewed',
      (error: unknown) => error
    )

    window.removeEventListener(APP_SESSION_CLEARED, cleared)
    expect(outcome).toBeInstanceOf(Error)
    expect(outcome).not.toBeInstanceOf(TransientSessionError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(cleared).toHaveBeenCalled()
    expect(hasRenewableAppSession()).toBe(false)
  })
})
