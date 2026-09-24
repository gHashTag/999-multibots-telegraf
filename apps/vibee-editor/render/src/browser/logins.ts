/**
 * WHICH OF THE PERSON'S NETWORKS THEIR BROWSER IS SIGNED INTO (#2962).
 *
 * Owner, 2026-09-24: "connect every social network of mine, so the digital
 * clone can truly be called that". A clone that cannot say which of its
 * person's accounts it holds is not a clone -- and until now the only check
 * was a guess from page text during a round (`looksSignedOut`, rounds.ts),
 * which needs a page opened in front of the person to answer at all.
 *
 * The browser already knows: every network keeps its login in a cookie with
 * a name that network chose. So the pod is asked for its cookies on the
 * BROWSER socket -- no page is opened, the wheel is not touched -- and the
 * answer is reduced at once to one line per network: signed in, expired,
 * signed out.
 *
 * WHAT NEVER LEAVES THIS FUNCTION. Values are dropped in the first step,
 * before anything else looks at the list. Cookie NAMES do not leave either:
 * the answer carries networks and states, which is all "is the clone
 * connected" needs (the same rule as clone-readiness.ts: nothing but
 * booleans travels).
 *
 * WHAT IT DOES NOT CLAIM. A login cookie means the browser HOLDS a login,
 * not that the site still honours it -- X revokes sessions server-side, and
 * the cookie stays. The answer says so; opening the site is the proof.
 * Networks whose login cookie is not known here are reported as `unknown`,
 * never guessed as signed out: a wrong "signed out" sends the person to
 * sign in again to an account they already hold.
 */
import { browserWsUrl, callOnTarget } from './cdp'
import { readSession, type Queryable } from './sessions'

export type LoginState = 'signed_in' | 'expired' | 'signed_out' | 'unknown'

export interface Network {
  id: string
  /** What the person calls it. */
  name: string
  /** Registrable domains; a cookie counts on the domain or any subdomain. */
  domains: string[]
  /**
   * Cookie names that exist only while signed in. Empty = we do not know
   * this network's login cookie, and the answer is `unknown`.
   */
  auth: string[]
}

/**
 * The networks a clone speaks for. Only login cookies that are set by
 * signing in and cleared by signing out are listed; where that is not
 * certain, `auth` is empty and the network is reported as unknown.
 */
export const NETWORKS: Network[] = [
  { id: 'google', name: 'Google', domains: ['google.com'], auth: ['SID'] },
  {
    id: 'youtube',
    name: 'YouTube',
    domains: ['youtube.com'],
    auth: ['LOGIN_INFO'],
  },
  {
    id: 'x',
    name: 'X',
    domains: ['x.com', 'twitter.com'],
    auth: ['auth_token'],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    domains: ['linkedin.com'],
    auth: ['li_at'],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    domains: ['tiktok.com'],
    auth: ['sessionid', 'sid_tt'],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    domains: ['instagram.com'],
    auth: ['sessionid'],
  },
  {
    id: 'threads',
    name: 'Threads',
    domains: ['threads.net', 'threads.com'],
    auth: ['sessionid'],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    domains: ['facebook.com'],
    auth: ['c_user'],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    domains: ['reddit.com'],
    auth: ['reddit_session'],
  },
  {
    id: 'github',
    name: 'GitHub',
    domains: ['github.com'],
    auth: ['user_session'],
  },
  { id: 'vk', name: 'VK', domains: ['vk.com', 'vk.ru'], auth: ['remixsid'] },
  /* Used by the person's desks, login cookie not known here: unknown. */
  { id: 'hh', name: 'hh.ru', domains: ['hh.ru'], auth: [] },
  { id: 'upwork', name: 'Upwork', domains: ['upwork.com'], auth: [] },
  { id: 'habr', name: 'Habr', domains: ['habr.com'], auth: [] },
  { id: 'medium', name: 'Medium', domains: ['medium.com'], auth: [] },
]

/** What survives of a cookie: never its value. */
export interface CookieMark {
  name: string
  domain: string
  /** Seconds since the epoch; -1 or absent for a session cookie. */
  expires?: number
}

/**
 * The first step, and the only one that sees the raw list: everything but
 * name, domain and expiry is dropped. Pure.
 */
export function marksOf(raw: unknown): CookieMark[] {
  if (!Array.isArray(raw)) return []
  const out: CookieMark[] = []
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue
    const r = c as Record<string, unknown>
    if (typeof r.name !== 'string' || typeof r.domain !== 'string') continue
    out.push({
      name: r.name,
      domain: r.domain,
      ...(typeof r.expires === 'number' ? { expires: r.expires } : {}),
    })
  }
  return out
}

/** Does a cookie's domain belong to one of these? Lookalikes do not. Pure. */
export function onDomain(cookieDomain: string, domains: string[]): boolean {
  const host = String(cookieDomain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '')
  return domains.some(d => host === d || host.endsWith(`.${d}`))
}

export interface NetworkLogin {
  id: string
  name: string
  state: LoginState
}

/** One line per network, from the marks alone. Pure. */
export function loginsOf(
  marks: CookieMark[],
  nowMs: number,
  networks: Network[] = NETWORKS
): NetworkLogin[] {
  return networks.map(n => {
    if (!n.auth.length) return { id: n.id, name: n.name, state: 'unknown' }
    const held = marks.filter(
      m => n.auth.includes(m.name) && onDomain(m.domain, n.domains)
    )
    if (!held.length) return { id: n.id, name: n.name, state: 'signed_out' }
    /* A session cookie (no expiry) lives as long as the browser: it counts. */
    const alive = held.some(
      m =>
        typeof m.expires !== 'number' ||
        m.expires <= 0 ||
        m.expires * 1000 > nowMs
    )
    return { id: n.id, name: n.name, state: alive ? 'signed_in' : 'expired' }
  })
}

export const LOGINS_NOTE =
  'A login cookie means the browser holds a login, not that the site still honours it: ' +
  'browser_open on the site is the proof. unknown = this network keeps its login where ' +
  'we cannot tell; open it to see. To connect one, open its sign-in page and follow the ' +
  'sign-in playbook: the person types passwords and codes themselves (browser_ask_input).'

export interface LoginsIo {
  wsUrl: (endpoint: string) => Promise<string>
  call: (
    wsUrl: string,
    method: string,
    params?: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
}

/*
 * Reached through at CALL time, not at load: agent-tools.ts imports this
 * module, and a suite that mocks './cdp' partly (browser-guard.test.ts)
 * must not fail on a pod it never asks.
 */
const LOGINS_IO: LoginsIo = {
  wsUrl: endpoint => browserWsUrl(endpoint),
  call: (ws, method, params) => callOnTarget(ws, method, params),
}
let loginsIo: LoginsIo = LOGINS_IO

/** Tests talk to a fake pod; `undefined` puts the real one back. */
export function setLoginsIoForTests(io?: LoginsIo): void {
  loginsIo = io ?? LOGINS_IO
}

/**
 * Ask the pod. `Storage.getCookies` answers for the whole browser on its own
 * socket, the mirror of the `Storage.setCookies` that imports them
 * (cookie-import.ts); the raw answer goes straight into `marksOf`.
 */
export async function readLogins(
  cdpEndpoint: string,
  nowMs: number,
  io: LoginsIo = loginsIo
): Promise<NetworkLogin[]> {
  const ws = await io.wsUrl(cdpEndpoint)
  const got = await io.call(ws, 'Storage.getCookies', {})
  return loginsOf(marksOf(got.cookies), nowMs)
}

/**
 * The logins of ONE person's own browser, or null when it is not running.
 * The only door: the tool and the clone status both come through here, so
 * "whose pod" is decided in one place -- by the caller's own telegram id.
 */
export async function loginsOfPerson(
  q: Queryable,
  telegramId: string
): Promise<NetworkLogin[] | null> {
  const session = await readSession(q, telegramId)
  if (!session || session.state !== 'live' || !session.cdpEndpoint) return null
  return readLogins(session.cdpEndpoint, Date.now())
}
