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
