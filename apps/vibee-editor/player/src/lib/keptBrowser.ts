/**
 * THE BROWSER TAB STAYS OPEN WHILE THE PERSON LOOKS ELSEWHERE.
 *
 * Leaving the tab unmounted the page, and the window inside it with it:
 * coming back meant the document again, the engine's bundles again, the
 * socket, the ICE handshake and the first keyframe -- three to five seconds
 * every time somebody glanced at the feed and came back. The window is the
 * one screen in the app that is expensive to rebuild, so it is kept alive,
 * hidden, for a while after the person leaves.
 *
 * Not forever: a hidden window still streams video. After KEEP_BROWSER_MS
 * away it is let go, and the next visit rebuilds it as before.
 */

import { BROWSER_ROUTE } from './browserWatch'

/** Long enough for a look at the feed and back; short enough not to stream to nobody. */
export const KEEP_BROWSER_MS = 5 * 60 * 1000

export function isBrowserPath(pathname: string): boolean {
  return pathname === BROWSER_ROUTE || pathname.startsWith(`${BROWSER_ROUTE}/`)
}

/**
 * Should the page be mounted? It is while the person is on the tab, and
 * after they leave until KEEP_BROWSER_MS has passed. `leftAt` is when they
 * last left, null while they are on it or before they ever came.
 */
export function keepMounted(
  onBrowser: boolean,
  leftAt: number | null,
  now: number
): boolean {
  if (onBrowser) return true
  if (leftAt === null) return false
  return now - leftAt < KEEP_BROWSER_MS
}
