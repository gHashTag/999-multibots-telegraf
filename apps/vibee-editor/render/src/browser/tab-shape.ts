/**
 * EVERY TAB'S SHAPE, READ WHERE IT LIES: NOTHING FRONTED, NO VISIT STARTED.
 *
 * `tri browser doctor` (#3392) could honestly read only the front tab. Every
 * agent tool acts on the front page, so reading the others meant bringing them
 * forward one by one -- driving the person's screen -- and a read with no visit
 * on record STARTS a visit and messages the owner (liveSession). That is how a
 * "read-only" check wrote to him at 02:36 on 2026-10-03.
 *
 * CDP does not need the front for a read: `Runtime.evaluate` runs in a
 * background target as well (cdp.ts `evaluateOn`), and `browser_status`
 * already reaches the pod without a visit (podToLookAt). So the sweep lives on
 * the server, behind `browser_status {shape: true}`, and returns COUNTS only --
 * nodes, characters, unsent composer characters -- never the text itself.
 *
 * WHAT IT DOES NOT READ, and says so per page rather than going quiet:
 *  - a sensitive place (guard.ts): running code there needs the person's
 *    fresh yes, and a sweep has none;
 *  - the browser's own pages (chrome://, extensions): not the web.
 *
 * STALE IS CHECKED ONLY ON OUR OWN SITES, WITHOUT COOKIES. The front-tab
 * version re-fetched any page with the person's cookies (a review nit on
 * #3392), and a URL like Instagram's two-step page carries a one-time context
 * a second GET might spend. Our own pages are public, so `credentials: omit`
 * gives the same HTML, and a stale bundle after a deploy -- the bug this
 * check was born for -- only matters to us on our own sites.
 */
import { ruleFor, type SiteRule, type SiteRuleRow } from './site-rules'
import { isSensitive } from './guard'

/** Hosts whose bundle staleness we check: ours, public, cookie-free. */
export function isOwnSite(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'https:') return false
    return hostname === 't27.ai' || hostname.endsWith('.t27.ai')
  } catch {
    return false
  }
}

/**
 * Why a page is not read, or null when it may be. Pure. `own` is the person's
 * rule for this page (site-rules.ts): block is not even looked at, ask is a
 * bank.
 */
export function skipReason(
  url: string,
  own: SiteRule | null = null
): string | null {
  let protocol = ''
  try {
    protocol = new URL(url).protocol
  } catch {
    return 'unreadable address'
  }
  if (!/^https?:$/.test(protocol)) return 'not a web page'
  if (own === 'block') return "blocked on the person's site list"
  if (own === 'ask' || isSensitive(url))
    return 'sensitive place: reading code needs a fresh yes'
  return null
}

/**
 * Runs inside the page. Counts only. `stale` = a module the site serves NOW
 * is missing from the tab -- a subset test, because modules a page injects at
 * runtime are extra, not stale (#3392).
 */
export function shapeExpression(checkStale: boolean): string {
  return `new Promise(done => {
  const v = { ready: document.readyState,
    nodes: document.querySelectorAll("*").length,
    text: (document.body && document.body.innerText || "").trim().length };
  v.draft = [...document.querySelectorAll("[data-testid^=\\"tweetTextarea_\\"]")]
    .filter(b => /^tweetTextarea_\\d+$/.test(b.getAttribute("data-testid")))
    .reduce((n, b) => n + (b.innerText || "").trim().length, 0);
  const mine = [...document.scripts].filter(s => s.type === "module" && s.src).map(s => new URL(s.src).pathname);
  if (!${checkStale ? 'true' : 'false'} || !mine.length) return done(v);
  setTimeout(() => done(v), 8000);
  fetch(location.href, { cache: "no-store", credentials: "omit" }).then(r => r.text()).then(html => {
    const now = [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("script[type=module][src]")]
      .map(s => new URL(s.getAttribute("src"), location.href).pathname);
    v.stale = now.some(p => !mine.includes(p));
    done(v);
  }).catch(() => done(v));
})`
}

export type Anomaly = 'blank' | 'stale' | 'draft'

export interface TabShape {
  id: string
  url: string
  /** Set when the page was not read; says why. */
  unread?: string
  nodes?: number
  text?: number
  /** Characters typed into X's composer and not sent. */
  draft?: number
  /** Only on our own sites; absent when not checked. */
  stale?: boolean
  anomalies: Anomaly[]
}

/** The page's answer, checked, turned into anomalies. Never throws. Pure. */
export function judgeShape(
  page: { id: string; url: string },
  raw: unknown
): TabShape {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const num = (x: unknown) =>
    typeof x === 'number' && Number.isFinite(x) ? x : undefined
  const out: TabShape = {
    id: page.id,
    url: page.url,
    nodes: num(v.nodes),
    text: num(v.text),
    draft: num(v.draft) ?? 0,
    anomalies: [],
  }
  if (typeof v.stale === 'boolean') out.stale = v.stale
  if (out.nodes === undefined) {
    out.unread = 'page gave no answer'
    return out
  }
  if (v.ready === 'complete' && out.text === 0) out.anomalies.push('blank')
  if (out.stale) out.anomalies.push('stale')
  if ((out.draft ?? 0) > 0) out.anomalies.push('draft')
  return out
}

export interface ShapeIo {
  evaluate: (cdp: string, id: string, expression: string) => Promise<unknown>
}

/** Per page, so one hung renderer cannot hold the others. */
export const SHAPE_TIMEOUT_MS = 12_000

/**
 * Every listed page, in parallel, each bounded. A page that throws or hangs is
 * reported as unread with the reason -- not mislabelled as the guard (the
 * front-tab version printed every failure as "guard refused").
 */
export async function shapeOfTabs(
  cdp: string,
  pages: { id: string; url: string }[],
  io: ShapeIo,
  timeoutMs: number = SHAPE_TIMEOUT_MS,
  /* The person's site list; null = unreadable, so no page is read. */
  rules: SiteRuleRow[] | null = []
): Promise<TabShape[]> {
  return await Promise.all(
    pages.map(async page => {
      const skip =
        rules === null
          ? "the person's site list could not be read"
          : skipReason(page.url, ruleFor(page.url, rules))
      if (skip)
        return { id: page.id, url: page.url, unread: skip, anomalies: [] }
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const raw = await Promise.race([
          io.evaluate(cdp, page.id, shapeExpression(isOwnSite(page.url))),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`no answer in ${timeoutMs / 1000} s`)),
              timeoutMs
            )
          }),
        ])
        return judgeShape(page, raw)
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e)
        return {
          id: page.id,
          url: page.url,
          unread: `page did not answer: ${why.slice(0, 120)}`,
          anomalies: [] as Anomaly[],
        }
      } finally {
        if (timer) clearTimeout(timer)
      }
    })
  )
}
