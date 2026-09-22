import { describe, expect, it } from 'vitest'
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  clearedRefreshCookie,
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

  it('carries Secure only over TLS', () => {
    expect(refreshCookie('tok', in60Days, false, now)).not.toContain('Secure')
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
