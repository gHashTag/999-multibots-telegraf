/**
 * WHAT THE BROWSER WINDOW SAYS ABOUT ITS CONNECTION.
 *
 * The window at /live/<id> posts `{ source: 't27-browser', state }` to its
 * parent when neko loses the connection (`reconnecting`), gives up
 * (`stuck`), comes back (`connected`), or keeps its socket while no new frame
 * arrives (`frozen`) -- render/src/browser/skin.ts, WINDOW_EVENT,
 * CONNECT_SCRIPT and FREEZE_SCRIPT. Until it did, this tab showed a frozen
 * frame while neko retried, and after the session had been closed.
 *
 * Accepted only from our own origin AND our own frame: a message is data a
 * page can forge, and another frame on the page could send the same shape.
 */
export const WINDOW_EVENT = 't27-browser'

export type FrameState = 'reconnecting' | 'stuck' | 'connected' | 'frozen'
const STATES: readonly FrameState[] = [
  'reconnecting',
  'stuck',
  'connected',
  'frozen',
]

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

/**
 * A window that lost its connection, or whose picture stopped, may be a
 * session that ended or a pod that went down: ask.
 */
export const shouldReread = (state: FrameState | null): boolean =>
  state === 'reconnecting' || state === 'stuck' || state === 'frozen'

/**
 * A tap report from inside the window (render skin.ts TOUCH_REPORT_SCRIPT):
 * what lay under the finger and neko's idea of who controls. Only from the
 * framed window itself, only the known fields, as one line for the log.
 * Pure; null for anything else.
 */
export function touchReportOf(
  event: MessageLike,
  frameWindow: unknown,
  ownOrigin: string
): string | null {
  if (event.origin !== ownOrigin) return null
  if (!frameWindow || event.source !== frameWindow) return null
  const d = event.data as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || d.source !== WINDOW_EVENT) return null
  if (d.report !== 'touch') return null
  const pick = (v: unknown) =>
    typeof v === 'string' ? v.slice(0, 80) : v === null ? null : undefined
  const neko =
    d.neko && typeof d.neko === 'object'
      ? Object.fromEntries(
          ['hosting', 'controlling', 'locked', 'implicit'].map(k => [
            k,
            Boolean((d.neko as Record<string, unknown>)[k]),
          ])
        )
      : null
  return JSON.stringify({
    pointer: pick(d.pointer),
    at: pick(d.at),
    target: pick(d.target),
    overlay: pick(d.overlay),
    neko,
  })
}
