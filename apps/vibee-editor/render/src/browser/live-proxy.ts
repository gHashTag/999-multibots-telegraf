/**
 * THE DOOR THE PERSON ACTUALLY WALKS THROUGH.
 *
 * The broker hands out `/live/<sessionId>` and nothing addressable. This is
 * what makes that path real: it checks who is knocking and, only then, lets
 * the request through to that session's pod.
 *
 * WHY A PATH AND NOT A SUBDOMAIN. Measured against the running pod: neko's
 * page asks for its assets with relative paths, and its client builds both the
 * WebSocket and the REST base from `location.pathname` --
 *
 *   location.protocol.replace(/^http/,"ws") + "//" + location.host
 *     + location.pathname.replace(/\/$/,"") + "/ws"
 *
 * -- so a page served at `/live/<id>/` asks for `/live/<id>/ws` by itself. No
 * rewriting, no wildcard DNS, no certificate per session.
 *
 * WHY THE TOKEN BECOMES A COOKIE. It arrives once in the query string and is
 * traded immediately for a cookie scoped to `/live/<id>`, with a redirect to
 * the clean URL. A token repeated in the address of every asset and every
 * WebSocket would settle into browser history, into `Referer`, and into every
 * access log between here and the pod -- and that token opens somebody's
 * signed-in browser.
 *
 * WHAT THIS DOES NOT CARRY. Signalling only. WebRTC media does not travel
 * over an HTTP proxy, so the picture arrives only where the pod and the
 * viewer can already reach each other directly -- true on one machine, not
 * true across the internet. Making that work is a separate decision (neko's
 * TCP mux through a tunnel, or a TURN server), and it is written here so it
 * is not discovered later by someone staring at a black rectangle.
 */

import { timingSafeEqual } from 'node:crypto'
import { readSessionById, type Queryable } from './sessions'

export const LIVE_PREFIX = '/live/'

/**
 * Session ids come from `newSessionToken`: base64url and nothing else.
 * Pinning the shape is what stops a crafted id from being read as a path, a
 * cookie name, or anything but an identifier.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{8,128}$/

/** Long enough to outlast a working session, short enough to expire. */
export const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60

/**
 * WHAT THE PAGE IS TOLD ITS PASSWORD IS.
 *
 * neko asks for its own password before it will connect, and it can be handed
 * one in the address (`?pwd=`), which it then strips from the URL itself. The
 * real view token still must not go there: it would sit in the request line
 * of the document, in our access log, and in the `Referer` every subresource
 * sends while the page is starting.
 *
 * So the address carries this placeholder, and the proxy swaps it for the
 * real token when the page posts it back to `/api/login`. After the first
 * redirect the token exists only in the cookie and on the server.
 */
export const LOGIN_PLACEHOLDER = 'proxied-by-the-broker'

/** neko will not connect without a display name; it is not an identity. */
export const DEFAULT_DISPLAY_NAME = 'you'

export function isLivePath(path: string): boolean {
  return path.startsWith(LIVE_PREFIX)
}

export interface LiveRequest {
  sessionId: string
  /** What to ask the pod for, always starting with a slash. */
  upstreamPath: string
  /** Present only on the first hop, before the cookie exists. */
  queryToken: string | null
  cookieToken: string | null
  /** Whether the address already carries the pod's auto-login parameters. */
  hasLoginParams: boolean
  /** True when this is the page itself rather than an asset or the socket. */
  isDocument: boolean
}

export function cookieNameFor(sessionId: string): string {
  return `blive_${sessionId}`
}

export function parseLive(
  rawUrl: string,
  cookieHeader?: string
): LiveRequest | null {
  const [pathPart, queryPart = ''] = rawUrl.split('?')
  if (!isLivePath(pathPart)) return null

  const rest = pathPart.slice(LIVE_PREFIX.length)
  const slash = rest.indexOf('/')
  const sessionId = slash === -1 ? rest : rest.slice(0, slash)
  if (!SAFE_ID.test(sessionId)) return null

  const tail = slash === -1 ? '' : rest.slice(slash)
  /*
   * `..` never reaches the pod. The upstream URL is built by concatenation,
   * so a traversal would fetch something other than what the path says.
   * Refuse rather than normalise: a refusal cannot be subtly wrong.
   */
  if (tail.includes('..')) return null

  const kept = new URLSearchParams(queryPart)
  const queryToken = kept.get('t')
  kept.delete('t')
  const suffix = kept.toString() ? `?${kept.toString()}` : ''

  return {
    sessionId,
    upstreamPath: (tail || '/') + suffix,
    queryToken,
    cookieToken: readCookie(cookieHeader, cookieNameFor(sessionId)),
    hasLoginParams: kept.has('pwd'),
    isDocument: tail === '' || tail === '/',
  }
}

/** Where the page must land for the pod to let it in without asking. */
export function loginUrlFor(sessionId: string): string {
  return (
    `${LIVE_PREFIX}${sessionId}/` +
    `?usr=${encodeURIComponent(DEFAULT_DISPLAY_NAME)}` +
    `&pwd=${encodeURIComponent(LOGIN_PLACEHOLDER)}`
  )
}

export function readCookie(
  header: string | undefined,
  name: string
): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

/** Length first, then constant time: the length of a token is not a secret. */
export function tokenMatches(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

export type LiveDecision =
  | { kind: 'redirect'; location: string; setCookie: string }
  | {
      kind: 'proxy'
      endpoint: string
      upstreamPath: string
      /** Server-side only: swapped into the pod login. Never serialised. */
      viewToken: string
      /**
       * Server-side only, and it never leaves this process: it is the pod's
       * admin password, used to reshape the desktop to the window the person
       * is watching in. A client that held it could change the room itself.
       */
      adminToken: string
    }
  | { kind: 'refuse'; status: number; message: string }

export interface AuthorizeOptions {
  /** True when the connection reached us over TLS; adds Secure to the cookie. */
  secure: boolean
}

export function cookieFor(
  sessionId: string,
  token: string,
  secure: boolean
): string {
  const bits = [
    `${cookieNameFor(sessionId)}=${encodeURIComponent(token)}`,
    `Path=${LIVE_PREFIX}${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ]
  if (secure) bits.push('Secure')
  return bits.join('; ')
}

/**
 * The whole gate, in one function, so there is exactly one place that answers
 * "may whoever is knocking see this browser".
 *
 * AN UNKNOWN SESSION AND A WRONG TOKEN GET THE SAME ANSWER. Telling them
 * apart would let anyone sweep session ids and learn which exist, and a
 * session id that exists is a browser someone is signed into. One refusal for
 * both, deliberately.
 */
export async function authorizeLive(
  pool: Queryable,
  req: LiveRequest,
  opts: AuthorizeOptions
): Promise<LiveDecision> {
  const token = req.queryToken || req.cookieToken
  if (!token) return { kind: 'refuse', status: 401, message: 'no token' }

  const session = await readSessionById(pool, req.sessionId)
  if (!session || !tokenMatches(token, session.viewToken)) {
    return { kind: 'refuse', status: 404, message: 'no such session' }
  }
  if (!session.podId || !session.endpoint || session.state !== 'live') {
    return { kind: 'refuse', status: 409, message: 'session is not running' }
  }

  /*
   * A token in the query string is spent here: cookie set, address cleaned.
   * The redirect also gives the page its trailing slash, without which every
   * relative asset would be asked for one directory too high.
   */
  /*
   * The page needs the auto-login parameters on EVERY load, not just the
   * first: neko strips `pwd` from the address as soon as it reads it, so a
   * reload lands on the bare path and the person is shown a password prompt
   * for a password they have never seen. Measured by reloading and watching
   * the form come back.
   *
   * Re-issuing the cookie here also refreshes how long it lives, so a browser
   * somebody keeps open does not expire out from under them.
   */
  if (req.queryToken || (req.isDocument && !req.hasLoginParams)) {
    return {
      kind: 'redirect',
      location: loginUrlFor(req.sessionId),
      setCookie: cookieFor(req.sessionId, token, opts.secure),
    }
  }

  return {
    kind: 'proxy',
    adminToken: session.adminToken,
    endpoint: session.endpoint,
    upstreamPath: req.upstreamPath,
    viewToken: session.viewToken,
  }
}
