/**
 * THE SITES INSIDE A PAGE: FRAMES, AND WHERE A TAB REALLY LANDED.
 *
 * Found 2026-10-03, reading the guards against what a page can hold. Every
 * check -- the person's list (site-rules.ts) and the place guard (guard.ts)
 * -- judged the TAB's address. A page is more than its address:
 *
 * 1. A PAYMENT FORM IS AN IFRAME. A shop on an unguarded domain embeds
 *    js.stripe.com; the "Pay" button lives in that frame. browser_click at
 *    its x,y judged the shop, not stripe.com, and went through with no yes --
 *    the bank rule, walked around by one <iframe>.
 * 2. A BLOCKED SITE CAN BE EMBEDDED. A page that embeds x.com, when the
 *    person blocked x.com, was shot and clicked into as if x.com were not
 *    there: "not even a look" held for tabs only.
 * 3. A REDIRECT LANDS ELSEWHERE. browser_open judged the address it was
 *    given and answered with the tab as Chromium first reported it; a link
 *    shortener or a 302 to a blocked site was opened, and its address handed
 *    back to the agent.
 *
 * WHICH FRAME A CLICK LANDS IN IS ASKED OF CHROMIUM, NOT OF THE PAGE
 * (cdp.ts frameAtPoint: DOM.getNodeForLocation + DOM.describeNode). The bee
 * on #3507 broke the first version, which asked the page: a frame put in a
 * CLOSED shadow root is invisible to page script, and a page can override
 * `getBoundingClientRect` to report the Stripe frame at -9999,-9999. The
 * browser's own hit-test pierces closed shadow roots, honours z-order and
 * `pointer-events: none` the way a real press does, and cannot be lied to;
 * the frame id it names IS the iframe target id in Chromium's list, so the
 * address judged is the frame's current one, not its src.
 *
 * When that call fails, the old two reads are the fallback, and they fail
 * closed:
 * - the DOM (FRAMES_PROBE): every iframe/frame/embed/object with its box, its
 *   src, and -- when same-origin -- where it is now; and which one has focus;
 * - Chromium's own list: a cross-origin frame runs as its own target
 *   ("iframe", with `parentId`), carrying its CURRENT address. Every such
 *   address the DOM cannot account for joins the reach of EVERY click and
 *   every keystroke on that page, hit or no hit: a frame the probe cannot
 *   see may be exactly where the act lands.
 *
 * Typing has no hit-test. Its reach is the probe's focused frame, every
 * cross-origin frame the probe cannot account for, and every risky
 * cross-origin frame that says, in its OWN world (which the embedding page
 * does not control), that focus is in it (agent-tools.ts).
 *
 * NAMED LIMITS. A same-site frame of a different origin, hidden from the
 * probe, falls back to "same-site as the page" when the hit-test fails. A
 * page that lies to the probe about a frame it does list, while the pod's
 * window has no system focus (`document.hasFocus()` false everywhere), can
 * hide where typing goes. A click into a cross-origin frame that itself
 * holds frames is judged against all of them: the hit-test stops at that
 * frame's door.
 */
import { ruleFor, type SiteRuleRow } from './site-rules'

/** One frame of a page, as the probe saw it. */
export interface SeenFrame {
  /** Where it is now if readable (same-origin), else its src; '' unknown. */
  url: string
  /** True when its document could not be read: the url is only its src. */
  crossOrigin: boolean
  /** Its box in the TOP page's viewport, CSS px (what clickAt takes). */
  x: number
  y: number
  w: number
  h: number
  /** How deep: 1 = in the top page, 2 = in a frame of it, ... */
  depth: number
  /** On the focus chain: typing goes into this frame. */
  focused: boolean
}

/**
 * Run on the top page (evaluateOn). Walks open shadow roots and same-origin
 * child documents; a cross-origin frame is listed with its src and not
 * entered. Returns { frames: SeenFrame[] }.
 */
export const FRAMES_PROBE = `(() => {
  const out = []
  const walk = (doc, ox, oy, depth) => {
    const els = []
    const collect = root => {
      for (const el of root.querySelectorAll('*')) {
        if (/^(IFRAME|FRAME|EMBED|OBJECT)$/.test(el.tagName)) els.push(el)
        if (el.shadowRoot) collect(el.shadowRoot)
      }
    }
    collect(doc)
    let a = doc.activeElement
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement
    for (const el of els) {
      const r = el.getBoundingClientRect()
      let url = '', crossOrigin = false, inner = null
      try {
        inner = el.contentDocument || null
        url = inner ? String(el.contentWindow.location.href) : ''
      } catch (e) { inner = null }
      if (!inner) {
        crossOrigin = !!(el.src || el.data)
        url = String(el.src || el.data || '')
      }
      const focused = a === el
      const x = ox + r.left, y = oy + r.top
      out.push({ url, crossOrigin, x, y, w: r.width, h: r.height, depth, focused })
      if (inner && depth < 6) walk(inner, x + (el.clientLeft || 0), y + (el.clientTop || 0), depth + 1)
    }
  }
  walk(document, 0, 0, 1)
  return { frames: out }
})()`

/** The probe's answer, defensively: anything malformed is no frame. */
export function framesOf(raw: unknown): SeenFrame[] {
  const list = (raw as { frames?: unknown } | null)?.frames
  if (!Array.isArray(list)) return []
  return list.flatMap(f => {
    if (!f || typeof f !== 'object') return []
    const o = f as Record<string, unknown>
    const n = (k: string) => (typeof o[k] === 'number' ? (o[k] as number) : NaN)
    if (typeof o.url !== 'string') return []
    const frame: SeenFrame = {
      url: o.url,
      crossOrigin: o.crossOrigin === true,
      x: n('x'),
      y: n('y'),
      w: n('w'),
      h: n('h'),
      depth: Number.isFinite(n('depth')) ? n('depth') : 1,
      focused: o.focused === true,
    }
    return [frame]
  })
}

/** A target as Chromium lists it (cdp.ts listTargets keeps every field). */
export interface ListedTarget {
  id: string
  type: string
  url: string
  parentId?: string
}

/**
 * The current addresses of the cross-origin frames of page `pageId`: every
 * "iframe" target whose parent chain reaches the page.
 */
export function framesOfTarget(
  targets: ListedTarget[],
  pageId: string
): string[] {
  return frameTargetsOf(targets, pageId).map(t => t.url)
}

/** The same, as targets: their ids are what a frame can be asked through. */
export function frameTargetsOf(
  targets: ListedTarget[],
  pageId: string
): ListedTarget[] {
  const byId = new Map(targets.map(t => [t.id, t]))
  const under = (t: ListedTarget): boolean => {
    const seen = new Set<string>()
    let p = t.parentId
    while (p && !seen.has(p)) {
      if (p === pageId) return true
      seen.add(p)
      p = byId.get(p)?.parentId
    }
    return false
  }
  return targets.filter(t => t.type === 'iframe' && under(t))
}

function hrefOf(url: string): string {
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

/** A frame's address worth judging: the web only (about:blank is the page's own). */
export function isWeb(url: string): boolean {
  try {
    return /^https?:$/.test(new URL(url).protocol)
  } catch {
    return false
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * Every web address the page embeds: what the DOM says plus what Chromium
 * says. Used by the shot and by the whole-screen shot.
 */
export function embeddedUrls(frames: SeenFrame[], oopif: string[]): string[] {
  return [...new Set([...frames.map(f => f.url), ...oopif])].filter(isWeb)
}

/** The first embedded address on a blocked site, or null. */
export function blockedEmbed(
  urls: string[],
  rules: SiteRuleRow[]
): string | null {
  return urls.find(u => ruleFor(u, rules) === 'block') ?? null
}

/**
 * THE ADDRESSES AN ACT INSIDE A FRAME REACHES. `pick` chooses the frame (the
 * one under the point, or the focused one); nested frames are entered, the
 * deepest wins. Every Chromium-side frame address that no DOM frame accounts
 * for joins too, whatever was picked: a frame hidden from the probe (closed
 * shadow root) or one that navigated away from its src is unknown in place,
 * so it is in reach of every act (the bee on #3507).
 * Empty: the act lands on the top page itself.
 */
export function addressesOfAct(
  frames: SeenFrame[],
  oopif: string[],
  pick: (f: SeenFrame) => boolean
): string[] {
  const hit = frames
    .filter(pick)
    .sort((a, b) => b.depth - a.depth)
    .at(0)
  const own = hit && isWeb(hit.url) ? [hit.url] : []
  const known = new Set(frames.map(f => originOf(f.url)).filter(Boolean))
  const unaccounted = oopif.filter(u => isWeb(u) && !known.has(originOf(u)))
  return [...new Set([...own, ...unaccounted])]
}

/** Is the point inside the frame's box? */
export function under(x: number, y: number): (f: SeenFrame) => boolean {
  return f =>
    Number.isFinite(f.x + f.y + f.w + f.h) &&
    f.w > 0 &&
    f.h > 0 &&
    x >= f.x &&
    x < f.x + f.w &&
    y >= f.y &&
    y < f.y + f.h
}

/** Is typing going into this frame? */
export const focused = (f: SeenFrame): boolean => f.focused

/**
 * WHERE THE TAB LANDED. Chromium reports a new tab at the address asked for
 * and updates it when the navigation commits, so a 302 or a shortener shows
 * up a moment later. Polls until the address holds still twice (or `tries`
 * runs out) and returns every address seen on the way.
 *
 * What "seen" can and cannot hold. A JavaScript or meta redirect commits a
 * page, so a hop that lives at least one look is in it: a chain that passed
 * through a blocked site that way still went there. A server's 302 usually
 * never commits -- Chromium follows it inside one navigation -- so a 302
 * hop is NOT seen; only where it lands is.
 *
 * Still on the address ASKED needs four equal looks, not two: a redirect
 * server slower than two looks (~800 ms) used to settle the wait on the
 * shortener itself, and the agent was handed the shortener's address. Four
 * looks (~1.6 s) is the cost, paid only when the person's list blocks
 * something; a slower redirect is still caught by the guards that read the
 * tab's address before every act.
 */
export async function landing(
  read: () => Promise<string | null>,
  sleep: (ms: number) => Promise<void> = ms =>
    new Promise(r => setTimeout(r, ms)),
  tries = 6,
  stepMs = 400,
  asked: string | null = null
): Promise<{ landed: string | null; seen: string[] }> {
  const seen: string[] = []
  let last: string | null = null
  let same = 0
  /* Chromium reports "https://a.com" as "https://a.com/": compare as it will. */
  const home = asked === null ? null : hrefOf(asked)
  for (let i = 0; i < tries; i++) {
    await sleep(stepMs)
    const now = await read().catch(() => null)
    if (now && !seen.includes(now)) seen.push(now)
    same = i > 0 && now === last ? same + 1 : 0
    /* Equal looks: settled. Two nulls: the tab is gone or unlisted. */
    if (same >= (now !== null && now === home ? 3 : 1) && now !== 'about:blank')
      return { landed: now, seen }
    last = now
  }
  return { landed: last, seen }
}
