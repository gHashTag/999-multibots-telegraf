/**
 * SELLING THE THREE AGENT PACKAGES FOR TELEGRAM STARS.
 *
 * Owner, 2026-09-30: a package is a launch price with the first month inside
 * it, then a monthly fee. Until now the only way to buy one was to press
 * "Order", wait for the team and pay them by hand; the price in the card had
 * no till behind it. Inside Telegram a digital good is sold for Stars only, so
 * the till is a Stars one, built the way the club's is (club-membership.ts):
 *
 * - THE LAUNCH is a one-off invoice at `agentPackageStars(pkg).setup` and
 *   opens 30 days.
 * - THE MONTH is a Telegram Stars subscription at `.month`, offered once the
 *   launch is on file. Telegram charges it again every 30 days without asking
 *   us, so renewals are found the only way they can be: by reading the
 *   cashier's own ledger (getStarTransactions) on verify and on the hourly
 *   sweep. Each charge adds 30 days to whatever is left, so paying early never
 *   loses a day.
 *
 * Every price is computed in the one catalogue
 * (packages/vibee-atoms/src/agent-packages.ts) from the dollar price at one
 * Star rate; nothing here restates a number. A charge is recognised by its
 * invoice payload, `agentpkg:<id>:<setup|month>:<telegram_id>`, which Telegram
 * carries on the transaction itself, and it is booked exactly once: the Stars
 * transaction id is unique in `agent_package_period`.
 *
 * What a booked period does: it is the fact the team and the bot read. The
 * team sets the agent's bot up after the launch is paid (done-for-you, the
 * owner's decision); the bot that receives the payment tells the team and pays
 * the buyer's managed bot forward (src/handlers/paymentHandlers/
 * agentPackagePayment.ts). Nothing here grants tokens: a package month is a
 * service period, not a wallet top-up.
 */

import {
  AGENT_PACKAGES,
  agentPackageById,
  agentPackagePayload,
  agentPackageStars,
  parseAgentPackagePayload,
  type AgentPackage,
  type AgentPackageCharge,
} from '@vibee/atoms'
import { record } from '../hive/journal'
import { noteCashierFailure, noteInvoiceMinted } from './payment-alarms'
import { telegramApiFor } from '../telegram-api'
import { ПЕРИОД_ПОДПИСКИ_С } from './token-packs' // cyrillic-ok: pre-existing export name
import { fetchStarTransactions, type StarTx } from './club-membership'

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<any>
}

/** The only subscription period Telegram accepts, and the length of every package period. */
export const PACKAGE_PERIOD_S = ПЕРИОД_ПОДПИСКИ_С // cyrillic-ok: alias of the measured period

const DAY_MS = 24 * 60 * 60 * 1000

export const AGENT_PACKAGE_SALE_PATHS = [
  '/api/agents/packages/invoice',
  '/api/agents/packages/status',
  '/api/agents/packages/verify',
] as const

export function isAgentPackageSalePath(path: string): boolean {
  return (AGENT_PACKAGE_SALE_PATHS as readonly string[]).includes(path)
}

let tablesReady = false

/**
 * One row per Stars transaction that paid for a package period. The unique
 * star_tx_id is the idempotency key for the launch and every renewal alike.
 */
export async function ensureAgentPackageTables(pool: Queryable): Promise<void> {
  if (tablesReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS agent_package_period (
       id serial PRIMARY KEY,
       telegram_id text NOT NULL,
       package_id text NOT NULL,
       charge text NOT NULL,
       stars int NOT NULL,
       star_tx_id text NOT NULL UNIQUE,
       paid_at timestamptz NOT NULL,
       until timestamptz NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS agent_package_period_who ON agent_package_period (telegram_id, package_id, until DESC)`
  )
  tablesReady = true
}

export function forgetAgentPackageTablesForTests(): void {
  tablesReady = false
}

interface PeriodRow {
  package_id: string
  charge: string
  until: string | Date
}

async function periodsOf(pool: Queryable, who: string): Promise<PeriodRow[]> {
  await ensureAgentPackageTables(pool)
  const r = await pool.query(
    `SELECT package_id, charge, until FROM agent_package_period WHERE telegram_id = $1 ORDER BY until DESC`,
    [who]
  )
  return (r.rows ?? []) as PeriodRow[]
}

export interface PackageStanding {
  id: string
  setup_stars: number
  month_stars: number
  /** The launch is on file: the next invoice is the monthly subscription. */
  launched: boolean
  /** A paid period runs now. */
  active: boolean
  until: string | null
  days_left: number
  /** A monthly charge has been booked whose period has not ended. */
  subscribed: boolean
}

function standingOf(
  pkg: AgentPackage,
  rows: PeriodRow[],
  now: Date
): PackageStanding {
  const mine = rows.filter(r => r.package_id === pkg.id)
  const latest = mine
    .map(r => new Date(r.until))
    .sort((a, b) => b.getTime() - a.getTime())[0]
  const active = !!latest && latest.getTime() > now.getTime()
  const { setup, month } = agentPackageStars(pkg)
  return {
    id: pkg.id,
    setup_stars: setup,
    month_stars: month,
    launched: mine.some(r => r.charge === 'setup'),
    active,
    until: latest ? latest.toISOString() : null,
    days_left: active
      ? Math.ceil((latest!.getTime() - now.getTime()) / DAY_MS)
      : 0,
    subscribed: active && mine.some(r => r.charge === 'month'),
  }
}

/** Every package with its Stars prices and this person's standing in it. */
export async function agentPackageStanding(
  pool: Queryable,
  who: string | null,
  now: Date = new Date()
): Promise<PackageStanding[]> {
  const rows = who ? await periodsOf(pool, who) : []
  return AGENT_PACKAGES.map(pkg => standingOf(pkg, rows, now))
}

/**
 * Which invoice a person is sold next: the launch until it is paid, then the
 * monthly subscription. Null while a subscribed month still runs -- Telegram
 * renews it by itself, and a second subscription would charge twice.
 */
export function nextCharge(s: PackageStanding): AgentPackageCharge | null {
  if (!s.launched) return 'setup'
  if (s.subscribed) return null
  return 'month'
}

export interface MintedPackageInvoice {
  url: string
  payload: string
  charge: AgentPackageCharge
  stars: number
}

export async function mintAgentPackageInvoice(input: {
  pkg: AgentPackage
  charge: AgentPackageCharge
  forTelegramId: string
  botToken: string
  fetchImpl?: typeof fetch
}): Promise<MintedPackageInvoice> {
  if (!input.botToken) {
    throw new Error('касса не настроена: TOKENS_PAYMENT_BOT_TOKEN не задан') // cyrillic-ok: user-facing error
  }
  const forId = String(input.forTelegramId ?? '').trim()
  if (!/^\d{5,15}$/.test(forId)) {
    throw new Error('нужен числовой telegram_id получателя') // cyrillic-ok: user-facing error
  }
  const { pkg, charge } = input
  const stars = agentPackageStars(pkg)[charge]
  const payload = agentPackagePayload(pkg.id, charge, forId)
  // Telegram: title up to 32 characters, description up to 255.
  const title = (
    pkg.name.ru + (charge === 'setup' ? ' — запуск' : ' — 30 дней')
  ) // cyrillic-ok: invoice copy
    .slice(0, 32)
  const description = (
    charge === 'setup'
      ? `${pkg.promise.ru} Первый месяц включён.` // cyrillic-ok: invoice copy
      : `${pkg.promise.ru} Продлевается каждые 30 дней, отмена — в настройках Telegram.`
  ) // cyrillic-ok: invoice copy
    .slice(0, 255)
  const doFetch = input.fetchImpl ?? fetch
  const r = await doFetch(
    `${telegramApiFor(input.botToken)}/createInvoiceLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        payload,
        currency: 'XTR',
        prices: [{ label: title, amount: stars }],
        ...(charge === 'month'
          ? { subscription_period: PACKAGE_PERIOD_S }
          : {}),
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
  return { url, payload, charge, stars }
}

/**
 * Is this transaction a charge for a package, and which? The payload says
 * which package and which charge; the subscription mark has to agree with it,
 * so a one-off payment cannot be booked as a month and the other way round.
 */
export function packageChargeOf(t: StarTx): {
  pkg: AgentPackage
  charge: AgentPackageCharge
  payer: string
} | null {
  const payer = t?.source?.user?.id
  if (!payer || !(Number(t.amount) > 0)) return null
  const parsed = parseAgentPackagePayload(t.source?.invoice_payload)
  if (!parsed) return null
  const isSubscription = t.source?.subscription_period !== undefined
  if (parsed.charge === 'month') {
    if (Number(t.source?.subscription_period) !== PACKAGE_PERIOD_S) return null
  } else if (isSubscription) {
    return null
  }
  return { pkg: parsed.pkg, charge: parsed.charge, payer: String(payer) }
}

export interface BookedPackagePeriod {
  telegramId: string
  packageId: string
  charge: AgentPackageCharge
  stars: number
  starTxId: string
  until: string
}

/**
 * Book every package charge in `txs` that is not on file yet. Each adds one
 * period to what the person has left on that package (or starts from the
 * payment, when nothing is left). Idempotent on star_tx_id. Oldest first, so
 * a launch and its renewals chain in the order they were paid.
 */
export async function bookAgentPackagePeriods(
  pool: Queryable,
  txs: StarTx[],
  who?: string
): Promise<BookedPackagePeriod[]> {
  await ensureAgentPackageTables(pool)
  const out: BookedPackagePeriod[] = []
  const charges = txs
    .map(t => ({ t, c: packageChargeOf(t) }))
    .filter(x => x.c && (who === undefined || x.c.payer === String(who)))
    .sort((a, b) => Number(a.t.date) - Number(b.t.date))
  for (const { t, c } of charges) {
    const seen = await pool.query(
      `SELECT id FROM agent_package_period WHERE star_tx_id = $1 LIMIT 1`,
      [String(t.id)]
    )
    if (seen.rows?.length) continue
    const paidAt = new Date(Number(t.date) * 1000)
    const last = await pool.query(
      `SELECT until FROM agent_package_period WHERE telegram_id = $1 AND package_id = $2 ORDER BY until DESC LIMIT 1`,
      [c!.payer, c!.pkg.id]
    )
    const left = last.rows?.[0]?.until ? new Date(last.rows[0].until) : null
    const from = left && left.getTime() > paidAt.getTime() ? left : paidAt
    const until = new Date(from.getTime() + PACKAGE_PERIOD_S * 1000)
    const ins = await pool.query(
      `INSERT INTO agent_package_period (telegram_id, package_id, charge, stars, star_tx_id, paid_at, until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (star_tx_id) DO NOTHING RETURNING id`,
      [
        c!.payer,
        c!.pkg.id,
        c!.charge,
        Number(t.amount),
        String(t.id),
        paidAt.toISOString(),
        until.toISOString(),
      ]
    )
    if (!ins.rows?.length) continue
    try {
      await record(pool as never, {
        kind: 'payment',
        who: c!.payer,
        amount: Number(t.amount),
        what:
          `пакет «${c!.pkg.name.ru}»: ${c!.charge === 'setup' ? 'запуск' : 'месяц'} оплачен, ` + // cyrillic-ok: journal text
          `период до ${until.toISOString().slice(0, 10)}`, // cyrillic-ok: journal text
        severity: 'normal',
      })
    } catch {
      // The period row is the record that matters; the journal is a courtesy.
    }
    out.push({
      telegramId: c!.payer,
      packageId: c!.pkg.id,
      charge: c!.charge,
      stars: Number(t.amount),
      starTxId: String(t.id),
      until: until.toISOString(),
    })
  }
  return out
}

export interface AgentPackageSaleDeps {
  getPool: () => Promise<Queryable>
  identity: (req: { url?: string; method?: string }) => string | null
  botToken: string
  fetchImpl?: typeof fetch
  now?: () => Date
}

/**
 * HTTP surface. The routes check identity themselves (PUBLIC_EXACT in
 * auth.ts, like the club's): the person by their own proof, or the bot with
 * the server key and `?telegram_id=` (club-identity.ts). The package is named
 * in `?package=`.
 */
export async function handleAgentPackageSale(
  req: { url?: string; method?: string },
  deps: AgentPackageSaleDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(req.url || '/', 'http://x')
  const path = url.pathname
  const now = deps.now ? deps.now() : new Date()
  const who = deps.identity(req)

  if (path === '/api/agents/packages/status' && req.method === 'GET') {
    // The prices are public; only the standing is personal.
    const pool = who ? await deps.getPool() : ({} as Queryable)
    return {
      status: 200,
      body: {
        ok: true,
        anonymous: !who,
        packages: await agentPackageStanding(pool, who, now),
      },
    }
  }

  if (!who) {
    return {
      status: 401,
      body: {
        ok: false,
        error: 'нужна подпись, сессия приложения или ключ агента', // cyrillic-ok: user-facing error
      },
    }
  }
  if (/^-/.test(who)) {
    return {
      status: 400,
      body: { ok: false, error: 'пакет оформляется человеку, не чату' }, // cyrillic-ok: user-facing error
    }
  }
  const pool = await deps.getPool()

  if (path === '/api/agents/packages/verify' && req.method === 'POST') {
    if (!deps.botToken) {
      return { status: 503, body: { ok: false, error: 'касса не настроена' } } // cyrillic-ok: user-facing error
    }
    const txs = await fetchStarTransactions(deps.botToken, deps.fetchImpl)
    const booked = await bookAgentPackagePeriods(pool, txs, who)
    const packages = await agentPackageStanding(pool, who, now)
    return {
      status: 200,
      body: {
        ok: booked.length > 0 || packages.some(p => p.active),
        booked,
        packages,
      },
    }
  }

  if (path === '/api/agents/packages/invoice' && req.method === 'POST') {
    const pkg = agentPackageById(url.searchParams.get('package'))
    if (!pkg) {
      return {
        status: 400,
        body: { ok: false, error: 'нет такого пакета' }, // cyrillic-ok: user-facing error
      }
    }
    if (!deps.botToken) {
      await noteCashierFailure(
        pool,
        who,
        'agents',
        'TOKENS_PAYMENT_BOT_TOKEN not set'
      )
      return {
        status: 503,
        body: {
          ok: false,
          error: 'касса не настроена: TOKENS_PAYMENT_BOT_TOKEN не задан', // cyrillic-ok: user-facing error
        },
      }
    }
    const standing = standingOf(pkg, await periodsOf(pool, who), now)
    const charge = nextCharge(standing)
    if (!charge) {
      return {
        status: 200,
        body: {
          ok: false,
          already_subscribed: true,
          until: standing.until,
          days_left: standing.days_left,
          error: 'подписка на этот пакет уже идёт', // cyrillic-ok: user-facing error
        },
      }
    }
    let minted: MintedPackageInvoice
    try {
      minted = await mintAgentPackageInvoice({
        pkg,
        charge,
        forTelegramId: who,
        botToken: deps.botToken,
        fetchImpl: deps.fetchImpl,
      })
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      await noteCashierFailure(pool, who, 'agents', reason)
      return {
        status: 502,
        body: {
          ok: false,
          error: `касса не выписала счёт: ${reason.slice(0, 120)}`, // cyrillic-ok: user-facing error
        },
      }
    }
    await noteInvoiceMinted(pool, who, 'agents', minted.stars)
    return {
      status: 200,
      body: {
        ok: true,
        link: minted.url,
        package: pkg.id,
        charge: minted.charge,
        stars: minted.stars,
        period_days: PACKAGE_PERIOD_S / 86_400,
      },
    }
  }

  return { status: 404, body: { ok: false, error: 'нет такого пути' } } // cyrillic-ok: user-facing error
}

/**
 * The hourly sweep: books launches nobody verified and every renewal Telegram
 * made by itself. Never throws -- a failed sweep is logged and retried.
 */
export async function sweepAgentPackageSales(
  pool: Queryable,
  botToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<BookedPackagePeriod[]> {
  if (!botToken) return []
  try {
    const txs = await fetchStarTransactions(botToken, fetchImpl)
    return await bookAgentPackagePeriods(pool, txs)
  } catch (e) {
    console.error('[agent-packages] sweep failed:', String(e).slice(0, 160))
    return []
  }
}
