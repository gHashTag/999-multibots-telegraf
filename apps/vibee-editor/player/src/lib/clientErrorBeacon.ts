import { API_BASE } from '../config'
import { authHeaders } from './apiFetch'

/**
 * A failure the person saw must reach the owner.
 *
 * 08.09.2026: the agent chat showed "Network unavailable: TypeError: Load
 * failed" while the server was being replaced; the request never arrived, so
 * no server-side alert existed, and the owner learned about it as a customer.
 * This is the browser's way to say what happened. Failures are queued in
 * localStorage when the server itself is unreachable (that is the common case)
 * and flushed on the next start, so the report survives the outage it
 * describes. The server dedups and caps -- this side only reports.
 */
const QUEUE_KEY = 'trinity.client-errors.queue'
const QUEUE_MAX = 20
const SESSION_DEDUP = new Set<string>()

export interface ClientErrorInput {
  kind: string
  message: string
  context?: string
}

function queue(): Array<Record<string, unknown>> {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveQueue(items: Array<Record<string, unknown>>): void {
  try {
    window.localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(items.slice(-QUEUE_MAX))
    )
  } catch {
    /* storage may be unavailable; the report is then lost, never thrown */
  }
}

function payload(input: ClientErrorInput): Record<string, unknown> {
  return {
    kind: input.kind,
    message: String(input.message).slice(0, 400),
    context: (input.context ?? '').slice(0, 600),
    path: typeof location !== 'undefined' ? location.pathname : '',
    ua:
      typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 160) : '',
    build: (import.meta.env.VITE_BUILD_ID as string | undefined) ?? '',
    ts: Date.now(),
  }
}

async function post(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/client-error`, {
      method: 'POST',
      keepalive: true,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Fire-and-forget; never throws; the same (kind, message) is sent once per session. */
export function reportClientError(input: ClientErrorInput): void {
  if (typeof window === 'undefined') return
  const key = `${input.kind}|${String(input.message).slice(0, 120)}`
  if (SESSION_DEDUP.has(key)) return
  SESSION_DEDUP.add(key)
  const body = payload(input)
  void post(body).then(ok => {
    if (!ok) saveQueue([...queue(), body])
  })
}

/** Send what an earlier, failed session left behind. Call once on start. */
export async function flushClientErrorQueue(): Promise<void> {
  if (typeof window === 'undefined') return
  const pending = queue()
  if (!pending.length) return
  saveQueue([])
  const left: Array<Record<string, unknown>> = []
  for (const item of pending) if (!(await post(item))) left.push(item)
  if (left.length) saveQueue(left)
}

/** Uncaught errors and rejections are failures the person saw as a broken screen. */
export function installGlobalClientErrorReporting(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('error', e => {
    reportClientError({
      kind: 'window_error',
      message: e.message || String(e.error ?? 'error'),
      context: e.filename ? `${e.filename}:${e.lineno}` : '',
    })
  })
  window.addEventListener('unhandledrejection', e => {
    const reason = (e as PromiseRejectionEvent).reason
    reportClientError({
      kind: 'unhandled_rejection',
      message: reason instanceof Error ? reason.message : String(reason),
      context:
        reason instanceof Error
          ? (reason.stack ?? '').split('\n').slice(0, 3).join(' | ')
          : '',
    })
  })
  void flushClientErrorQueue()
}
