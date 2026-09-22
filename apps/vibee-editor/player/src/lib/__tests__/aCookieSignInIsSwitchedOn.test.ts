// @vitest-environment-options {"url": "https://app.t27.ai/"}
/**
 * THE COOKIE SIGN-IN, SWITCHED ON: WHAT THE SHIPPED BUILD ACTUALLY SENDS.
 *
 * aSignInOutlivesTheTab.test.ts proves the session logic with the switch off.
 * Nothing proved the switch itself: no test ever built the module with
 * VITE_AUTH_ORIGIN, and the first version read that name through a cast the
 * build-time census could not see, so the Dockerfile never passed it. This
 * file builds the module the way the Dockerfile now does -- the name set, the
 * page on app.t27.ai (the docblock above) -- and reads the requests it makes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FramedWindow } from '../framedSession'

const AUTH = 'https://auth.t27.ai'
const APP = 'https://app.t27.ai'
const MARKER_KEY = 'trinity.app.session.cookie'

type AppSessionModule = typeof import('../appSession')

async function buildWith(authOrigin: string): Promise<AppSessionModule> {
  vi.resetModules()
  vi.stubEnv('VITE_AUTH_ORIGIN', authOrigin)
  return import('../appSession')
}

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function framedBy(...ancestors: string[]): FramedWindow {
  const self = {}
  return {
    self,
    top: ancestors.length ? {} : self,
    location: { origin: APP, ancestorOrigins: ancestors },
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('a build with the door', () => {
  it('is on in the page the test runs in, which is app.t27.ai', async () => {
    expect(window.location.origin).toBe(APP)
    const m = await buildWith(AUTH)
    expect(m.cookieTransportAvailable()).toBe(true)
  })

  it('refreshes at auth.t27.ai, with the cookie and the opt-in, and no token in the body', async () => {
    const m = await buildWith(AUTH)
    m.storeAppSession({
      access_token: 'a1', // secret-guard-ok: invented test value
      refresh_transport: 'cookie',
      expires_in: 600,
    })
    expect(window.localStorage.getItem(MARKER_KEY)).toBe('1')
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        access_token: 'a2', // secret-guard-ok: invented test value
        refresh_transport: 'cookie',
        expires_in: 600,
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await m.refreshAppSession()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${AUTH}/api/auth/refresh`)
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).get('X-Session-Transport')).toBe('cookie')
    expect(JSON.parse(String(init.body))).toEqual({})
    expect(m.getAppAccessToken()).toBe('a2')
    m.clearAppSession()
  })

  it('moves a tab signed in before the switch: its stored token goes once, then the cookie holds it', async () => {
    const m = await buildWith(AUTH)
    m.storeAppSession({
      access_token: 'a1', // secret-guard-ok: invented test value
      refresh_token: 'r-old', // secret-guard-ok: invented test value
      expires_in: 600,
    })
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        access_token: 'a2', // secret-guard-ok: invented test value
        refresh_transport: 'cookie',
        expires_in: 600,
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await m.refreshAppSession()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${AUTH}/api/auth/refresh`)
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: 'r-old' }) // secret-guard-ok: invented test value
    expect(
      window.sessionStorage.getItem('trinity.app.session.refresh')
    ).toBeNull()
    expect(window.localStorage.getItem(MARKER_KEY)).toBe('1')
    m.clearAppSession()
  })

  it('still launches from Telegram on the API host, never at the cookie door', async () => {
    const m = await buildWith(AUTH)
    const fetchMock = vi.fn().mockResolvedValue(
      reply(200, {
        access_token: 'a', // secret-guard-ok: invented test value
        refresh_token: 'r', // secret-guard-ok: invented test value
        expires_in: 600,
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    await m.exchangeTelegramLaunch('query_id=x&user=%7B%7D&hash=y')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url.startsWith(AUTH)).toBe(false)
    expect(url.endsWith('/api/auth/telegram')).toBe(true)
    expect(new Headers(init.headers).get('X-Session-Transport')).toBeNull()
    expect(init.credentials).not.toBe('include')
    m.clearAppSession()
  })
})

describe('where the cookie cannot work, the build signs in as before', () => {
  it.each([
    ['framed by Telegram Web', framedBy('https://web.telegram.org')],
    ['framed by a site that is not the app', framedBy('https://example.com')],
    [
      'framed by the app inside another site',
      framedBy(APP, 'https://web.telegram.org'),
    ],
  ])('off when %s', async (_what, win) => {
    const m = await buildWith(AUTH)
    expect(m.cookieTransportAvailable(win)).toBe(false)
  })

  it('on inside the board, which is the app framing itself', async () => {
    const m = await buildWith(AUTH)
    expect(m.cookieTransportAvailable(framedBy(APP))).toBe(true)
  })

  it('off on any other origin, a dev server included', async () => {
    const m = await buildWith(AUTH)
    const dev = {
      self: 1,
      top: 1,
      location: { origin: 'http://localhost:5173' },
    }
    expect(m.cookieTransportAvailable(dev)).toBe(false)
  })
})

describe('the kill switch', () => {
  it.each([
    ['off', 'off'],
    ['empty', ''],
    ['plain http', 'http://auth.t27.ai'],
    ['a path instead of an origin', 'https://auth.t27.ai/api'],
  ])(
    '%s turns the door off, and refresh goes where it always did',
    async (_what, value) => {
      const m = await buildWith(value)
      expect(m.cookieTransportAvailable()).toBe(false)
      expect(m.authUrl('/api/auth/refresh').startsWith(AUTH)).toBe(false)
      expect(m.authCredentials()).toBe('same-origin')
      expect(m.authHeaders()).toEqual({})
    }
  )

  it('a trailing slash is still the door', async () => {
    const m = await buildWith(`${AUTH}/`)
    expect(m.authUrl('/api/auth/refresh')).toBe(`${AUTH}/api/auth/refresh`)
  })
})
