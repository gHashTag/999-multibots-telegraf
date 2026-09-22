/**
 * THE WEB SESSION'S REFRESH TOKEN, AS AN HttpOnly COOKIE ON auth.t27.ai.
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
 *   __Host- prefix     The browser refuses a cookie of this name that has a
 *                      Domain, is not Secure, or whose Path is not /. So no
 *                      sibling on t27.ai can plant one to shadow ours.
 *   HttpOnly           Not readable from document.cookie. The point of the move.
 *   Secure             Required by __Host-; auth.t27.ai is only served over TLS.
 *   SameSite=Strict    Sent only on same-site requests. app.t27.ai and
 *                      auth.t27.ai are one site (t27.ai), so the player's calls
 *                      carry it and a request started from another site never does.
 *   Path=/             Required by __Host-. This host is the render, and the
 *                      player sends it nothing but the sign-in doors.
 *   Max-Age            The refresh token's own remaining life.
 *
 * WHY A HOST OF ITS OWN. The player's other API calls go to
 * vibee-render-production.up.railway.app, and railway.app is on the Public
 * Suffix List: from app.t27.ai that host is ANOTHER SITE, so a cookie it set
 * would be third-party, and Safari -- the Telegram WebView on iOS -- drops
 * those without a word. auth.t27.ai is a custom domain of the same render, on
 * the same site as the app, so its cookie is first-party. The browser reaches
 * it through one Railway edge, so the sign-in brake sees the person's own
 * address; a proxy hop through app.t27.ai would cross the edge twice, and the
 * edge replaces X-Forwarded-For (measured), putting every person in one bucket.
 *
 * OPT-IN, SO NOTHING THAT WORKS TODAY STOPS WORKING. A client asks for cookie
 * transport with the header below. The iOS app (pairing), the Mini App, and any
 * cached copy of the old player send no such header and get exactly the JSON
 * they got yesterday, refresh_token included.
 *
 * The header is also the cross-site-request-forgery gate for reading the
 * cookie: a form on another site cannot set a custom header, and a fetch that
 * sets one from any origin but app.t27.ai is not granted credentials by
 * applyAuthCors below.
 */

/** The header a client sends to ask for the refresh token as a cookie. */
export const SESSION_TRANSPORT_HEADER = 'x-session-transport'
export const SESSION_TRANSPORT_COOKIE = 'cookie'

/*
 * __Host-, on a host of its own.
 *
 * The first version put the cookie on app.t27.ai behind an nginx hop, named
 * plainly. Two reviews broke that. Railway's edge REPLACES X-Forwarded-For
 * with whoever connects to it (measured), so the hop put every web sign-in in
 * one bucket of the ten-a-minute brake -- a platform-wide lockout. And a plain
 * name can be shadowed: any page on t27.ai may set a cookie with
 * Domain=t27.ai and a longer path, and the browser lists it first.
 *
 * On auth.t27.ai -- the render's own custom domain -- the browser talks to the
 * render through one edge, so the brake sees the person; the cookie is
 * first-party because auth.t27.ai is the same site as app.t27.ai; and the
 * __Host- prefix makes the browser refuse any cookie of this name that
 * carries a Domain, is not Secure, or has a Path other than /. A sibling on
 * t27.ai can no longer plant one. Path=/ is safe here: this host serves the
 * render, and the player sends it nothing but the sign-in doors.
 */
export const REFRESH_COOKIE_NAME = '__Host-t27_refresh'
export const REFRESH_COOKIE_PATH = '/'

/** The one origin whose credentialed calls to the sign-in doors we answer. */
export const APP_ORIGIN = 'https://app.t27.ai'

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
 * process sees is http and X-Forwarded-Proto is the truth. Kept for callers;
 * the cookie itself is always Secure (__Host-).
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
  const found: string[] = []
  for (const part of jar.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== REFRESH_COOKIE_NAME) continue
    found.push(part.slice(eq + 1).trim())
  }
  // Two cookies of one name means someone planted the second. Spending either
  // would let the planter choose whose session this browser rides, so neither
  // is spent: the person signs in again, which is a nuisance and not a swap.
  if (found.length !== 1) return ''
  try {
    return decodeURIComponent(found[0])
  } catch {
    return ''
  }
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
  // __Host- is refused by the browser without Secure, so it is not optional.
  void secure
  bits.push('Secure')
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
  void secure
  bits.push('Secure')
  return bits.join('; ')
}

interface CorsResponse {
  setHeader(name: string, value: string): unknown
}

/**
 * The request headers the render admits from any origin (render-server.ts sets
 * this on every reply). One constant, so the sign-in doors below can only ADD
 * to it.
 */
export const BASE_ALLOW_HEADERS =
  'Content-Type, Authorization, X-Filename, X-Api-Key, X-Agent-Key, X-Telegram-Init-Data'

/**
 * Credentialed CORS for the sign-in doors, from app.t27.ai only.
 *
 * The render answers every request with `Access-Control-Allow-Origin: *`, and
 * a browser refuses to send cookies to -- or read a reply from -- a
 * credentialed request answered that way. So for a request to /api/auth/*
 * whose Origin is exactly app.t27.ai the answer names that origin, allows
 * credentials and admits the transport header. Anything else, including a
 * sibling on t27.ai, keeps `*` and gets no credentials, which is the forgery
 * gate: another origin cannot send X-Session-Transport with the cookie.
 *
 * ADD TO THE LIST, NEVER REPLACE IT. The first version answered these paths
 * with `Content-Type, Authorization, x-session-transport` and a POST-only
 * method list. The Mini App's own doors are under /api/auth/ too -- pair/start
 * and game-token send X-Telegram-Init-Data -- and their preflight from
 * app.t27.ai was then refused, with cookie mode off, on the API host as well
 * as here (review, 2026-09-22). So the headers are the render's own list plus
 * one, and the methods are left as the render answers them.
 */
export function applyAuthCors(
  req: HasHeaders & { url?: string },
  res: CorsResponse
): void {
  const path = String(req.url ?? '').split('?')[0]
  if (!path.startsWith('/api/auth/')) return
  if (header(req, 'origin') !== APP_ORIGIN) return
  res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader(
    'Access-Control-Allow-Headers',
    `${BASE_ALLOW_HEADERS}, X-Session-Transport`
  )
  res.setHeader('Vary', 'Origin')
}

/** The render's custom domain that holds the refresh cookie. */
export const AUTH_HOST = 'auth.t27.ai'

/**
 * AUTH.T27.AI ANSWERS THE SIGN-IN DOORS AND NOTHING ELSE.
 *
 * It is a custom domain of the WHOLE render, and the render serves things
 * whose bytes a person chooses: /s3/ returns an upload with the Content-Type
 * its uploader sent, so an .svg or a text/html "image" runs as a page. On
 * auth.t27.ai that page is same-origin with the sign-in doors: it cannot read
 * the HttpOnly cookie, but it can POST /api/auth/refresh with it and read the
 * reply -- a fresh access token for whoever opened the link (review,
 * 2026-09-22). So on this host every path but /api/auth/* and /health is 404
 * before any other route runs. The render's other hosts are unaffected.
 *
 * The Host the edge forwards is the one the browser asked for; a browser
 * cannot send another for this origin, which is the case that matters.
 */
/**
 * The request is addressed to auth.t27.ai, by the Host the edge forwards.
 * The path is taken and ignored on purpose: an upgrade is refused on every
 * path of this host, the doors' included.
 */
export function isAuthHost(req: HasHeaders & { url?: string }): boolean {
  const forwarded = header(req, 'x-forwarded-host').split(',')[0].trim()
  const host = (forwarded || header(req, 'host'))
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
  return host === AUTH_HOST
}

export function authHostRefuses(req: HasHeaders & { url?: string }): boolean {
  if (!isAuthHost(req)) return false
  const raw = String(req.url ?? '').split('?')[0]
  /*
   * The raw path AND the path a URL parser makes of it must both be a door.
   * Some routes match on `new URL(req.url).pathname`, which resolves dot
   * segments: /api/auth/../feed/x starts like a door and lands on the feed.
   * A path with a dot segment, an encoded dot, slash or backslash, or a
   * backslash is no door at all -- none of the doors needs one.
   */
  if (/(^|\/)\.{1,2}(\/|$)|%2e|%2f|%5c|\\/i.test(raw)) return true
  let resolved: string
  try {
    resolved = new URL(raw, 'http://auth.invalid').pathname
  } catch {
    return true
  }
  const door = (path: string) =>
    path.startsWith('/api/auth/') || path === '/health'
  return !(door(raw) && door(resolved))
}
