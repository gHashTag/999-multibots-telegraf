/**
 * THE CLUB, AS THE BOT SEES IT: ONE OFFER, SOLD THROUGH THE RENDER'S CASHIER.
 *
 * Owner, 2026-09-22, three times over: the only subscription is the CLUB --
 * 10 000 Telegram Stars every 30 days, thirty percent back in tokens -- and
 * everything else is tokens. The tiers the bot kept selling (BASIC / PRO /
 * STUDIO, the NEURO* family, the "Golden Foundry" under /club) do not exist.
 *
 * Measured the same day, which is why this file is here: 49 new people in the
 * bots in thirty days, 5 of them ever opened the Mini App, 2 ever got a club
 * invoice, 0 paid. The club was sold only inside the Mini App; the bot, where
 * the people are, offered three other things.
 *
 * THERE IS ONE CASHIER AND IT IS NOT HERE. The club is a Telegram Stars
 * SUBSCRIPTION: Telegram charges again every 30 days without a new invoice,
 * and the render finds those renewals by reading its cashier bot's own
 * transaction list (render/src/agent/club-membership.ts). An invoice minted by
 * any other bot would be charged into a ledger the render never reads -- a
 * paid month nobody credits. So this file mints nothing: it asks the render,
 * with the server key and the person's id, exactly as the Mini App asks with a
 * signature.
 *
 * The price is never written here either. It arrives with every status and
 * every invoice, so the bot cannot drift from the one number Telegram charges.
 */
import { logger } from '@/utils/logger'

/*
 * A literal, like every other render call in this service (trinityAgent.ts,
 * paymentHandlers): a URL assembled from the environment reads to the
 * scanner as SSRF, and there is one render.
 */
const RENDER = 'https://vibee-render-production.up.railway.app'
const TIMEOUT_MS = 12_000

/** Why a club call could not be answered -- never confused with "not a member". */
export class ClubUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClubUnavailableError'
  }
}

export type ClubGrant = 'owner' | 'keeper' | 'guest' | null

/** The part of /api/club/status the bot reads. */
export interface ClubStatus {
  active: boolean
  granted: ClubGrant
  until: string | null
  daysLeft: number
  stars: number
  periodDays: number
  tokensPerPeriod: number
  /**
   * The person's guest pass ended at this moment (ISO) and nothing else lets
   * them in -- the render decides that (club-guests.ts); the card only says
   * it next to the offer. Null for members and for people never invited.
   */
  guestEnded: string | null
}

export type ClubInvoice =
  | {
      kind: 'invoice'
      link: string
      stars: number
      tokens: number
      periodDays: number
    }
  | {
      kind: 'member'
      granted: ClubGrant
      until: string | null
      daysLeft: number
    }

export interface ClubCallOptions {
  fetchImpl?: typeof fetch
  /** The server key; defaults to RENDER_API_KEY. */
  key?: string
}

async function callClub(
  path: '/api/club/status' | '/api/club/invoice' | '/api/club/verify',
  method: 'GET' | 'POST',
  telegramId: string,
  opts: ClubCallOptions
): Promise<Record<string, any>> {
  const id = String(telegramId ?? '').trim()
  if (!/^\d{5,15}$/.test(id)) {
    throw new ClubUnavailableError(`not a telegram id: ${id.slice(0, 20)}`)
  }
  const key = opts.key ?? process.env.RENDER_API_KEY ?? ''
  if (!key) {
    throw new ClubUnavailableError(
      'RENDER_API_KEY is not set: the bot cannot reach the club cashier'
    )
  }
  const doFetch = opts.fetchImpl ?? fetch
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await doFetch(
      `${RENDER}${path}?telegram_id=${encodeURIComponent(id)}`,
      {
        method,
        headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
        signal: ac.signal,
      }
    )
    let body: Record<string, any>
    try {
      body = (await res.json()) as Record<string, any>
    } catch {
      throw new ClubUnavailableError(`${path}: ${res.status}, not JSON`)
    }
    if (res.status >= 400) {
      throw new ClubUnavailableError(
        `${path}: ${res.status} ${String(body?.error ?? '').slice(0, 120)}`
      )
    }
    return body
  } catch (e) {
    if (e instanceof ClubUnavailableError) throw e
    throw new ClubUnavailableError(
      `${path}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
    )
  } finally {
    clearTimeout(timer)
  }
}

/** A positive integer from the render, or a refusal -- never a guessed price. */
function count(v: unknown, what: string): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) {
    throw new ClubUnavailableError(`the cashier sent no ${what}`)
  }
  return n
}

function readStatus(b: Record<string, any>): ClubStatus {
  return {
    active: b.active === true,
    granted:
      b.granted === 'owner' || b.granted === 'keeper' || b.granted === 'guest'
        ? b.granted
        : null,
    until: typeof b.until === 'string' ? b.until : null,
    daysLeft: Number.isFinite(Number(b.days_left)) ? Number(b.days_left) : 0,
    stars: count(b.stars, 'price'),
    periodDays: count(b.period_days, 'period'),
    tokensPerPeriod: count(b.tokens_per_period, 'token count'),
    guestEnded:
      b.active !== true && typeof b.guest_ended === 'string'
        ? b.guest_ended
        : null,
  }
}

/** Is this person in the club, and what does it cost -- from the one source. */
export async function fetchClubStatus(
  telegramId: string,
  opts: ClubCallOptions = {}
): Promise<ClubStatus> {
  return readStatus(await callClub('/api/club/status', 'GET', telegramId, opts))
}

/**
 * Ask the cashier for this person's invoice link. A member is not sold what
 * they already have: the render answers `already_active` and so do we.
 */
export async function requestClubInvoice(
  telegramId: string,
  opts: ClubCallOptions = {}
): Promise<ClubInvoice> {
  const b = await callClub('/api/club/invoice', 'POST', telegramId, opts)
  if (b.already_active) {
    return {
      kind: 'member',
      granted:
        b.granted === 'owner' || b.granted === 'keeper' || b.granted === 'guest'
          ? b.granted
          : null,
      until: typeof b.until === 'string' ? b.until : null,
      daysLeft: Number.isFinite(Number(b.days_left)) ? Number(b.days_left) : 0,
    }
  }
  const link = typeof b.link === 'string' ? b.link : ''
  if (!b.ok || !/^https:\/\/t\.me\//.test(link)) {
    throw new ClubUnavailableError(
      `the cashier minted no link: ${String(b.error ?? '').slice(0, 120)}`
    )
  }
  return {
    kind: 'invoice',
    link,
    stars: count(b.stars, 'price'),
    tokens: count(b.tokens, 'token count'),
    periodDays: count(b.period_days, 'period'),
  }
}

export interface ClubBooking {
  active: boolean
  until: string | null
  /** Tokens this call credited (0 when the render had booked the charge already). */
  credited: number
  tokensPerPeriod: number
}

/**
 * Right after Telegram says "paid": have the render book the charge now,
 * instead of on its next hourly sweep. The booking itself -- idempotent on
 * the Stars transaction id, tokens through the ledger -- stays in the render.
 */
export async function confirmClubPayment(
  telegramId: string,
  opts: ClubCallOptions = {}
): Promise<ClubBooking> {
  const b = await callClub('/api/club/verify', 'POST', telegramId, opts)
  const credited = Number(b['зачислено_токенов']) // cyrillic-ok: the render's field name
  return {
    active: b.active === true,
    until: typeof b.until === 'string' ? b.until : null,
    credited: Number.isFinite(credited) && credited > 0 ? credited : 0,
    tokensPerPeriod: Number(b.tokens_per_period) || 0,
  }
}

/**
 * The payload the render puts on a club invoice: `club:<stars>:<telegram_id>`
 * (render/src/agent/club-membership.ts, mintClubInvoice). Null for anything
 * else -- a malformed payload must not reach the club branch of a payment.
 */
export function parseClubPayload(
  payload: string | undefined | null
): { stars: number; telegramId: string } | null {
  const m = /^club:(\d{1,7}):(\d{5,15})$/.exec(String(payload ?? ''))
  if (!m) return null
  const stars = Number(m[1])
  return stars > 0 ? { stars, telegramId: m[2] } : null
}

/** Log once with the reason; the caller decides what the person is told. */
export function logClubFailure(where: string, telegramId: unknown, e: unknown) {
  logger.error(`[club] ${where} failed`, {
    telegramId: String(telegramId ?? ''),
    error: e instanceof Error ? e.message : String(e),
  })
}
