/**
 * Client-side failures must reach the owner.
 *
 * 08.09.2026, 17:28Z: the mini app showed "Network unavailable: TypeError:
 * Load failed" twice while the render container was being replaced (SIGTERM
 * at 17:25:27Z, the next container healthy at 17:31Z). The server saw
 * nothing -- the request never arrived -- and the owner learned about it
 * from a customer. Every path that already alerts the owner starts on the
 * server; the browser had no way in. This module is the way in: the mini app
 * POSTs what the person saw, the gate keeps a storm from becoming a hundred
 * Telegram messages, and the alert names the surface, the error and who.
 */

export interface ClientErrorReport {
  kind: string
  message: string
  context: string
  path: string
  ua: string
  build: string
  ts: number
}

const LIMITS = {
  kind: 40,
  message: 400,
  context: 600,
  path: 200,
  ua: 160,
  build: 40,
} as const

const clip = (value: unknown, max: number): string =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : ''

/** Shape and size are enforced here; a report is data from a browser. */
export function parseClientError(raw: unknown): ClientErrorReport {
  if (!raw || typeof raw !== 'object')
    throw new Error('report must be an object')
  const r = raw as Record<string, unknown>
  const kind = clip(r.kind, LIMITS.kind).replace(/[^a-z0-9_.:-]/gi, '')
  const message = clip(r.message, LIMITS.message)
  if (!kind || !message) throw new Error('kind and message are required')
  const ts = Number(r.ts)
  return {
    kind,
    message,
    context: clip(r.context, LIMITS.context),
    path: clip(r.path, LIMITS.path),
    ua: clip(r.ua, LIMITS.ua),
    build: clip(r.build, LIMITS.build),
    ts: Number.isFinite(ts) && ts > 0 ? ts : 0,
  }
}

export type GateDecision = 'notify' | 'dedup' | 'capped'

/**
 * One alert per (kind, message) per window; a hard cap per hour. A broken
 * deploy hits every open client at once -- the owner needs one message that
 * says so, not one per tap. Process memory on purpose: a restart resets the
 * gate, and a restart is exactly when the owner wants to hear again.
 */
export class ClientErrorGate {
  private readonly seen = new Map<string, number>()
  private readonly sent: number[] = []
  constructor(
    private readonly dedupMs = 10 * 60_000,
    private readonly hourlyCap = 20
  ) {}

  decide(report: ClientErrorReport, now: number): GateDecision {
    const key = `${report.kind}|${report.message.slice(0, 120)}`
    const last = this.seen.get(key)
    if (last !== undefined && now - last < this.dedupMs) return 'dedup'
    while (this.sent.length && now - this.sent[0] > 3_600_000) this.sent.shift()
    if (this.sent.length >= this.hourlyCap) return 'capped'
    this.seen.set(key, now)
    this.sent.push(now)
    return 'notify'
  }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Telegram HTML; every field came from a browser and is escaped. */
export function formatClientErrorAlert(
  report: ClientErrorReport,
  who: string | null
): string {
  const when = report.ts
    ? new Date(report.ts).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
    : 'time unknown'
  const lines = [
    `🟥 <b>Мини-апп: ошибка у пользователя</b>`,
    `Что: <code>${escapeHtml(report.kind)}</code>`,
    `Текст: ${escapeHtml(report.message)}`,
  ]
  if (report.context) lines.push(`Контекст: ${escapeHtml(report.context)}`)
  if (report.path) lines.push(`Экран: <code>${escapeHtml(report.path)}</code>`)
  const whoLine = who ? `tg://user?id=${escapeHtml(who)}` : 'не подписан (веб)'
  lines.push(`Кто: ${whoLine}`)
  const buildLine = report.build ? ` · сборка ${escapeHtml(report.build)}` : ''
  lines.push(`Когда: ${when}${buildLine}`)
  if (report.ua) lines.push(`<i>${escapeHtml(report.ua)}</i>`)
  return lines.join('\n')
}
