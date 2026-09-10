/**
 * THE CLUB: A TELEGRAM STARS SUBSCRIPTION, 10 000 STARS EVERY 30 DAYS,
 * THIRTY PERCENT BACK IN TOKENS.
 *
 * The owner's decision (2026-09-09, after the one-off shape was dropped): the
 * digital twin -- DMs, groups, reels, content plan, blog -- is entered by a
 * monthly subscription at the measured Telegram ceiling: 10 000 Stars per
 * period, the only period Telegram allows (30 days). Thirty percent of every
 * charge returns to the buyer as tokens on the top pack rate (2 571 tokens);
 * seventy percent is the owner's income. When the tokens run out the person
 * tops up through the ordinary packs.
 *
 * WHAT A SUBSCRIPTION CHANGES. Telegram charges again every 30 days WITHOUT
 * a new invoice from us, so the pending-row rail of /api/tokens/verify sees
 * only the FIRST charge. Renewals are found by scanning getStarTransactions
 * for transactions carrying `subscription_period` from a known member, and
 * every such transaction is booked exactly once (unique star_tx_id): tokens
 * credited, membership extended to the transaction's expiration. The scan
 * runs when the member opens the app (verify) and on an hourly sweep, so a
 * month that was charged but not credited is the failure this file exists
 * to prevent -- see `bookClubPeriods`.
 *
 * Cancelling is done by the person in Telegram settings; we never charge by
 * ourselves. Access simply ends at `until` if no renewal transaction arrives.
 *
 * BOT OWNERS ENTER FOR FREE (owner, 2026-09-10: "give every bot owner access
 * to the digital twin"). Somebody with bots in `avatars` -- the same source
 * of ownership as hive/roles.ts, and a keeper -- is a member without a
 * charge: /api/club/status answers `active: true, granted: 'owner'`, the
 * invoice route refuses to mint (nothing to sell them), and the welcome road
 * in the Mini App skips the paywall on that fact. The grant is computed at
 * read time from `avatars`, never written to club_period: a sold or removed
 * bot ends the grant by itself, and a paid month stays a paid month. See
 * `clubGrantFor`.
 */

import { МАКС_ЗВЁЗД_ПОДПИСКА, ПЕРИОД_ПОДПИСКИ_С, СТУПЕНИ } from './token-packs' // cyrillic-ok: pre-existing export names
import { record } from '../hive/journal'
import { keepers } from '../hive/roles'

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<any>
}

/** The monthly price. Exactly Telegram's measured subscription ceiling. */
export const CLUB_STARS = МАКС_ЗВЁЗД_ПОДПИСКА // cyrillic-ok: alias of the measured ceiling

/** Period in seconds -- the only value Telegram accepts. */
export const CLUB_PERIOD_S = ПЕРИОД_ПОДПИСКИ_С // cyrillic-ok: alias of the measured period

/** Share of each charge that returns to the buyer as tokens. */
export const CLUB_TOKEN_SHARE = 0.3

/**
 * Thirty percent of one charge, in tokens, on the top pack rate (175 Stars
 * for 150 tokens). Computed, not typed: 10000 * 0.3 * 150 / 175 = 2571.4.
 */
export function clubTokensPerPeriod(stars: number = CLUB_STARS): number {
  const { числитель: num, знаменатель: den } = СТУПЕНИ[0] // cyrillic-ok: pre-existing field names
  return Math.floor((stars * CLUB_TOKEN_SHARE * den) / num)
}

export function clubTitle(): string {
  return 'Trinity S³AI — клуб, 30 дней' // cyrillic-ok: invoice copy
}

export function clubDescription(): string {
  return (
    'Цифровой двойник: личка, группы, рилсы, контент-план, блог. ' + // cyrillic-ok: invoice copy
    `${clubTokensPerPeriod()} токенов на генерации зачисляются каждые 30 дней.` // cyrillic-ok: invoice copy
  )
}

export const CLUB_PATHS = [
  '/api/club/invoice',
  '/api/club/status',
  '/api/club/verify',
] as const

export function isClubPath(path: string): boolean {
  return (CLUB_PATHS as readonly string[]).includes(path)
}

let tablesReady = false

/**
 * `club_period`: one row per Stars transaction that paid for 30 days. The
 * unique star_tx_id is the idempotency key for both the first charge and
 * every renewal. Membership = the latest `until` in the future.
 */
export async function ensureClubTables(pool: Queryable): Promise<void> {
  if (tablesReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS club_period (
       id serial PRIMARY KEY,
       telegram_id text NOT NULL,
       stars int NOT NULL,
       tokens_granted int NOT NULL,
       star_tx_id text NOT NULL UNIQUE,
       paid_at timestamptz NOT NULL,
       until timestamptz NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS club_period_who ON club_period (telegram_id, until DESC)`
  )
  tablesReady = true
}

export function forgetClubTablesForTests(): void {
  tablesReady = false
}

/**
 * Why the club is open without a charge. `null` = no grant: membership, if
 * any, is a paid one. 'owner' = has bots in `avatars`; 'keeper' = the
 * platform's own keeper (hive/roles.ts).
 */
export type ClubGrant = 'owner' | 'keeper' | null

export interface ClubGrantSource {
  /** This person's bots according to `avatars`; an empty list means none. */
  botsOwnedBy: (telegramId: string) => Promise<string[]>
  /** Keepers of the hive; defaults to hive/roles.ts `keepers()`. */
  keepers?: () => string[]
}

/**
 * Is the club open to `who` without paying? Fail-closed like roles.ts: when
 * ownership cannot be established the grant is absent and the paid path
 * decides, so a database hiccup costs a paywall, never a free month for a
 * stranger.
 */
export async function clubGrantFor(
  who: string,
  source: ClubGrantSource | undefined
): Promise<ClubGrant> {
  const id = String(who ?? '').trim()
  if (!id || !source) return null
  const keeperList = source.keepers ? source.keepers() : keepers()
  if (keeperList.includes(id)) return 'keeper'
  try {
    const bots = await source.botsOwnedBy(id)
    return bots.length ? 'owner' : null
  } catch {
    return null
  }
}

export interface ClubStatus {
  active: boolean
  /** Set when the club is open without a charge (bot owner / keeper). */
  granted: ClubGrant
  until: string | null
  paid_at: string | null
  days_left: number
  periods: number
  stars: number
  period_days: number
  tokens_per_period: number
}

export async function clubStatus(
  pool: Queryable,
  telegramId: string,
  now: Date = new Date(),
  granted: ClubGrant = null
): Promise<ClubStatus> {
  await ensureClubTables(pool)
  const r = await pool.query(
    `SELECT paid_at::text, until::text, COUNT(*) OVER () AS periods
       FROM club_period WHERE telegram_id = $1 ORDER BY until DESC LIMIT 1`,
    [String(telegramId)]
  )
  const row = r.rows?.[0]
  const untilMs = row ? new Date(row.until).getTime() : NaN
  const paid = Number.isFinite(untilMs) && untilMs > now.getTime()
  const active = paid || granted !== null
  return {
    active,
    granted,
    until: row ? String(row.until) : null,
    paid_at: row ? String(row.paid_at) : null,
    days_left: paid
      ? Math.ceil((untilMs - now.getTime()) / (24 * 60 * 60 * 1000))
      : 0,
    periods: row ? Number(row.periods) : 0,
    stars: CLUB_STARS,
    period_days: CLUB_PERIOD_S / (24 * 60 * 60),
    tokens_per_period: clubTokensPerPeriod(), // secret-guard-ok: token count, not a credential
  }
}

export interface MintClubInput {
  forTelegramId: string
  botToken: string
  fetchImpl?: typeof fetch
}

export interface MintedClubInvoice {
  url: string
  payload: string
  stars: number
  tokens: number
  period_s: number
}

/**
 * Issue the subscription invoice link. No pending row: a subscription is
 * reconciled from Telegram's own ledger (`subscription_period` on the
 * transaction), which is the only source that also knows about renewals.
 */
export async function mintClubInvoice(
  input: MintClubInput
): Promise<MintedClubInvoice> {
  if (!input.botToken) {
    throw new Error('касса не настроена: TOKENS_PAYMENT_BOT_TOKEN не задан') // cyrillic-ok: user-facing error
  }
  const forId = String(input.forTelegramId ?? '').trim()
  if (!/^\d{5,15}$/.test(forId)) {
    throw new Error('нужен числовой telegram_id получателя') // cyrillic-ok: user-facing error
  }
  const title = clubTitle()
  const payload = `club:${CLUB_STARS}:${forId}`
  const doFetch = input.fetchImpl ?? fetch
  const r = await doFetch(
    `https://api.telegram.org/bot${input.botToken}/createInvoiceLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: clubDescription(),
        payload,
        currency: 'XTR',
        prices: [{ label: title, amount: CLUB_STARS }],
        subscription_period: CLUB_PERIOD_S,
      }),
    }
  )
  const d = (await r.json()) as {
    ok?: boolean
    result?: unknown
    description?: string
  }
  const url = typeof d.result === 'string' ? d.result : ''
  if (!d.ok || !url) {
    throw new Error(
      'Telegram не выдал инвойс: ' + String(d.description ?? '').slice(0, 120) // cyrillic-ok: user-facing error
    )
  }
  return {
    url,
    payload,
    stars: CLUB_STARS,
    tokens: clubTokensPerPeriod(), // secret-guard-ok: token count, not a credential
    period_s: CLUB_PERIOD_S,
  }
}

/** The slice of a Bot API StarTransaction this file reads. */
export interface StarTx {
  id: string
  amount: number
  date: number
  source?: {
    type?: string
    user?: { id?: number }
    subscription_period?: number
    invoice_payload?: string
  }
}

/** Is this transaction one charge of OUR club subscription by `who`? */
export function isClubCharge(t: StarTx, who?: string): boolean {
  if (!t?.source?.user?.id) return false
  if (Number(t.amount) !== CLUB_STARS) return false
  if (Number(t.source.subscription_period) !== CLUB_PERIOD_S) return false
  if (who !== undefined && String(t.source.user.id) !== String(who))
    return false
  return true
}

export type Credit = (input: {
  telegramId: string
  tokens: number
  chargeId: string
}) => Promise<{ credited: boolean; reason?: string }>

export interface BookedPeriod {
  telegramId: string
  starTxId: string
  until: string
  tokens: number
  credited: boolean
}

/**
 * Book every club charge in `txs` that is not yet on file: credit the
 * tokens (through the caller's ledger-backed `credit`, so user_tokens keeps
 * its one door) and write the period. Idempotent on star_tx_id; a second
 * pass over the same transactions books nothing.
 *
 * `until` is the charge date plus one period -- Telegram bills at the
 * boundary, so consecutive charges chain without a gap. When `who` is given
 * only that person's charges are booked (the verify route); without it the
 * hourly sweep books everyone's.
 */
export async function bookClubPeriods(
  pool: Queryable,
  txs: StarTx[],
  credit: Credit,
  who?: string
): Promise<BookedPeriod[]> {
  await ensureClubTables(pool)
  const out: BookedPeriod[] = []
  const charges = txs.filter(t => isClubCharge(t, who))
  for (const t of charges) {
    const seen = await pool.query(
      `SELECT id FROM club_period WHERE star_tx_id = $1 LIMIT 1`,
      [String(t.id)]
    )
    if (seen.rows?.length) continue
    const tid = String(t.source!.user!.id)
    const tokens = clubTokensPerPeriod(Number(t.amount)) // secret-guard-ok: token count, not a credential
    const paidAt = new Date(Number(t.date) * 1000)
    const until = new Date(paidAt.getTime() + CLUB_PERIOD_S * 1000)
    const ins = await pool.query(
      `INSERT INTO club_period (telegram_id, stars, tokens_granted, star_tx_id, paid_at, until)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (star_tx_id) DO NOTHING RETURNING id`,
      [
        tid,
        Number(t.amount),
        tokens,
        String(t.id),
        paidAt.toISOString(),
        until.toISOString(),
      ]
    )
    if (!ins.rows?.length) continue
    const c = await credit({
      telegramId: tid,
      tokens,
      chargeId: `club:${t.id}`,
    })
    try {
      await record(pool as never, {
        kind: c.credited ? 'payment' : 'payment-lost',
        who: tid,
        amount: Number(t.amount),
        what: c.credited
          ? `клуб: 30 дней до ${until.toISOString().slice(0, 10)}, ${tokens} токенов зачислено` // cyrillic-ok: journal text
          : `клуб: период записан, токены НЕ зачислены: ${c.reason ?? ''}`, // cyrillic-ok: journal text
        severity: c.credited ? 'normal' : 'alarm',
      })
    } catch {
      // The period row is the record that matters; the journal is a courtesy.
    }
    out.push({
      telegramId: tid,
      starTxId: String(t.id),
      until: until.toISOString(),
      tokens,
      credited: c.credited,
    })
  }
  return out
}

/** Recent transactions of the cashier bot, newest first. */
export async function fetchStarTransactions(
  botToken: string,
  fetchImpl: typeof fetch = fetch,
  limit = 100
): Promise<StarTx[]> {
  const r = await fetchImpl(
    `https://api.telegram.org/bot${botToken}/getStarTransactions?limit=${limit}`
  )
  const d = (await r.json()) as {
    ok?: boolean
    result?: { transactions?: StarTx[] }
  }
  return d?.ok ? (d.result?.transactions ?? []) : []
}

export interface ClubDeps {
  getPool: () => Promise<Queryable>
  identity: (req: { url?: string; method?: string }) => string | null
  botToken: string
  credit: Credit
  fetchImpl?: typeof fetch
  now?: () => Date
  /** Who enters without paying (bot owners, keepers). Omitted = nobody. */
  grant?: ClubGrantSource
}

/**
 * HTTP surface. All three routes check identity themselves (listed as
 * PUBLIC_EXACT in auth.ts for exactly that reason, like /api/tokens/*).
 */
export async function handleClub(
  req: { url?: string; method?: string },
  deps: ClubDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  const path = (req.url || '').split('?')[0]
  const who = deps.identity(req)
  if (!who) {
    return {
      status: 401,
      body: { ok: false, error: 'нужна подпись или ключ агента' }, // cyrillic-ok: user-facing error
    }
  }
  if (/^-/.test(who)) {
    return {
      status: 400,
      body: { ok: false, error: 'клуб оформляется человеку, не чату' }, // cyrillic-ok: user-facing error
    }
  }
  const pool = await deps.getPool()
  const now = deps.now ? deps.now() : new Date()
  const granted = await clubGrantFor(who, deps.grant)

  if (path === '/api/club/status' && req.method === 'GET') {
    return {
      status: 200,
      body: { ok: true, ...(await clubStatus(pool, who, now, granted)) },
    }
  }

  if (path === '/api/club/verify' && req.method === 'POST') {
    if (!deps.botToken) {
      return { status: 503, body: { ok: false, error: 'касса не настроена' } } // cyrillic-ok: user-facing error
    }
    const txs = await fetchStarTransactions(deps.botToken, deps.fetchImpl)
    const booked = await bookClubPeriods(pool, txs, deps.credit, who)
    const status = await clubStatus(pool, who, now, granted)
    const creditedTokens = booked.reduce(
      (sum, b) => sum + (b.credited ? b.tokens : 0),
      0
    )
    return {
      status: 200,
      body: {
        ok: status.active,
        booked: booked.length,
        ['зачислено_токенов']: creditedTokens,
        ...status,
        ...(status.active
          ? {}
          : { причина: 'оплаты пока не видно — попробуй через минуту' }), // cyrillic-ok: same wording as /api/tokens/verify
      },
    }
  }

  if (path === '/api/club/invoice' && req.method === 'POST') {
    if (!deps.botToken) {
      return {
        status: 503,
        body: {
          ok: false,
          error: 'касса не настроена: TOKENS_PAYMENT_BOT_TOKEN не задан', // cyrillic-ok: user-facing error
        },
      }
    }
    const current = await clubStatus(pool, who, now, granted)
    if (current.active) {
      // A bot owner is not sold a month they already have: no invoice.
      return {
        status: 200,
        body: {
          ok: false,
          already_active: true,
          granted: current.granted,
          until: current.until,
          days_left: current.days_left,
          error: current.granted
            ? 'клуб открыт владельцам ботов без оплаты' // cyrillic-ok: user-facing error
            : 'клуб уже оплачен', // cyrillic-ok: user-facing error
        },
      }
    }
    const minted = await mintClubInvoice({
      forTelegramId: who,
      botToken: deps.botToken,
      fetchImpl: deps.fetchImpl,
    })
    return {
      status: 200,
      body: {
        ok: true,
        link: minted.url,
        stars: minted.stars,
        tokens: minted.tokens,
        period_days: minted.period_s / (24 * 60 * 60),
      },
    }
  }

  return { status: 404, body: { ok: false, error: 'нет такого пути' } } // cyrillic-ok: user-facing error
}

/**
 * The hourly sweep: books renewals for members who did not open the app.
 * Returns what it booked so the caller can log it. Never throws -- a failed
 * sweep is logged and retried next hour.
 */
export async function sweepClubRenewals(
  pool: Queryable,
  botToken: string,
  credit: Credit,
  fetchImpl: typeof fetch = fetch
): Promise<BookedPeriod[]> {
  if (!botToken) return []
  try {
    const txs = await fetchStarTransactions(botToken, fetchImpl)
    return await bookClubPeriods(pool, txs, credit)
  } catch (e) {
    console.error('[club] sweep failed:', String(e).slice(0, 160))
    return []
  }
}
