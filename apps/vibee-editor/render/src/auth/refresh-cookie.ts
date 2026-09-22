/**
 * THE WEB SESSION'S REFRESH TOKEN, AS AN HttpOnly COOKIE.
 *
 * Measured 2026-09-22. The player kept the 60-day refresh token in the tab's
 * sessionStorage (since 215480af6, 2026-09-01), so a new tab, a bookmark, a
 * link opened from Telegram or a browser restart started signed out -- the
 * owner's "I have to log in every time" -- while this server was willing to
 * honour the family for 60 days (session.ts). sessionStorage was chosen to keep
 * the token out of localStorage, where any script on the page could read it.
 *
 * A cookie the server sets with HttpOnly answers both halves at once: the
 * browser keeps it across tabs and restarts, and no script -- ours or an
 * injected one -- can read it at all. That is stricter than either store.
 *
 * WHY THESE ATTRIBUTES, EACH ONE
 *
 *   HttpOnly           Not readable from document.cookie. The point of the move.
 *   Secure             Only over TLS. Set when the connection reached the edge
 *                      over https (X-Forwarded-Proto, as live-proxy.ts does).
 *   SameSite=Strict    A cross-site request never carries it. The refresh is a
 *                      same-origin fetch from app.t27.ai, so Strict costs
 *                      nothing and closes cross-site request forgery on the
 *                      one door that mints credentials.
 *   Path=/api/auth/    Sent only to the auth doors, not with every page, asset
 *                      and API call on app.t27.ai.
 *   Max-Age            The refresh token's own remaining life. A cookie that
 *                      outlived its token would be sent for nothing.
 *
 * THE COOKIE ONLY WORKS SAME-ORIGIN. The player calls its API at
 * vibee-render-production.up.railway.app, and railway.app is on the Public
 * Suffix List: from app.t27.ai that host is ANOTHER SITE, so a cookie it set
 * would be third-party, and Safari -- which is the Telegram WebView on iOS --
 * drops those silently. So the auth doors are proxied through app.t27.ai
 * (nginx `location ^~ /api/auth/`, the same shape as /live/), and the cookie is
 * first-party there.
 *
 * OPT-IN, SO NOTHING THAT WORKS TODAY STOPS WORKING. A client asks for cookie
 * transport with the header below. The iOS app (pairing), the Mini App, and any
 * cached copy of the old player send no such header and get exactly the JSON
 * they got yesterday, refresh_token included.
 *
 * The header is also the cross-site-request-forgery gate for reading the
 * cookie: a form on another site cannot set a custom header, and a cross-site
 * fetch that sets one needs a CORS preflight this server does not grant.
 */

/** The header a client sends to ask for the refresh token as a cookie. */
export const SESSION_TRANSPORT_HEADER = 'x-session-transport'
export const SESSION_TRANSPORT_COOKIE = 'cookie'

export const REFRESH_COOKIE_NAME = 't27_refresh'
export const REFRESH_COOKIE_PATH = '/api/auth/'

interface HasHeaders {
  headers?: Record<string, string | string[] | undefined>
}

function header(req: HasHeaders, name: string): string {
  const raw = req.headers?.[name]
  return String((Array.isArray(raw) ? raw[0] : raw) ?? '')
}

/** True when the client asked for cookie transport. */
export function wantsCookieTransport(req: HasHeaders): boolean {
  return (
    header(req, SESSION_TRANSPORT_HEADER).trim().toLowerCase() ===
    SESSION_TRANSPORT_COOKIE
  )
}

/**
 * TLS as the edge saw it. Railway ends TLS at its edge, so the scheme this
 * process sees is http; the edge's X-Forwarded-Proto is the truth, and nginx
 * passes it through for this path (default.conf.template).
 */
export function isSecureRequest(req: HasHeaders): boolean {
  return header(req, 'x-forwarded-proto').split(',')[0].trim() === 'https'
}

/**
 * The refresh token from the request's cookie, or ''.
 *
 * Only when the client also sent the transport header: without it this is a
 * request the forgery gate does not cover, and it must not be able to spend
 * the cookie.
 */
export function readRefreshCookie(req: HasHeaders): string {
  if (!wantsCookieTransport(req)) return ''
  const jar = header(req, 'cookie')
  for (const part of jar.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== REFRESH_COOKIE_NAME) continue
    try {
      return decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return ''
    }
  }
  return ''
}

/** Set-Cookie for a freshly minted or rotated refresh token. */
export function refreshCookie(
  token: string,
  expiresAt: Date,
  secure: boolean,
  now = Date.now()
): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000))
  const bits = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ]
  if (secure) bits.push('Secure')
  return bits.join('; ')
}

/**
 * Set-Cookie that removes the refresh cookie. Same name and path, or the
 * browser treats it as a different cookie and keeps the old one.
 */
export function clearedRefreshCookie(secure: boolean): string {
  const bits = [
    `${REFRESH_COOKIE_NAME}=`,
    `Path=${REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ]
  if (secure) bits.push('Secure')
  return bits.join('; ')
}
