// @vitest-environment-options {"url": "https://app.t27.ai/"}
/**
 * ONE BROWSER, ONE COOKIE: WHAT EACH TAB DOES WHEN ANOTHER ONE MOVES.
 *
 * Review of the cookie session, 2026-09-22. The cookie is the browser's, but
 * each tab kept its own idea of who is signed in:
 *
 *   - "Sign out" in one tab left the others showing the person over a dead
 *     token, after a reload too;
 *   - a tab with its own token (a Telegram launch) ending its session took
 *     away the hint every cookie tab needs to renew;
 *   - another tab's refresh landing just after "Sign out" cancelled it;
 *   - a failed "Sign out everywhere" left this browser's cookie alive.
 *
 * The module is built the way the shipped bundle is (VITE_AUTH_ORIGIN set, the
 * page on app.t27.ai), and another tab is played by writing localStorage and
 * handing the module the `storage` event the browser would.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_BASE } from '../../config'

const AUTH = 'https://auth.t27.ai'
const MARKER_KEY = 'trinity.app.session.cookie'
const REFRESH_KEY = 'trinity.app.session.refresh'
const PENDING_KEY = 'trinity.app.session.logout-pending'

type M = typeof import('../appSession')

async function build(): Promise<M> {
  vi.resetModules()
  vi.stubEnv('VITE_AUTH_ORIGIN', AUTH)
  return import('../appSession')
}

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

/** A window whose listeners the test can fire, as another tab would. */
function fakeWindow() {
  const listeners = new Map<string, Array<(e?: unknown) => void>>()
  return {
    addEventListener(type: string, fn: (e?: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn])
    },
    removeEventListener(type: string, fn: (e?: unknown) => void) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter(x => x !== fn)
      )
    },
    fire(type: string, event?: unknown) {
      for (const fn of listeners.get(type) ?? []) fn(event)
    },
  }
}

const cookieSession = {
  access_token: 'a1', // secret-guard-ok: invented test value
  refresh_transport: 'cookie' as const,
  expires_in: 600,
}
const ownTokenSession = {
  access_token: 'a1', // secret-guard-ok: invented test value
  refresh_token: 'own', // secret-guard-ok: invented test value
  expires_in: 600,
}

const settle = () => new Promise(done => setTimeout(done, 0))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('the hint belongs to the browser', () => {
  it("a tab with its own token ending its session leaves the cookie tabs' hint alone", async () => {
    const m = await build()
    window.localStorage.setItem(MARKER_KEY, '1') // another tab's cookie session
    m.storeAppSession(ownTokenSession)
    m.clearAppSession()
    expect(window.localStorage.getItem(MARKER_KEY)).toBe('1')
  })

  it('a cookie tab ending its session takes the hint away', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    m.clearAppSession()
    expect(window.localStorage.getItem(MARKER_KEY)).toBeNull()
  })

  it('"Sign out" in a tab with its own token still signs the browser out', async () => {
    const m = await build()
    window.localStorage.setItem(MARKER_KEY, '1')
    m.storeAppSession(ownTokenSession)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, {})))
    await m.logoutAppSession()
    expect(window.localStorage.getItem(MARKER_KEY)).toBeNull()
  })
})

describe('every tab follows the cookie', () => {
  it('the hint gone: a tab riding the cookie signs out, and says so', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    const win = fakeWindow()
    m.startAppSessionHealing(win)
    const cleared = vi.fn()
    window.addEventListener(m.APP_SESSION_CLEARED, cleared)

    window.localStorage.removeItem(MARKER_KEY) // "Sign out" in another tab
    win.fire('storage', { key: MARKER_KEY })

    window.removeEventListener(m.APP_SESSION_CLEARED, cleared)
    expect(m.getAppAccessToken()).toBe('')
    expect(cleared).toHaveBeenCalled()
  })

  it('the hint gone: a tab with its own token keeps its session', async () => {
    const m = await build()
    m.storeAppSession(ownTokenSession)
    const win = fakeWindow()
    m.startAppSessionHealing(win)
    win.fire('storage', { key: MARKER_KEY })
    expect(m.getAppAccessToken()).toBe('a1')
  })

  it('the hint back: a signed-out tab renews into the session and the person arrives', async () => {
    const m = await build()
    const win = fakeWindow()
    m.startAppSessionHealing(win)
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        access_token: 'a2', // secret-guard-ok: invented test value
        refresh_transport: 'cookie',
        expires_in: 600,
        telegram_user: { id: 42, first_name: 'Owner', auth_date: 1 },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const person = vi.fn()
    window.addEventListener(m.APP_SESSION_PERSON, person)

    window.localStorage.setItem(MARKER_KEY, '1') // a sign-in in another tab
    win.fire('storage', { key: MARKER_KEY })
    // Followers spread their renewal over a moment (followTheJar).
    await vi.waitFor(() => expect(m.getAppAccessToken()).toBe('a2'), {
      timeout: 3000,
    })

    window.removeEventListener(m.APP_SESSION_PERSON, person)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${AUTH}/api/auth/refresh`)
    expect(person).toHaveBeenCalled()
    m.clearAppSession()
  })

  it('other keys changing elsewhere do nothing', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    const win = fakeWindow()
    m.startAppSessionHealing(win)
    window.localStorage.removeItem(MARKER_KEY)
    win.fire('storage', { key: 'some.other.setting' })
    expect(m.getAppAccessToken()).toBe('a1')
    m.clearAppSession()
  })

  it('a tab reloaded after the cookie session ended elsewhere starts signed out', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    window.localStorage.removeItem(MARKER_KEY)
    // The reload: a fresh module over the same tab storage.
    const again = await build()
    vi.stubGlobal('fetch', vi.fn())
    again.startAppSessionHealing(undefined)
    expect(again.getAppAccessToken()).toBe('')
  })

  it('a tab asked to renew with nothing left to renew with is signed out', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    window.localStorage.removeItem(MARKER_KEY)
    await expect(m.refreshAppSession()).rejects.toThrow()
    expect(m.getAppAccessToken()).toBe('')
  })
})

describe('a sign-out not yet confirmed is not undone', () => {
  it('a refresh does not clear it; a sign-in does', async () => {
    const m = await build()
    window.localStorage.setItem(PENDING_KEY, '1')
    m.storeAppSession(cookieSession) // what a refresh stores
    expect(window.localStorage.getItem(PENDING_KEY)).toBe('1')
    m.storeAppSession(cookieSession, { signIn: true })
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull()
    m.clearAppSession()
  })

  it('a tab asked to renew while it is pending finishes the sign-out instead', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    window.localStorage.setItem(PENDING_KEY, '1')
    const fetchMock = vi.fn().mockResolvedValue(reply(200, {}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(m.refreshAppSession()).rejects.toThrow()
    await settle()
    const urls = fetchMock.mock.calls.map(c => String(c[0]))
    expect(urls).not.toContain(`${AUTH}/api/auth/refresh`)
    expect(urls).toContain(`${AUTH}/api/auth/logout`)
    expect(m.getAppAccessToken()).toBe('')
  })

  it('a reply that lands after "Sign out" does not bring the session back', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    let answer: (v: unknown) => void = () => undefined
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise(done => (answer = done)))
      .mockResolvedValue(reply(200, {}))
    vi.stubGlobal('fetch', fetchMock)
    const inFlight = m.refreshAppSession()
    window.localStorage.setItem(PENDING_KEY, '1') // "Sign out" in another tab
    answer(
      reply(200, {
        access_token: 'revived', // secret-guard-ok: invented test value
        refresh_transport: 'cookie',
        expires_in: 600,
      })
    )
    await expect(inFlight).rejects.toThrow()
    expect(m.getAppAccessToken()).not.toBe('revived')
  })

  it('a failed "Sign out everywhere" still signs this browser out', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(401, { error: 'auth_session_required' }))
      .mockResolvedValue(reply(200, { logged_out: true }))
    vi.stubGlobal('fetch', fetchMock)
    const ok = await m.logoutAllAppSessions()
    expect(ok).toBe(false)
    const urls = fetchMock.mock.calls.map(c => String(c[0]))
    expect(urls).toEqual([
      `${AUTH}/api/auth/logout-all`,
      `${AUTH}/api/auth/logout`,
    ])
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull()
    expect(window.localStorage.getItem(MARKER_KEY)).toBeNull()
  })

  it('and when even that fails, the sign-out is left pending for the next start', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await m.logoutAllAppSessions()
    expect(window.localStorage.getItem(PENDING_KEY)).toBe('1')
  })
})

describe('the widget sign-in when the cookie door does not answer', () => {
  it('signs in on the API host the way it always did', async () => {
    const m = await build()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(
        reply(200, {
          access_token: 'a', // secret-guard-ok: invented test value
          refresh_token: 'r', // secret-guard-ok: invented test value
          expires_in: 600,
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    await m.exchangeTelegramWidget({ id: 1, hash: 'x' })
    const [first] = fetchMock.mock.calls[0] as [string]
    const [second, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(first).toBe(`${AUTH}/api/auth/widget`)
    expect(second.startsWith(AUTH)).toBe(false)
    expect(second.endsWith('/api/auth/widget')).toBe(true)
    expect(new Headers(init.headers).get('X-Session-Transport')).toBeNull()
    expect(window.sessionStorage.getItem(REFRESH_KEY)).toBe('r')
    m.clearAppSession()
  })
})

describe('the second review of the cookie session', () => {
  it('a tab signed in before the browser signed out signs itself out, own token and all', async () => {
    const m = await build()
    m.storeAppSession(ownTokenSession, { signIn: true })
    const win = fakeWindow()
    m.startAppSessionHealing(win)
    const fetchMock = vi.fn().mockResolvedValue(reply(200, {}))
    vi.stubGlobal('fetch', fetchMock)

    // "Sign out" in another tab, a moment later.
    window.localStorage.setItem(
      'trinity.app.session.signed-out-at',
      String(Date.now() + 5)
    )
    win.fire('storage', { key: 'trinity.app.session.signed-out-at' })
    await settle()

    expect(m.getAppAccessToken()).toBe('')
    // Its own family is revoked through the body token, not left to move
    // into the empty jar at its next refresh -- and the jar is not touched:
    // no cookie, no opt-in, the API host (third review, 2026-09-22).
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/api/auth/logout`)
    expect(init.credentials).toBe('omit')
    expect(new Headers(init.headers).get('X-Session-Transport')).toBeNull()
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: 'own' }) // secret-guard-ok: invented test value
  })

  it('a tab restored late does not take a newer sign-in with it', async () => {
    // Signed out in one tab, signed in again in another; a tab from before
    // both comes back (Ctrl+Shift+T, Memory Saver) and follows the old
    // sign-out. The browser's new session stays.
    const m = await build()
    m.storeAppSession(ownTokenSession, { signIn: true })
    window.localStorage.setItem(
      'trinity.app.session.signed-out-at',
      String(Date.now() + 5)
    )
    window.localStorage.setItem(MARKER_KEY, '1') // the newer sign-in's hint
    const fetchMock = vi.fn().mockResolvedValue(reply(200, {}))
    vi.stubGlobal('fetch', fetchMock)
    m.startAppSessionHealing(fakeWindow())
    await settle()
    expect(m.getAppAccessToken()).toBe('')
    expect(window.localStorage.getItem(MARKER_KEY)).toBe('1')
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull()
    for (const [, init] of fetchMock.mock.calls as Array<[string, RequestInit]>)
      expect(init.credentials).not.toBe('include')
  })

  it('a tab signed in after that sign-out is left alone', async () => {
    const m = await build()
    window.localStorage.setItem(
      'trinity.app.session.signed-out-at',
      String(Date.now() - 60_000)
    )
    m.storeAppSession(ownTokenSession, { signIn: true })
    const win = fakeWindow()
    vi.stubGlobal('fetch', vi.fn())
    m.startAppSessionHealing(win)
    win.fire('storage', { key: 'trinity.app.session.signed-out-at' })
    expect(m.getAppAccessToken()).toBe('a1')
    m.clearAppSession()
  })

  it('"Sign out" from a tab with its own token, offline, is left pending', async () => {
    const m = await build()
    window.localStorage.setItem(MARKER_KEY, '1')
    m.storeAppSession(ownTokenSession)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await m.logoutAppSession()
    expect(window.localStorage.getItem(PENDING_KEY)).toBe('1')
  })

  it('a document signed by Telegram launch data does not ride the jar', async () => {
    // What telegram-web-app.js leaves on a page opened with #tgWebAppData.
    const w = window as unknown as { Telegram?: unknown }
    w.Telegram = { WebApp: { initData: 'query_id=x&user=%7B%7D&hash=y' } }
    try {
      const m = await build()
      window.localStorage.setItem(MARKER_KEY, '1')
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const win = fakeWindow()
      m.startAppSessionHealing(win)
      win.fire('storage', { key: MARKER_KEY })
      await new Promise(done => setTimeout(done, 1300))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      delete w.Telegram
    }
  })

  it('a stale tab copy answered raced rides the jar instead of ending the tab', async () => {
    const m = await build()
    m.storeAppSession(ownTokenSession)
    window.localStorage.setItem(MARKER_KEY, '1')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reply(409, { error: 'auth_refresh_raced', reason: 'successor_in_jar' })
      )
      .mockResolvedValue(
        reply(200, {
          access_token: 'from-jar', // secret-guard-ok: invented test value
          refresh_transport: 'cookie',
          expires_in: 600,
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    await m.refreshAppSession()
    const second = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(String(second[1].body))).toEqual({})
    expect(m.getAppAccessToken()).toBe('from-jar')
    expect(window.sessionStorage.getItem(REFRESH_KEY)).toBeNull()
    m.clearAppSession()
  })

  it('three tabs racing one jar token: the losers keep trying inside the grace window', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(409, { error: 'auth_refresh_raced' }))
      .mockResolvedValueOnce(reply(409, { error: 'auth_refresh_raced' }))
      .mockResolvedValue(
        reply(200, {
          access_token: 'third-try', // secret-guard-ok: invented test value
          refresh_transport: 'cookie',
          expires_in: 600,
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    await m.refreshAppSession()
    expect(m.getAppAccessToken()).toBe('third-try')
    m.clearAppSession()
  })

  it('a race that never resolves costs four requests, then backs off', async () => {
    // Bounded, so a crowd of tabs cannot turn into a stream against the
    // sign-in brake (render refresh-race.test.ts pins the bound in the code).
    const m = await build()
    m.storeAppSession(cookieSession)
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply(409, { error: 'auth_refresh_raced' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(m.refreshAppSession()).rejects.toBeInstanceOf(
      m.TransientSessionError
    )
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(m.getAppAccessToken()).toBe('a1')
    m.clearAppSession()
  })

  it('a plain race for a tab copy does not ride the jar: only the server naming the jar does', async () => {
    const m = await build()
    m.storeAppSession(ownTokenSession)
    window.localStorage.setItem(MARKER_KEY, '1')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply(409, { error: 'auth_refresh_raced' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(m.refreshAppSession()).rejects.toThrow()
    const bodies = (fetchMock.mock.calls as Array<[string, RequestInit]>).map(
      c => String(c[1].body)
    )
    expect(bodies).not.toContain('{}')
  })

  it('a document signed by launch data signs out alone, without the jar', async () => {
    const w = window as unknown as { Telegram?: unknown }
    w.Telegram = { WebApp: { initData: 'query_id=x&user=%7B%7D&hash=y' } }
    try {
      const m = await build()
      expect(m.cookieTransportAvailable()).toBe(false)
      window.localStorage.setItem(MARKER_KEY, '1')
      m.storeAppSession(ownTokenSession, { signIn: true })
      const fetchMock = vi.fn().mockResolvedValue(reply(200, {}))
      vi.stubGlobal('fetch', fetchMock)
      await m.logoutAppSession()
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url.startsWith(AUTH)).toBe(false)
      expect(init.credentials).not.toBe('include')
      expect(
        window.localStorage.getItem('trinity.app.session.signed-out-at')
      ).toBeNull()
      expect(window.localStorage.getItem(MARKER_KEY)).toBe('1')
    } finally {
      delete w.Telegram
    }
  })

  it('a refresh that never reached the server does not start the backoff', async () => {
    const m = await build()
    m.storeAppSession(cookieSession)
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(
        reply(200, {
          access_token: 'back-online', // secret-guard-ok: invented test value
          refresh_transport: 'cookie',
          expires_in: 600,
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(m.refreshAppSession()).rejects.toBeInstanceOf(
      m.NetworkSessionError
    )
    // The 'online' heal, at once: no 15 s gate.
    await m.refreshAppSession()
    expect(m.getAppAccessToken()).toBe('back-online')
    m.clearAppSession()
  })

  it('a sign-in after a clock stepped back is still after the sign-out', async () => {
    const m = await build()
    // A sign-out recorded an hour "ahead", then the clock was corrected.
    window.localStorage.setItem(
      'trinity.app.session.signed-out-at',
      String(Date.now() + 3_600_000)
    )
    m.storeAppSession(ownTokenSession, { signIn: true })
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        access_token: 'kept', // secret-guard-ok: invented test value
        refresh_token: 'own-2', // secret-guard-ok: invented test value
        expires_in: 600,
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    await m.refreshAppSession()
    expect(m.getAppAccessToken()).toBe('kept')
    m.clearAppSession()
  })

  it('a sign-out after a fast-clock one still reaches a tab stamped against it', async () => {
    const m = await build()
    const ahead = Date.now() + 3_600_000
    window.localStorage.setItem(
      'trinity.app.session.signed-out-at',
      String(ahead)
    )
    m.storeAppSession(ownTokenSession, { signIn: true }) // since = ahead + 1
    // Signed out again, now on a corrected clock, in this very tab's browser.
    const other = await build()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, {})))
    other.storeAppSession(cookieSession, { signIn: true })
    await other.logoutAppSession()
    expect(
      Number(window.localStorage.getItem('trinity.app.session.signed-out-at'))
    ).toBeGreaterThan(ahead + 1)
  })
})
