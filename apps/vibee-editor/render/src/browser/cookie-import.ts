/**
 * THE PERSON BRINGS THEIR LOGINS WITH THEM, IN ONE GO.
 *
 * Owner's request, 2026-09-21: signing in to every site again, by hand, in
 * a browser that is supposed to be yours, is the tedium that stops people
 * using it. So the person can export their own cookies from the browser on
 * their computer and drop the file in the app; the sessions land in THEIR
 * pod's browser and they are signed in wherever those cookies still work.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ──────────────────────────────────────
 *
 * Passwords never come this way. The owner's rule is that a person types a
 * secret themselves, inside the stream, and it reaches the pod and nothing
 * else -- so passwords in bulk go through the password manager inside the
 * pod (Bitwarden, unlocked by the person), not through this server.
 *
 * Cookies are session keys, and they DO pass through this server on their
 * way in -- in memory, for the length of one request. So:
 *   - only the PERSON may import (an agent key is refused at the route);
 *   - nothing is stored, and nothing is logged: the answer carries counts
 *     and site names, never a value;
 *   - the payload is capped, and anything malformed is skipped, not guessed.
 *
 * Some sites will still ask to sign in again -- Google and banks bind a
 * session to where it was made. That is their protection working, and the
 * app says so rather than promising otherwise.
 *
 * Three export formats are read, because those are what people have:
 *   - a JSON array (Cookie-Editor, EditThisCookie, and most extensions);
 *   - a JSON object with "cookies" (Playwright's storageState);
 *   - Netscape cookies.txt ("Get cookies.txt LOCALLY", curl, yt-dlp).
 */

import { browserWsUrl, callOnTarget } from './cdp'

/** Enough for everybody's real browser; small enough to refuse a dump. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_COOKIES = 5000

/** What Chromium's Storage.setCookies takes, minus what we never set. */
export interface CookieParam {
  name: string
  value: string
  domain?: string
  url?: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  expires?: number
}

export interface ParsedImport {
  cookies: CookieParam[]
  skipped: number
}

/* RFC 6265 token: no controls, separators or spaces in a cookie name. */
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const HOST = /^\.?[a-z0-9-]+(\.[a-z0-9-]+)*$/i

function sameSiteOf(raw: unknown): CookieParam['sameSite'] {
  const v = String(raw ?? '').toLowerCase()
  if (v === 'strict') return 'Strict'
  if (v === 'lax') return 'Lax'
  if (v === 'none' || v === 'no_restriction') return 'None'
  return undefined
}

function epochSeconds(raw: unknown): number | undefined {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return undefined
  /* Some exporters write milliseconds. */
  return n > 1e11 ? Math.floor(n / 1000) : n
}

/**
 * One exported cookie, from whichever shape it came in, into what Chromium
 * takes -- or null when it cannot be one.
 */
export function toCookieParam(
  raw: Record<string, unknown>,
  nowSec: number
): CookieParam | null {
  const name = raw.name
  const value = raw.value
  const domainRaw = raw.domain ?? raw.host
  if (typeof name !== 'string' || !COOKIE_NAME.test(name)) return null
  if (typeof value !== 'string' || /[\r\n]/.test(value)) return null
  if (typeof domainRaw !== 'string') return null
  const domain = domainRaw.trim().toLowerCase()
  if (!HOST.test(domain)) return null

  const path =
    typeof raw.path === 'string' && raw.path.startsWith('/') ? raw.path : '/'
  const secure = raw.secure === true || raw.secure === 'TRUE'
  const httpOnly = raw.httpOnly === true || raw.httpOnly === 'TRUE'
  const expires = epochSeconds(raw.expirationDate ?? raw.expires)
  /* A cookie already dead is not worth carrying. */
  if (expires !== undefined && expires < nowSec) return null

  let sameSite = sameSiteOf(raw.sameSite)
  /* Chromium refuses SameSite=None without Secure; drop the attribute. */
  if (sameSite === 'None' && !secure) sameSite = undefined

  const hostOnly =
    raw.hostOnly === true ||
    (raw.hostOnly === undefined && !domain.startsWith('.'))
  const bare = domain.replace(/^\./, '')
  const param: CookieParam = { name, value, path, secure, httpOnly }
  /*
   * A host-only cookie must stay host-only: set by URL, not by domain, or it
   * would start going to every subdomain too.
   */
  if (hostOnly) param.url = `${secure ? 'https' : 'http'}://${bare}${path}`
  else param.domain = `.${bare}`
  if (sameSite) param.sameSite = sameSite
  if (expires !== undefined) param.expires = expires
  return param
}

/** Netscape cookies.txt: seven tab-separated fields, #HttpOnly_ prefix. */
function fromCookiesTxt(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const line of text.split(/\r?\n/)) {
    let l = line
    let httpOnly = false
    if (l.startsWith('#HttpOnly_')) {
      httpOnly = true
      l = l.slice('#HttpOnly_'.length)
    } else if (l.startsWith('#') || !l.trim()) continue
    const f = l.split('\t')
    if (f.length < 7) {
      out.push({})
      continue
    }
    const [domain, includeSub, path, secure, expiry, name, ...rest] = f
    out.push({
      domain:
        includeSub === 'TRUE' && !domain.startsWith('.')
          ? `.${domain}`
          : domain,
      hostOnly: includeSub !== 'TRUE',
      path,
      secure: secure === 'TRUE',
      expires: expiry === '0' ? undefined : expiry,
      name,
      value: rest.join('\t'),
      httpOnly,
    })
  }
  return out
}

/**
 * Whatever the person dropped in, into cookies Chromium will take. Throws
 * only when the input is not an export at all; single bad entries are
 * skipped and counted.
 */
export function parseCookieExport(
  raw: string,
  nowSec = Math.floor(Date.now() / 1000)
): ParsedImport {
  if (Buffer.byteLength(raw) > MAX_IMPORT_BYTES) {
    throw new Error('the file is larger than a browser has cookies')
  }
  const text = raw.trim()
  let entries: unknown[]
  if (text.startsWith('[') || text.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('this is not a cookie export')
    }
    entries = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { cookies?: unknown })?.cookies)
        ? (parsed as { cookies: unknown[] }).cookies
        : []
  } else {
    entries = fromCookiesTxt(text)
  }
  if (entries.length === 0) throw new Error('there are no cookies in this file')
  if (entries.length > MAX_IMPORT_COOKIES) {
    throw new Error('the file is larger than a browser has cookies')
  }

  const cookies: CookieParam[] = []
  let skipped = 0
  for (const e of entries) {
    const c =
      e && typeof e === 'object'
        ? toCookieParam(e as Record<string, unknown>, nowSec)
        : null
    if (c) cookies.push(c)
    else skipped++
  }
  return { cookies, skipped }
}

/** Sites and how many cookies each got. Names of sites, never values. */
export function sitesOf(cookies: CookieParam[]): Record<string, number> {
  const count: Record<string, number> = {}
  for (const c of cookies) {
    const host = (c.domain ?? new URL(c.url!).host).replace(/^\./, '')
    count[host] = (count[host] ?? 0) + 1
  }
  return count
}

export interface ImportIo {
  wsUrl: (endpoint: string) => Promise<string>
  call: (
    wsUrl: string,
    method: string,
    params?: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
}

const IMPORT_IO: ImportIo = { wsUrl: browserWsUrl, call: callOnTarget }

/** Chromium takes a list; a few hundred at a time keeps each message small. */
export const IMPORT_BATCH = 500

/** Into the person's browser, for every tab, at once. */
export async function importCookies(
  cdpEndpoint: string,
  cookies: CookieParam[],
  io: ImportIo = IMPORT_IO
): Promise<void> {
  const ws = await io.wsUrl(cdpEndpoint)
  for (let i = 0; i < cookies.length; i += IMPORT_BATCH) {
    await io.call(ws, 'Storage.setCookies', {
      cookies: cookies.slice(i, i + IMPORT_BATCH),
    })
  }
}
