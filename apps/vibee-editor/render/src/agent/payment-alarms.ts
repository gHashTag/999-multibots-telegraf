/**
 * A FAILED PAYMENT MUST REACH THE OWNER.
 *
 * Owner, 2026-09-10: "why could the person not pay, and why did no error
 * reach me?" Measured answer: a failed payment left no trace anywhere the
 * queen's report reads. The client (atoms/club.ts, atoms/feed.ts) showed
 * `cancelled` / `failed` on the screen and told nobody; the server journaled
 * only successful credits; and the most common Telegram failure -- a
 * pre_checkout_query nobody answered within 10 s -- never reaches us at all.
 * "All quiet" and "nobody can pay" were the same report.
 *
 * Three things close that:
 *
 *  1. Every invoice we mint is journaled (normal). A sale that was asked for
 *     is visible even when nothing follows.
 *  2. The client reports what Telegram said after `openInvoice`:
 *     POST /api/pay/outcome {surface, outcome, error?}. `failed` and
 *     `pending` (Telegram said "paid", the ledger did not show it) are
 *     alarms -- the queen's report sends those immediately. `cancelled` and
 *     `unsupported` are attention: they arrive in the three-hour batch.
 *  3. A cashier failure on our side (no token, Bot API refused the invoice)
 *     is an alarm at the point of failure, not a console line.
 *
 * Plus the cashier's pulse: Telegram's getWebhookInfo tells how many updates
 * are waiting for a poller. A bot somebody polls keeps that near zero; a bot
 * nobody polls accumulates them, and every pre_checkout_query in that pile is
 * a payment Telegram cancelled on the person. Two consecutive hourly readings
 * above zero raise an alarm. This is a heuristic, not a proof: a bot nobody
 * writes to shows zero either way.
 *
 * Alarms from one person are throttled (one per surface per 10 minutes):
 * a stuck screen retried five times is one problem, not five.
 */
import { record } from '../hive/journal'
import type { EventKind, Severity } from '../hive/journal'

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any> }

export type PaySurface = 'club' | 'tokens' | 'feed'
export type PayOutcome = 'cancelled' | 'failed' | 'pending' | 'unsupported'

const SURFACES: readonly PaySurface[] = ['club', 'tokens', 'feed']
const OUTCOMES: readonly PayOutcome[] = [
  'cancelled',
  'failed',
  'pending',
  'unsupported',
]

const SURFACE_RU: Record<PaySurface, string> = {
  club: 'клуб', // cyrillic-ok: journal text
  tokens: 'токены', // cyrillic-ok: journal text
  feed: 'звёзды за пост', // cyrillic-ok: journal text
}

export function isPayOutcomePath(path: string): boolean {
  return path === '/api/pay/outcome'
}

export function kindFor(outcome: PayOutcome): EventKind {
  switch (outcome) {
    case 'pending':
      return 'payment-lost'
    case 'cancelled':
      return 'payment-cancelled'
    default:
      return 'payment-failed'
  }
}

export function severityFor(outcome: PayOutcome): Severity {
  return outcome === 'failed' || outcome === 'pending' ? 'alarm' : 'attention'
}

/** One note per person per surface per window; the rest are dropped. */
export const OUTCOME_THROTTLE_MS = 10 * 60 * 1000
const lastNoted = new Map<string, number>()
export function forgetThrottleForTests(): void {
  lastNoted.clear()
}

function trim(s: unknown, n: number): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n)
}

export interface PayOutcomeDeps {
  getPool: () => Promise<Queryable>
  identity: (req: unknown) => string | null
  readBody: (req: unknown) => Promise<string>
  now?: () => number
}

/**
 * POST /api/pay/outcome -- the client's word on what Telegram said.
 * Accepts only the four outcomes above; `paid` is not an outcome to report
 * here, the ledger says that by itself.
 */
export async function handlePayOutcome(
  req: { url?: string; method?: string },
  deps: PayOutcomeDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (req.method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'POST only' } }
  }
  const who = deps.identity(req)
  if (!who) {
    return {
      status: 401,
      body: { ok: false, error: 'нужна подпись или ключ агента' }, // cyrillic-ok: user-facing error
    }
  }
  let body: Record<string, unknown>
  try {
    body = JSON.parse((await deps.readBody(req)) || '{}')
  } catch {
    return { status: 400, body: { ok: false, error: 'bad json' } }
  }
  const surface = body.surface as PaySurface
  const outcome = body.outcome as PayOutcome
  if (!SURFACES.includes(surface) || !OUTCOMES.includes(outcome)) {
    return { status: 400, body: { ok: false, error: 'unknown surface or outcome' } }
  }
  const now = deps.now ? deps.now() : Date.now()
  const key = `${who}:${surface}`
  const last = lastNoted.get(key) ?? 0
  if (now - last < OUTCOME_THROTTLE_MS) {
    return { status: 200, body: { ok: true, noted: false, reason: 'throttled' } }
  }
  lastNoted.set(key, now)

  const stars = Number(body.stars)
  const error = trim(body.error, 120)
  const what = describeOutcome(surface, outcome, error)
  const pool = await deps.getPool()
  const wrote = await record(pool, {
    kind: kindFor(outcome),
    who,
    amount: Number.isFinite(stars) && stars > 0 ? stars : null,
    what,
    severity: severityFor(outcome),
  })
  return { status: 200, body: { ok: true, noted: wrote === 'recorded' } }
}

export function describeOutcome(
  surface: PaySurface,
  outcome: PayOutcome,
  error = ''
): string {
  const s = SURFACE_RU[surface]
  const tail = error ? `: ${error}` : ''
  switch (outcome) {
    case 'failed':
      return `оплата (${s}) СОРВАЛАСЬ у человека${tail}` // cyrillic-ok: journal text
    case 'pending':
      return `оплата (${s}): Telegram сказал «оплачено», в леджере платежа нет${tail}` // cyrillic-ok: journal text
    case 'cancelled':
      return `оплата (${s}): человек закрыл кассу, не заплатив` // cyrillic-ok: journal text
    case 'unsupported':
      return `оплата (${s}): касса недоступна на этой платформе${tail}` // cyrillic-ok: journal text
  }
}

/** An invoice left our hands: visible even if nothing ever follows. */
export async function noteInvoiceMinted(
  pool: Queryable,
  who: string,
  surface: PaySurface,
  stars: number
): Promise<void> {
  await record(pool, {
    kind: 'invoice',
    who,
    amount: stars,
    what: `счёт выписан (${SURFACE_RU[surface]}): ${stars} ⭐, ждём оплаты`, // cyrillic-ok: journal text
    severity: 'normal',
  })
}

/** The cashier itself refused: our side, our fault, alarm now. */
export async function noteCashierFailure(
  pool: Queryable,
  who: string | null,
  surface: PaySurface,
  reason: string
): Promise<void> {
  await record(pool, {
    kind: 'payment-failed',
    who,
    what: `касса (${SURFACE_RU[surface]}) не выписала счёт: ${trim(reason, 120)}`, // cyrillic-ok: journal text
    severity: 'alarm',
  })
}

/*
 * THE CASHIER'S PULSE.
 */
export interface CashierPulse {
  /** Updates waiting for a poller, per Telegram. */
  pending: number
  /** A webhook URL set on the cashier -- a poller cannot receive then. */
  webhook: string
  /** Telegram's own note on the last delivery failure, if any. */
  lastError: string
}

export async function readCashierPulse(
  botToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<CashierPulse> {
  const r = await fetchImpl(
    `https://api.telegram.org/bot${botToken}/getWebhookInfo`
  )
  const d = (await r.json()) as {
    ok?: boolean
    result?: {
      url?: string
      pending_update_count?: number
      last_error_message?: string
    }
  }
  if (!d.ok || !d.result) throw new Error('getWebhookInfo refused')
  return {
    pending: Number(d.result.pending_update_count ?? 0),
    webhook: String(d.result.url ?? ''),
    lastError: String(d.result.last_error_message ?? ''),
  }
}

/** Two readings in a row with a backlog => nobody is polling. */
export function cashierLooksDeaf(
  previous: CashierPulse | null,
  current: CashierPulse
): boolean {
  if (current.webhook) return true
  return !!previous && previous.pending > 0 && current.pending > 0
}

let lastPulse: CashierPulse | null = null
let deafNoted = -Infinity
const DEAF_NOTE_GAP_MS = 6 * 60 * 60 * 1000
export function forgetCashierPulseForTests(): void {
  lastPulse = null
  deafNoted = -Infinity
}

/**
 * Hourly. Returns what it concluded so the caller can log it; writes an
 * alarm at most every six hours while the condition holds.
 */
export async function checkCashierPulse(
  pool: Queryable,
  botToken: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<'no token' | 'quiet' | 'deaf' | 'unreadable'> {
  if (!botToken) return 'no token'
  let cur: CashierPulse
  try {
    cur = await readCashierPulse(botToken, fetchImpl)
  } catch {
    return 'unreadable'
  }
  const deaf = cashierLooksDeaf(lastPulse, cur)
  lastPulse = cur
  if (!deaf) return 'quiet'
  if (now - deafNoted >= DEAF_NOTE_GAP_MS) {
    deafNoted = now
    await record(pool, {
      kind: 'payment-failed',
      what: cur.webhook
        ? `у кассира стоит вебхук ${cur.webhook.slice(0, 60)} — опрос не получает оплаты` // cyrillic-ok: journal text
        : `кассира никто не опрашивает: ${cur.pending} апдейтов ждут второй час — оплаты срываются на pre_checkout`, // cyrillic-ok: journal text
      severity: 'alarm',
    })
  }
  return 'deaf'
}
