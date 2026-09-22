import { describe, expect, it } from 'vitest'
import {
  APP_ORIGIN,
  BASE_ALLOW_HEADERS,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  applyAuthCors,
  authHostRefuses,
  clearedRefreshCookie,
  isAuthHost,
  isSecureRequest,
  readRefreshCookie,
  refreshCookie,
  wantsCookieTransport,
} from './refresh-cookie'

const optIn = { 'x-session-transport': 'cookie' }

describe('the refresh cookie a server sets', () => {
  const now = Date.UTC(2026, 8, 22, 12, 0, 0)
  const in60Days = new Date(now + 60 * 24 * 3600 * 1000)

  it('is HttpOnly, SameSite=Strict, scoped to the auth doors', () => {
    const c = refreshCookie('tok', in60Days, true, now)
    expect(c).toContain(`${REFRESH_COOKIE_NAME}=tok`)
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Strict')
    expect(c).toContain(`Path=${REFRESH_COOKIE_PATH}`)
    expect(c).toContain('Secure')
  })

  it('lives exactly as long as the token it carries', () => {
    expect(refreshCookie('tok', in60Days, true, now)).toContain(
      `Max-Age=${60 * 24 * 3600}`
    )
  })

  it('never goes negative for a token already past its expiry', () => {
    expect(refreshCookie('tok', new Date(now - 5000), true, now)).toContain(
      'Max-Age=0'
    )
  })

  it('is always Secure, which __Host- requires or the browser drops it', () => {
    expect(refreshCookie('tok', in60Days, false, now)).toContain('Secure')
    expect(clearedRefreshCookie(false)).toContain('Secure')
  })

  it('is a __Host- cookie on Path=/ with no Domain, so no sibling can shadow it', () => {
    const c = refreshCookie('tok', in60Days, true, now)
    expect(REFRESH_COOKIE_NAME.startsWith('__Host-')).toBe(true)
    expect(c).toContain('Path=/;')
    expect(c).not.toMatch(/Domain=/i)
  })

  it('escapes a token so it cannot inject another attribute', () => {
    const c = refreshCookie('a; Path=/', in60Days, true, now)
    expect(c.startsWith(`${REFRESH_COOKIE_NAME}=a%3B%20Path%3D%2F;`)).toBe(true)
  })

  it('is removed with the same name and path, or the old one stays', () => {
    const c = clearedRefreshCookie(true)
    expect(c).toContain(`${REFRESH_COOKIE_NAME}=`)
    expect(c).toContain(`Path=${REFRESH_COOKIE_PATH}`)
    expect(c).toContain('Max-Age=0')
  })
})

describe('reading the cookie back', () => {
  const jar = `other=1; ${REFRESH_COOKIE_NAME}=abc%20def; x=2`

  it('finds the token among other cookies and decodes it', () => {
    expect(readRefreshCookie({ headers: { ...optIn, cookie: jar } })).toBe(
      'abc def'
    )
  })

  it('refuses without the transport header -- the forgery gate', () => {
    // A form posted from another site sends cookies it may send, but it cannot
    // set a custom header. Without the header the cookie must not be spendable.
    expect(readRefreshCookie({ headers: { cookie: jar } })).toBe('')
  })

  it('answers empty when the cookie is absent', () => {
    expect(
      readRefreshCookie({ headers: { ...optIn, cookie: 'other=1' } })
    ).toBe('')
  })

  it('does not mistake a longer name that starts the same way', () => {
    expect(
      readRefreshCookie({
        headers: { ...optIn, cookie: `${REFRESH_COOKIE_NAME}_old=zzz` },
      })
    ).toBe('')
  })

  it('spends neither when two cookies share the name -- one was planted', () => {
    expect(
      readRefreshCookie({
        headers: {
          ...optIn,
          cookie: `${REFRESH_COOKIE_NAME}=planted; ${REFRESH_COOKIE_NAME}=mine`,
        },
      })
    ).toBe('')
  })

  it('answers empty rather than throwing on a malformed escape', () => {
    expect(
      readRefreshCookie({
        headers: { ...optIn, cookie: `${REFRESH_COOKIE_NAME}=%E0%A4%A` },
      })
    ).toBe('')
  })
})

describe('the opt-in and the scheme', () => {
  it('is opt-in: a request without the header is a JSON client', () => {
    expect(wantsCookieTransport({ headers: {} })).toBe(false)
    expect(wantsCookieTransport({ headers: optIn })).toBe(true)
    expect(
      wantsCookieTransport({ headers: { 'x-session-transport': 'Cookie ' } })
    ).toBe(true)
  })

  it("takes TLS from the edge's header, the first hop", () => {
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'https' } })).toBe(
      true
    )
    expect(
      isSecureRequest({ headers: { 'x-forwarded-proto': 'https, http' } })
    ).toBe(true)
    expect(isSecureRequest({ headers: { 'x-forwarded-proto': 'http' } })).toBe(
      false
    )
    expect(isSecureRequest({ headers: {} })).toBe(false)
  })
})

describe('credentialed CORS for the sign-in doors', () => {
  function run(url: string, origin: string | undefined) {
    const set: Record<string, string> = {}
    applyAuthCors(
      { url, headers: origin ? { origin } : {} },
      { setHeader: (k: string, v: string) => (set[k] = v) }
    )
    return set
  }

  it('names app.t27.ai and allows credentials on /api/auth/*', () => {
    const h = run('/api/auth/refresh', APP_ORIGIN)
    expect(h['Access-Control-Allow-Origin']).toBe(APP_ORIGIN)
    expect(h['Access-Control-Allow-Credentials']).toBe('true')
    expect(h['Access-Control-Allow-Headers'].toLowerCase()).toContain(
      'x-session-transport'
    )
    expect(h.Vary).toBe('Origin')
  })

  it("keeps every header the render admits, so the Mini App's own doors still pass", () => {
    // pair/start and game-token live under /api/auth/ and send
    // X-Telegram-Init-Data. The first version answered this origin with a
    // three-header list and their preflight was refused -- cookie mode off.
    for (const path of ['/api/auth/pair/start', '/api/auth/game-token']) {
      const allowed = run(path, APP_ORIGIN)['Access-Control-Allow-Headers']
      for (const name of BASE_ALLOW_HEADERS.split(', ')) {
        expect(allowed, `${path} lost ${name}`).toContain(name)
      }
      expect(allowed).toContain('X-Telegram-Init-Data')
    }
  })

  it('leaves the methods as the render answers them', () => {
    expect(run('/api/auth/refresh', APP_ORIGIN)).not.toHaveProperty(
      'Access-Control-Allow-Methods'
    )
  })

  it('gives nothing to a sibling on the same site', () => {
    // Same site as the app, so SameSite=Strict would let its requests carry
    // the cookie; the missing credentials grant is what keeps it out.
    expect(run('/api/auth/refresh', 'https://t27.ai')).toEqual({})
    expect(run('/api/auth/refresh', 'https://leela.t27.ai')).toEqual({})
  })

  it('gives nothing outside the sign-in doors, even to the app', () => {
    expect(run('/api/feed', APP_ORIGIN)).toEqual({})
    expect(run('/api/authx/refresh', APP_ORIGIN)).toEqual({})
  })

  it('gives nothing to a request with no Origin', () => {
    expect(run('/api/auth/refresh', undefined)).toEqual({})
  })

  it('ignores a query string when matching the path', () => {
    expect(
      run('/api/auth/refresh?x=1', APP_ORIGIN)['Access-Control-Allow-Origin']
    ).toBe(APP_ORIGIN)
  })
})

describe('auth.t27.ai answers the sign-in doors and nothing else', () => {
  const on = (host: string, url: string, forwarded?: string) =>
    authHostRefuses({
      url,
      headers: {
        host,
        ...(forwarded ? { 'x-forwarded-host': forwarded } : {}),
      },
    })

  it('serves the sign-in doors and the health check', () => {
    expect(on('auth.t27.ai', '/api/auth/refresh')).toBe(false)
    expect(on('auth.t27.ai', '/api/auth/widget?x=1')).toBe(false)
    expect(on('auth.t27.ai', '/health')).toBe(false)
  })

  it('refuses an upload, whose bytes and type a person chose', () => {
    // An .svg or a text/html "image" served here would be same-origin with
    // the doors: it could spend the cookie and read the fresh access token.
    expect(on('auth.t27.ai', '/s3/assets/1-x.svg')).toBe(true)
    expect(on('auth.t27.ai', '/')).toBe(true)
    expect(on('auth.t27.ai', '/api/feed')).toBe(true)
    expect(on('auth.t27.ai', '/api/authx/refresh')).toBe(true)
  })

  it('refuses a path that only starts like a door', () => {
    // Routes that match on new URL(req.url).pathname resolve dot segments.
    for (const url of [
      '/api/auth/../feed/x',
      '/api/auth/../s3/x.svg',
      '/api/auth/%2e%2e/s3/x.svg',
      '/api/auth/%2E%2E/feed',
      '/api/auth/..%2fs3/x.svg',
      '/api/auth/.%2e/s3',
      '/api/auth\\..\\s3',
      '/api/auth/./refresh',
      '//api/auth/refresh',
    ]) {
      expect(on('auth.t27.ai', url), url).toBe(true)
    }
  })

  it('reads the host the edge forwards, case and port aside', () => {
    expect(on('internal:8080', '/s3/x.svg', 'auth.t27.ai')).toBe(true)
    expect(on('AUTH.T27.AI:443', '/s3/x.svg')).toBe(true)
  })

  it("leaves the render's other hosts alone", () => {
    expect(on('vibee-render-production.up.railway.app', '/s3/x.svg')).toBe(
      false
    )
    expect(on('app.t27.ai', '/s3/x.svg')).toBe(false)
  })
})

describe('auth.t27.ai upgrades nothing', () => {
  it('is decided by the host alone, so an upgrade to a door is refused too', () => {
    // render-server.ts refuses every WebSocket upgrade for which this is
    // true; it looks at no path, so /api/auth/* and /health are covered.
    expect(isAuthHost({ headers: { host: 'auth.t27.ai' } })).toBe(true)
    expect(
      isAuthHost({ headers: { host: 'x', 'x-forwarded-host': 'AUTH.t27.ai' } })
    ).toBe(true)
    expect(
      isAuthHost({
        headers: { host: 'vibee-render-production.up.railway.app' },
      })
    ).toBe(false)
  })
})
