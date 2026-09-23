/**
 * A CLUB MONTH PAID IN CASH, AS THE BOT ASKS FOR IT.
 *
 * The month itself is recorded by the render's own tool `club_cash_month`
 * (render/src/agent/club-cash.ts) -- the ONLY writer of club_period besides
 * the Stars cashier, so nothing here writes, prices, or decides anything.
 * Like clubMembership.ts, this file only carries one question to the one
 * cashier and its answer back: with the server key and the CALLER's
 * telegram_id, exactly as the Mini App asks with a signature.
 *
 * WHY /mcp AND NOT A CLUB ROUTE: the tool is DIRECT_CALL_ONLY -- it must not
 * be reachable by a sentence somebody else wrote (tools.ts). The /mcp door
 * resolves the server key plus an EXPLICIT telegram_id to that person
 * (routes.ts, "наш собственный сервис бота"), and the tool then refuses
 * everyone but the platform owner and the keepers. So the bot sends the id of
 * the admin who pressed the button, never a constant: the render stays the
 * one place that decides who may record cash.
 */
import { logger } from '@/utils/logger'
import { ClubUnavailableError } from './clubMembership'

/*
 * A literal, like every other render call in this service family
 * (clubMembership.ts): a URL assembled from the environment reads to the
 * scanner as SSRF, and there is one render.
 */
const RENDER = 'https://vibee-render-production.up.railway.app'
const TIMEOUT_MS = 15_000

/** Tokens the caller says were handed out by hand for this month (ref cash-club-*). */
export interface HandGiven {
  ref: string
  tokens: number
  at: string
}

/** The tool's own answer, pass-through: ok:true is a recorded month, ok:false a refusal. */
export type CashMonth =
  | {
      ok: true
      recorded: 'now' | 'already'
      telegram_id: string
      start: string
      until: string
      tokens: number
      credited: boolean
      credit_note?: string
      tokens_by_hand?: true
    }
  | {
      ok: false
      error: string
      next_start?: string
      tokens_given_by_hand?: HandGiven[]
    }

export interface CashMonthOptions {
  /** First day of the month, YYYY-MM-DD (UTC). Default: today, decided by the render. */
  start?: string
  /** true = this month's tokens were handed out by hand; record the month, credit nothing. */
  byHand?: boolean
  /** The server key; defaults to RENDER_API_KEY. */
  key?: string
  fetchImpl?: typeof fetch
}

const isTelegramId = (id: string): boolean => /^\d{5,15}$/.test(id)

/**
 * Record a cash club month for `member`, in the name of `by` (the admin whose
 * button press started this). Refusals are DATA, not exceptions: an overlap
 * comes back with the day the next month may start, a hand-given token grant
 * with the question the render wants answered -- both are shown to the owner.
 * Only a dead/unreachable render throws ClubUnavailableError.
 */
export async function recordCashClubMonth(
  by: string,
  member: string,
  opts: CashMonthOptions = {}
): Promise<CashMonth> {
  const caller = String(by ?? '').trim()
  const tid = String(member ?? '').trim()
  if (!isTelegramId(caller)) {
    throw new ClubUnavailableError(
      `not a caller telegram id: ${caller.slice(0, 20)}`
    )
  }
  if (!isTelegramId(tid)) {
    throw new ClubUnavailableError(
      `not a member telegram id: ${tid.slice(0, 20)}`
    )
  }
  const key = opts.key ?? process.env.RENDER_API_KEY ?? ''
  if (!key) {
    throw new ClubUnavailableError(
      'RENDER_API_KEY is not set: the bot cannot reach the club cashier'
    )
  }
  const arguments_: Record<string, unknown> = { telegram_id: tid }
  if (opts.start !== undefined) arguments_.start = opts.start
  if (opts.byHand === true) arguments_.tokens_already_given = true

  const doFetch = opts.fetchImpl ?? fetch
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await doFetch(
      `${RENDER}/mcp?telegram_id=${encodeURIComponent(caller)}`,
      {
        method: 'POST',
        headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'club_cash_month', arguments: arguments_ },
        }),
        signal: ac.signal,
      }
    )
    let body: Record<string, any>
    try {
      body = (await res.json()) as Record<string, any>
    } catch {
      throw new ClubUnavailableError(`/mcp: ${res.status}, not JSON`)
    }
    if (res.status >= 400) {
      throw new ClubUnavailableError(
        `/mcp: ${res.status} ${String(body?.error?.message ?? '').slice(0, 120)}`
      )
    }
    // A tool refusal arrives as the tool's own answer; a THROWN tool (the
    // owner/keeper gate throws) arrives as a JSON-RPC error -- both are the
    // render speaking, so both are relayed, never reworded.
    const tool = body?.result?.structuredContent as CashMonth | undefined
    if (tool && typeof tool === 'object' && typeof tool.ok === 'boolean') {
      return tool
    }
    if (body?.error?.message) {
      return { ok: false, error: String(body.error.message).slice(0, 400) }
    }
    throw new ClubUnavailableError('/mcp: the cashier answered with no verdict')
  } catch (e) {
    if (e instanceof ClubUnavailableError) throw e
    throw new ClubUnavailableError(
      `/mcp: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
    )
  } finally {
    clearTimeout(timer)
  }
}

export { ClubUnavailableError }

/** For the log only -- never shown to the member. */
export function logCashMonth(
  by: string,
  member: string,
  answer: CashMonth
): void {
  logger.info('[club-cash] month answered', {
    by,
    member,
    ok: answer.ok,
    recorded: answer.ok ? answer.recorded : undefined,
    until: answer.ok ? answer.until : undefined,
  })
}
