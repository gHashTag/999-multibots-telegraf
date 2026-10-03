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
 * What a frame IS, is read two ways, because neither is enough alone:
 * - the DOM (FRAMES_PROBE): every iframe/frame/embed/object with its box, its
 *   src, and -- when same-origin -- where it is now; and which one has focus;
 * - Chromium's own list: a cross-origin frame runs as its own target
 *   ("iframe", with `parentId`), carrying its CURRENT address. A frame that
 *   navigated away from its src is known only there, so a click into a
 *   cross-origin frame is also judged against every such address the DOM
 *   cannot account for (fail closed: we cannot tell which frame it is).
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
  return targets.filter(t => t.type === 'iframe' && under(t)).map(t => t.url)
}

/** A frame's address worth judging: the web only (about:blank is the page's own). */
function isWeb(url: string): boolean {
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
 * deepest wins. A cross-origin frame's src may be stale, so it also brings
 * every Chromium-side frame address that no DOM frame accounts for.
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
  if (!hit) return []
  const own = isWeb(hit.url) ? [hit.url] : []
  if (!hit.crossOrigin) return own
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
 * runs out) and returns EVERY address seen on the way: a chain that passed
 * through a blocked site and came back out still went there.
 */
export async function landing(
  read: () => Promise<string | null>,
  sleep: (ms: number) => Promise<void> = ms =>
    new Promise(r => setTimeout(r, ms)),
  tries = 6,
  stepMs = 400
): Promise<{ landed: string | null; seen: string[] }> {
  const seen: string[] = []
  let last: string | null = null
  for (let i = 0; i < tries; i++) {
    await sleep(stepMs)
    const now = await read().catch(() => null)
    if (now && !seen.includes(now)) seen.push(now)
    /* Two equal looks: settled. Two nulls: the tab is gone or unlisted. */
    if (i > 0 && now === last && now !== 'about:blank')
      return { landed: now, seen }
    last = now
  }
  return { landed: last, seen }
}
