/**
 * WHAT THE BROWSER WINDOW SAYS ABOUT ITS CONNECTION.
 *
 * The window at /live/<id> posts `{ source: 't27-browser', state }` to its
 * parent when neko loses the connection (`reconnecting`), gives up
 * (`stuck`) or comes back (`connected`) -- render/src/browser/skin.ts,
 * WINDOW_EVENT and CONNECT_SCRIPT. Until it did, this tab showed a frozen
 * frame while neko retried, and after the session had been closed.
 *
 * Accepted only from our own origin AND our own frame: a message is data a
 * page can forge, and another frame on the page could send the same shape.
 */
export const WINDOW_EVENT = 't27-browser'

export type FrameState = 'reconnecting' | 'stuck' | 'connected'
const STATES: readonly FrameState[] = ['reconnecting', 'stuck', 'connected']

export interface MessageLike {
  origin: string
  source: unknown
  data: unknown
}

export function frameStateOf(
  event: MessageLike,
  frameWindow: unknown,
  ownOrigin: string
): FrameState | null {
  if (event.origin !== ownOrigin) return null
  if (!frameWindow || event.source !== frameWindow) return null
  const d = event.data as { source?: unknown; state?: unknown } | null
  if (!d || typeof d !== 'object' || d.source !== WINDOW_EVENT) return null
  return STATES.includes(d.state as FrameState) ? (d.state as FrameState) : null
}

/** A window that lost its connection may be a session that ended: ask. */
export const shouldReread = (state: FrameState | null): boolean =>
  state === 'reconnecting' || state === 'stuck'
