/**
 * A LOGIN IS CHECKED BY USE, NOT BY ITS COOKIE'S NAME.
 *
 * `logins.ts` reads the browser's cookies and says "signed in" when the
 * network's login cookie is there. That is what the browser HOLDS. A site can
 * revoke the session on its side and leave the cookie in place -- X does --
 * and then every reader of `browser_logins` was told a lie it had no way to
 * see:
 *
 *   - the blog desk opened X's composer, landed on X's sign-in form, found no
 *     Post button and told the owner "the publish button was not found, the
 *     window is left open" -- a sign-in form left in his browser as litter;
 *   - the sign-in playbook answered "already signed in: do nothing".
 *
 * So the desks judge the login by what the site DID with it: a gated page
 * (a composer, a share form) that sent us to the network's own sign-in page is
 * a refusal, written down here. `loginsOfPerson` then says `refused` for that
 * network instead of `signed_in`.
 *
 * WHEN A REFUSAL STOPS COUNTING, without anybody clearing it by hand:
 *
 *   - The person signs in again. A new sign-in writes a new login cookie, and
 *     its expiry moves; the refusal carries the expiry it was seen with
 *     (`stampOf`), so a different one voids it. No value is kept, only the
 *     expiry the cookie list already shows.
 *   - The site lets a gated page through (`judgeUse` -> honoured).
 *   - A week passes (`REFUSAL_TTL_MS`): a refusal that old is history.
 *
 * WHAT IS STORED. The network, the expiry stamp, the wall's host and path
 * (never its query -- a sign-in URL can carry a one-time token), and the time.
 * Nothing that signs anybody in.
 */
import { NETWORKS, networkOfUrl, onDomain, type Network } from './logins'
import type { CookieMark, NetworkLogin } from './logins'
import type { Queryable } from './sessions'

/** A refusal older than this is not believed any more. */
export const REFUSAL_TTL_MS = 7 * 24 * 3600_000

/** Expiries are seconds with fractions; one second of slack, not exactness. */
const STAMP_SLACK_S = 1

/**
 * Each network's own sign-in pages, by path, on the network's own domains.
 * A challenge or checkpoint counts: the site is asking to confirm the login
 * before it lets the page through, which is the same answer.
 */
export const WALLS: Record<string, RegExp> = {
  x: /^\/(i\/flow\/(login|signup)|login|account\/access)(\/|$)/,
  linkedin: /^\/(login|authwall|uas\/login|checkpoint)(\/|$)/,
  threads: /^\/login(\/|$)/,
  instagram: /^\/(accounts\/login|challenge)(\/|$)/,
  facebook: /^\/(login|checkpoint)(\/|$|\.php)/,
  reddit: /^\/(login|account\/login)(\/|$)/,
  github: /^\/(login|session)(\/|$)/,
  tiktok: /^\/login(\/|$)/,
  vk: /^\/login(\/|$)/,
  google: /^\/(v3\/)?(signin|ServiceLogin)(\/|$)/,
  youtube: /^\/(v3\/)?(signin|ServiceLogin)(\/|$)/,
}

/** Google's sign-in lives on its own host, for YouTube as well. */
const GOOGLE_ACCOUNTS = 'accounts.google.com'

/**
 * Did a page asked for on `asked` end on that network's sign-in wall?
 * Opening the sign-in door ON PURPOSE is not a refusal, so an asked URL that
 * is itself a wall answers null. Pure.
 */
export function wallOf(
  asked: string,
  landed: string,
  networks: Network[] = NETWORKS
): Network | null {
  const net = networkOfUrl(asked, networks)
  if (!net || !WALLS[net.id]) return null
  if (isWall(net, asked)) return null
  return isWall(net, landed) ? net : null
}

function isWall(net: Network, url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const google = net.id === 'google' || net.id === 'youtube'
  const home = google
    ? u.host.toLowerCase() === GOOGLE_ACCOUNTS
    : onDomain(u.host, net.domains)
  return home && WALLS[net.id].test(u.pathname)
}

/** Host and path of a wall: its query never leaves. Pure. */
export function wallPlace(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`.slice(0, 200)
  } catch {
    return ''
  }
}

/**
 * The login's own mark: the latest expiry among the network's login cookies.
 * A new sign-in writes a new cookie and moves it. 0 = only session cookies,
 * null = no login cookie at all. Pure.
 */
export function stampOf(marks: CookieMark[], net: Network): number | null {
  const held = marks.filter(
    m => net.auth.includes(m.name) && onDomain(m.domain, net.domains)
  )
  if (!held.length) return null
  return Math.max(
    ...held.map(m =>
      typeof m.expires === 'number' && m.expires > 0 ? m.expires : 0
    )
  )
}

export interface Refusal {
  network: string
  /** `stampOf` when the site refused; null = no login cookie was held. */
  stamp: number | null
  /** Host and path of the sign-in page the site sent us to. */
  wall: string
  /** ISO time. */
  at: string
}

/**
 * The cookie answer, corrected by use: a `signed_in` whose login the site
 * refused -- with the SAME cookie, inside the week -- is `refused`. Every other
 * state stands as the cookies say. Pure.
 */
export function withUse(
  logins: NetworkLogin[],
  marks: CookieMark[],
  refusals: Refusal[],
  nowMs: number,
  networks: Network[] = NETWORKS
): NetworkLogin[] {
  return logins.map(l => {
    if (l.state !== 'signed_in') return l
    const r = refusals.find(x => x.network === l.id)
    const net = networks.find(n => n.id === l.id)
    if (!r || !net) return l
    const at = Date.parse(r.at)
    if (!Number.isFinite(at) || nowMs - at > REFUSAL_TTL_MS) return l
    const now = stampOf(marks, net)
    if (now === null || r.stamp === null) return l
    if (Math.abs(now - r.stamp) > STAMP_SLACK_S) return l
    return { ...l, state: 'refused', refusedAt: r.at }
  })
}

let tableReady = false

export async function ensureRefusals(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS browser_login_refusals (
       telegram_id text NOT NULL,
       network     text NOT NULL,
       stamp       double precision,
       wall        text NOT NULL,
       at          timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (telegram_id, network)
     )`,
    []
  )
  tableReady = true
}

/** Test seam: the cached flag would otherwise leak between test cases. */
export function resetRefusalsCache(): void {
  tableReady = false
}

/** This person's refusals inside the week; an unreadable table is none. */
export async function refusalsOf(
  q: Queryable,
  telegramId: string
): Promise<Refusal[]> {
  await ensureRefusals(q)
  const { rows } = await q.query(
    `SELECT network, stamp, wall, at FROM browser_login_refusals
      WHERE telegram_id = $1 AND at > now() - ($2::bigint * interval '1 millisecond')`,
    [telegramId, REFUSAL_TTL_MS]
  )
  return rows.map(r => ({
    network: String(r.network),
    stamp: r.stamp === null || r.stamp === undefined ? null : Number(r.stamp),
    wall: String(r.wall ?? ''),
    at: new Date(String(r.at)).toISOString(),
  }))
}

export type Use = { network: string; refused: boolean } | null

/**
 * One gated page's verdict, written down. Call it ONLY for a page that needs
 * the login to show (a composer, a share form): a public page that opens
 * signed out proves nothing, and its "honoured" would clear a real refusal.
 *
 * `marks` is read only when the site refused, for the stamp. Never throws:
 * the desk's own work goes on whatever the table does.
 */
export async function judgeUse(
  q: Queryable,
  telegramId: string,
  asked: string,
  landed: string,
  readMarks: () => Promise<CookieMark[]>
): Promise<Use> {
  const net = networkOfUrl(asked)
  if (!net || !WALLS[net.id]) return null
  try {
    await ensureRefusals(q)
    const wall = wallOf(asked, landed)
    if (wall) {
      const stamp = stampOf(await readMarks().catch(() => []), wall)
      await q.query(
        `INSERT INTO browser_login_refusals (telegram_id, network, stamp, wall, at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (telegram_id, network)
         DO UPDATE SET stamp = EXCLUDED.stamp, wall = EXCLUDED.wall, at = now()`,
        [telegramId, wall.id, stamp, wallPlace(landed)]
      )
      return { network: wall.id, refused: true }
    }
    /* Only a page that stayed on the network counts as let through. */
    let host = ''
    try {
      host = new URL(landed).host
    } catch {
      return null
    }
    if (!onDomain(host, net.domains)) return null
    await q.query(
      `DELETE FROM browser_login_refusals WHERE telegram_id = $1 AND network = $2`,
      [telegramId, net.id]
    )
    return { network: net.id, refused: false }
  } catch {
    return null
  }
}

/** The owner's line for a refused network: what happened, what to do. */
export function refusedLine(at?: string): string {
  const when = at ? ` (${at.slice(0, 16).replace('T', ' ')} UTC)` : ''
  return (
    `вход слетел: сайт попросил войти заново${when}, ничего не нажато — ` + // cyrillic-ok: told to the owner
    'войдите сами во вкладке «Браузер»' // cyrillic-ok: told to the owner
  )
}
