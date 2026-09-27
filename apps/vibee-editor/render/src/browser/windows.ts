/**
 * EVERY DESK GETS A WINDOW, SO THE AGENTS WORK SIDE BY SIDE.
 *
 * Owner, 2026-09-23: "think about how to run different agents in different
 * windows in parallel -- that way we get more done. Scaling."
 *
 * WHAT THE BOTTLENECK ACTUALLY IS. Not the number of agents: one person has
 * ONE browser, with ONE profile, and that is deliberate -- the logins live
 * there, and a second browser would mean a second copy of somebody's
 * accounts. What agents were fighting over is smaller than a browser: the
 * one tab the tools act in (front-page.ts). So each desk gets a WINDOW of
 * its own in that same browser: same profile, same logins, no extra pod, no
 * duplicated cookies -- and the windows are tiled, so the person watching
 * sees both agents working at once rather than one hiding the other.
 *
 * WHAT IS STILL SHARED, and must be:
 *  - the person's wheel: while they drive, every desk stands still;
 *  - the pod's memory, which is why the number of windows is capped and each
 *    desk closes its window when it is done (Chromium died today with a
 *    dozen tabs open);
 *  - the keyboard: only one window has focus, so TYPING is never parallel.
 *    Rounds only look, so this costs nothing; anything that types runs alone.
 */
import { browserWsUrl, callOnTarget, onPage } from './cdp'

export interface Bounds {
  left: number
  top: number
  width: number
  height: number
}

/** How many windows may work at once, whatever the caller asks for. */
export const MAX_WINDOWS = 3

/**
 * Where the n-th of `of` windows sits on a screen: side by side, in equal
 * columns, full height. Pure -- the arithmetic is the whole design, and it
 * is worth a test rather than a screenshot.
 */
export function tileBounds(
  screen: { width: number; height: number },
  index: number,
  of: number
): Bounds {
  const columns = Math.min(Math.max(1, Math.round(of)), MAX_WINDOWS)
  const at = Math.min(Math.max(0, Math.round(index)), columns - 1)
  const width = Math.max(320, Math.floor(screen.width / columns))
  return {
    left: at * width,
    top: 0,
    /* The last column takes the rounding remainder, so nothing is left bare. */
    width: at === columns - 1 ? screen.width - at * width : width,
    height: screen.height,
  }
}

/** A window of its own, already at the address. Returns its target id. */
export async function openWindow(
  endpoint: string,
  url: string
): Promise<string> {
  const out = await callOnTarget(
    await browserWsUrl(endpoint),
    'Target.createTarget',
    {
      url,
      newWindow: true,
    }
  )
  const id = (out as { targetId?: unknown }).targetId
  if (typeof id !== 'string' || !id) throw new Error('no window was opened')
  return id
}

/** Put that window in its column. Never throws: a tile is a nicety. */
export async function tileWindow(
  endpoint: string,
  targetId: string,
  bounds: Bounds
): Promise<void> {
  try {
    const ws = await browserWsUrl(endpoint)
    const got = await callOnTarget(ws, 'Browser.getWindowForTarget', {
      targetId,
    })
    const windowId = (got as { windowId?: unknown }).windowId
    if (typeof windowId !== 'number') return
    await callOnTarget(ws, 'Browser.setWindowBounds', {
      windowId,
      bounds: { ...bounds, windowState: 'normal' },
    })
  } catch (e) {
    console.warn('[browser:windows] not tiled:', String(e).slice(0, 160))
  }
}

/** Take that window to an address and wait for the load to be under way. */
export async function goTo(
  endpoint: string,
  targetId: string,
  url: string
): Promise<void> {
  await onPage(endpoint, targetId, call => call('Page.navigate', { url }))
}

/** Close the window. Never throws: a window left open is not a failure. */
export async function closeWindow(
  endpoint: string,
  targetId: string
): Promise<void> {
  try {
    await callOnTarget(await browserWsUrl(endpoint), 'Target.closeTarget', {
      targetId,
    })
  } catch (e) {
    console.warn('[browser:windows] not closed:', String(e).slice(0, 160))
  }
}

export interface DeskWindowDeps {
  /** Opens a window already at the address; returns its target id. */
  open: (url: string) => Promise<string>
  /** Puts it in its column. Best effort: a tile is a nicety. */
  tile: (targetId: string) => Promise<void>
  /** Takes the window it already has to another address. */
  goTo: (targetId: string, url: string) => Promise<void>
  /** Whether that window is still there -- a restart takes it away. */
  alive: (targetId: string) => Promise<boolean>
  /** Closes it. Best effort. */
  close: (targetId: string) => Promise<void>
  /** Test seam: the pause before a second attempt at opening. */
  wait?: (ms: number) => Promise<void>
}

/** A refused connect at the start of a round is worth one more try. */
export const REOPEN_WAIT_MS = 1500

export interface DeskWindow {
  /** The desk's window, at that address. Opens and tiles it once. */
  at: (url: string) => Promise<string>
  /** Gives the window back; the person's other windows are untouched. */
  close: () => Promise<void>
}

/**
 * ONE WINDOW PER DESK, OPENED AND TILED ONCE.
 *
 * What was here before tiled on EVERY look: the round opened a fresh TAB per
 * site (`newPage`) and then moved the window that tab happened to land in.
 * Tabs share a window, so both desks were moving the SAME window -- twelve
 * calls per round, each overwriting the other's column, and the person
 * watching saw one window hopping about instead of two side by side. The
 * window helpers written for this (`openWindow`, `goTo`, `closeWindow`) had no
 * caller at all.
 *
 * Measured in deployment c9316cf7 (2026-09-26, the 21:30Z round): twelve looks,
 * two `not tiled: connect ECONNREFUSED ...:9223` in the first half-second and
 * ten silent wins -- so the address was right and the pod was merely not
 * listening yet. Opening once per round makes that one moment matter, so the
 * first attempt is retried once; the tile around it stays best effort.
 *
 * Pure control flow -- every call is injected, so the reuse, the reopen after a
 * restart and the retry are tested without a browser.
 */
export function deskWindow(d: DeskWindowDeps): DeskWindow {
  const wait = d.wait ?? (ms => new Promise<void>(r => setTimeout(r, ms)))
  let id: string | null = null

  const openAndTile = async (url: string): Promise<string> => {
    let opened: string
    try {
      opened = await d.open(url)
    } catch (e) {
      /* The pod may still be coming up; one more try, then it is a real fault. */
      console.warn('[browser:windows] reopening:', String(e).slice(0, 160))
      await wait(REOPEN_WAIT_MS)
      opened = await d.open(url)
    }
    id = opened
    await d.tile(opened)
    return opened
  }

  return {
    at: async url => {
      if (id === null) return await openAndTile(url)
      /* A browser restart mid-round takes the window with it. */
      if (!(await d.alive(id).catch(() => false))) {
        id = null
        return await openAndTile(url)
      }
      await d.goTo(id, url)
      return id
    },
    close: async () => {
      const mine = id
      id = null
      if (mine !== null) await d.close(mine).catch(() => {})
    },
  }
}

/**
 * Run the work of several desks at once, at most `limit` of them, keeping
 * the results in the order the desks were given. Pure control flow: the
 * work itself is injected, so the limit is tested without a browser.
 */
export async function sideBySide<T, R>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const cap = Math.min(Math.max(1, Math.round(limit)), MAX_WINDOWS)
  const out: R[] = new Array(items.length)
  let next = 0
  const runner = async (): Promise<void> => {
    for (;;) {
      const mine = next++
      if (mine >= items.length) return
      out[mine] = await work(items[mine], mine)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(cap, items.length) }, () => runner())
  )
  return out
}
