/**
 * THE CLUB, PAID ON t27.ai IN ROUBLES, FOR A READER WITHOUT TELEGRAM.
 *
 * Owner, 2026-10-13: a t27.ai reader who has no Telegram can still buy the
 * paid step of the course ladder -- one 30-day club period, paid once through
 * Robokassa, never renewed by itself. The key he gets is the same signed
 * STEP_PAID key the bot mints (course-access.ts), so the site checks it the
 * same way; it carries no Telegram id and runs out by its own expiry.
 *
 * Owner, 2026-10-13: roubles only for Russian-language readers (the bot's
 * precedent: src/core/bot/shouldShowRubles.ts). A POST whose `lang` is not
 * `ru` is refused with reason `lang`.
 *
 * Owner, 2026-10-13: the rouble price is the club's Stars price at the live
 * exchange rate, never a hand-set number:
 *   rub = ceil to 10 of (CLUB_STARS x STAR_PRICE_USD x USD/RUB)
 * with USD/RUB the Central Bank of Russia rate (cbr-xml-daily.ru, Valute.USD),
 * cached 12 h; a failed fetch keeps the last good rate, and with none ever
 * fetched the bot's fallback rate (src/price/constants DEFAULT_USD_TO_RUB_RATE)
 * applies. The amount is frozen on the order row when the order is made, and
 * the ResultURL check compares OutSum with that stored amount only.
 * CLUB_RUB_PRICE survives as an optional override, nothing more.
 *
 * Nothing here is invented: the stars and the period are the club's
 * (CLUB_STARS, CLUB_PERIOD_S), the star's dollar value is the shared
 * STAR_PRICE_USD, the Robokassa credentials are the
 * bot's variable NAMES (ROBOKASSA_MERCHANT_LOGIN with the MERCHANT_LOGIN
 * fallback, ROBOKASSA_PASSWORD_1, ROBOKASSA_PASSWORD_2, ROBOKASSA_TEST_MODE),
 * and the key rules are the spec's own fns (mintOk, keyDays).
 *
 * Signatures, as docs.robokassa.ru documents them (read 2026-10-13, pages
 * "pay-interface" and "notifications-and-redirects"):
 *   payment link: MerchantLogin:OutSum:InvId[:Receipt][:StepByStep]
 *                 [:ResultUrl2][:SuccessUrl2:SuccessUrl2Method]
 *                 [:FailUrl2:FailUrl2Method]:Password#1[:Shp_k=v sorted]
 *                 -- URL values URL-encoded inside the signature string,
 *                 exactly as both of the docs' example strings show them;
 *   ResultURL:    OutSum:InvId:Password#2[:Shp_k=v sorted], reply OK<InvId>.
 * The ResultUrl2 notification arrives as a POST.
 *
 * payments_v2 (the bot's) is a frozen archive and is never touched here; the
 * CRM is keyed by Telegram id, so a web buyer gets no CRM row.
 *
 * Owner, 2026-10-13: "or with crypto" -- the same period paid in native TON
 * to the bot's own wallet, any language (course-checkout-ton.ts). The TON
 * amount is CLUB_USD at the live TON/USD rate, rounded up to 0.1 TON, frozen
 * on the order, and the order expires after 60 minutes. The site's poll looks
 * at the chain; the claim is the same atomic UPDATE, the key the same fulfil().
 *
 * Routes (render-server.ts, all public, see auth.ts):
 *   GET  /api/course/checkout            on?, rub, days, stars, usd, rate,
 *                                        rateDate, ton {on, amount, address,
 *                                        rate, rateDate}
 *   POST /api/course/checkout            an order and its Robokassa URL, or
 *                                        with pay:'ton' an order and its
 *                                        TON transfer (address, amount, code)
 *   GET  /api/course/checkout/return     back from Robokassa -> t27.ai
 *   GET  /api/course/checkout/order      the site polls: pending | paid (+key)
 *                                        | expired (TON only)
 *   POST /api/course/checkout/result     Robokassa's ResultUrl2 notification
 */
import crypto from 'node:crypto'
import * as SPEC from '../spec/course-access.gen'
import { keyDays, mintOk } from '../spec/course-access.logic'
import {
  courseKeySecret,
  ensureCourseTables,
  maskEmail,
  mintKey,
  type Queryable,
} from './course-access'
import { STAR_PRICE_USD } from '@vibee/atoms'
import { CLUB_PERIOD_S, CLUB_STARS } from './club-membership'
import { PLATFORM_OWNER_FALLBACK } from '../platform-owner'
import {
  TonUnreadable,
  nanoToTon,
  orderCode,
  tonConfig,
  tonLink,
  tonNano,
  tonUsd,
  txPaysTonOrder,
  walletTxs,
} from './course-checkout-ton'

export const CHECKOUT_PATHS = [
  '/api/course/checkout',
  '/api/course/checkout/return',
  '/api/course/checkout/order',
  '/api/course/checkout/result',
] as const

// t27-plumbing: a route matcher for render-server.ts
export function isCheckoutPath(path: string): boolean {
  return (CHECKOUT_PATHS as readonly string[]).includes(path)
}

const DAY_MS = 24 * 60 * 60 * 1000 // t27-plumbing: a unit
/** The club's own period, in days (30). */
export const CLUB_DAYS = Math.round((CLUB_PERIOD_S * 1000) / DAY_MS)
const SITE = 'https://t27.ai'
const ROBOKASSA_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx'
const ROUTE = /^[a-z0-9-]{1,64}$/
const ORDER_ID = /^[A-Za-z0-9_-]{24,64}$/
/** Where the sale came from (shelf placement, utm_source): a tag, or nothing. */
const TAG = /^[a-z0-9:_.-]{1,80}$/i
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
/** InvIds start high and stay in int32 (Robokassa's InvId, Postgres integer). */
// t27-plumbing: a sequence start, kept clear of the bot's Date.now() InvIds
const INV_START = 1_900_000_000
// t27-plumbing: the int32 ceiling of a Postgres integer column
const INT32_MAX = 2_147_483_647

/** The CBR daily rates, as JSON (Valute.USD.Value is roubles per dollar). */
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js'
// t27-plumbing: a cache lifetime, 12 hours
const RATE_TTL_MS = 12 * 60 * 60 * 1000
// t27-plumbing: a network timeout
const RATE_TIMEOUT_MS = 5000
/**
 * The rate when none was ever fetched: the bot's own fallback,
 * src/price/constants DEFAULT_USD_TO_RUB_RATE. The render ships on its own and
 * cannot import the bot's src/, so the value is mirrored here.
 */
// t27-plumbing: a mirror of src/price/constants DEFAULT_USD_TO_RUB_RATE
const FALLBACK_USD_RUB = 100
// t27-plumbing: a rounding step for a price shown in roubles
const RUB_STEP = 10
// t27-plumbing: how long a TON order's frozen amount stands, 60 minutes
const TON_ORDER_MS = 60 * 60 * 1000
// A transfer sent inside the window may be indexed a little after it.
// t27-plumbing: how long past expiry the poll still reads the chain
const TON_LATE_LOOK_MS = 15 * 60 * 1000
// t27-plumbing: retries for an order code that collided with a stored one
const CODE_TRIES = 3

export interface UsdRub {
  rate: number
  /** The CBR's own date for the rate, YYYY-MM-DD; null for the fallback. */
  date: string | null
  source: 'cbr' | 'cache' | 'last-good' | 'fallback'
}

let lastGood: { rate: number; date: string | null; at: number } | null = null
export function forgetUsdRubForTests(): void {
  lastGood = null
}

/**
 * USD/RUB from the CBR, cached 12 h. A failed fetch answers the last good
 * rate; with none ever fetched, the fallback.
 */
export async function usdRub(
  fetchFn: typeof fetch = globalThis.fetch,
  nowMs: number = Date.now()
): Promise<UsdRub> {
  if (lastGood && nowMs - lastGood.at < RATE_TTL_MS)
    return { rate: lastGood.rate, date: lastGood.date, source: 'cache' }
  try {
    const r = await fetchFn(CBR_URL, {
      signal: AbortSignal.timeout(RATE_TIMEOUT_MS),
    })
    if (!r.ok) throw new Error(`cbr ${r.status}`)
    const j = (await r.json()) as {
      Date?: string
      Valute?: { USD?: { Value?: number; Nominal?: number } }
    }
    const value = Number(j?.Valute?.USD?.Value)
    const nominal = Number(j?.Valute?.USD?.Nominal ?? 1) || 1
    const rate = value / nominal
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('cbr: no USD')
    const date = /^\d{4}-\d{2}-\d{2}/.test(String(j.Date ?? ''))
      ? String(j.Date).slice(0, 10)
      : null
    lastGood = { rate, date, at: nowMs }
    return { rate, date, source: 'cbr' }
  } catch {
    if (lastGood)
      return { rate: lastGood.rate, date: lastGood.date, source: 'last-good' }
    return { rate: FALLBACK_USD_RUB, date: null, source: 'fallback' }
  }
}

/** The club's dollar price: its Stars at the shared star value (160). */
export const CLUB_USD = Math.round(CLUB_STARS * STAR_PRICE_USD * 100) / 100

/** Roubles for the club at a rate: ceil to 10 of (stars x $/star x rate). */
export function clubRub(rate: number): number {
  // Rounded to 1e-6 first, so float noise never adds a whole step.
  const exact = Math.round(CLUB_USD * rate * 1e6) / 1e6
  return Math.ceil(exact / RUB_STEP) * RUB_STEP
}

export interface ClubPrice {
  rub: number
  days: number
  stars: number
  usd: number
  rate: number
  rateDate: string | null
}

/** The price an order is frozen at now: the override, else the live rate. */
export async function clubPrice(
  env: NodeJS.ProcessEnv,
  fetchFn?: typeof fetch,
  nowMs?: number
): Promise<ClubPrice> {
  const fx = await usdRub(fetchFn, nowMs)
  const raw = String(env.CLUB_RUB_PRICE ?? '').trim()
  const override = /^\d{1,9}$/.test(raw) ? Number(raw) : 0
  return {
    rub: override > 0 ? override : clubRub(fx.rate),
    days: CLUB_DAYS,
    stars: CLUB_STARS,
    usd: CLUB_USD,
    rate: fx.rate,
    rateDate: fx.date,
  }
}

export type CheckoutConfig =
  | { on: false }
  | {
      on: true
      login: string
      pass1: string
      pass2: string
      test: boolean
      secret: Buffer
    }

/** On with all three Robokassa values and course keys; nothing else needed. */
export function checkoutConfig(
  env: NodeJS.ProcessEnv = process.env
): CheckoutConfig {
  const login = String(
    env.ROBOKASSA_MERCHANT_LOGIN || env.MERCHANT_LOGIN || ''
  ).trim()
  const pass1 = String(env.ROBOKASSA_PASSWORD_1 || '')
  const pass2 = String(env.ROBOKASSA_PASSWORD_2 || '')
  const secret = courseKeySecret(env)
  if (!login || !pass1 || !pass2 || !secret) return { on: false }
  const test = /^(1|true|yes|on)$/i.test(
    String(env.ROBOKASSA_TEST_MODE ?? '').trim()
  )
  return { on: true, login, pass1, pass2, test, secret }
}

const md5 = (s: string) =>
  crypto.createHash('md5').update(s, 'utf8').digest('hex')

/**
 * PHP's urlencode, which the docs' example strings are written in: every byte
 * but [A-Za-z0-9-_.] percent-encoded, a space as '+'.
 */
export function phpUrlencode(s: string): string {
  return encodeURIComponent(s)
    .replace(/[!'()*~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+')
}

export interface PaymentSignatureInput {
  login: string
  outSum: string
  /** Empty string keeps the slot, as the docs' example does. */
  invId: string
  receipt?: string
  resultUrl2?: string
  successUrl2?: string
  successUrl2Method?: string
  failUrl2?: string
  failUrl2Method?: string
  pass1: string
  shp?: Record<string, string>
}

const shpTail = (shp: Record<string, string> = {}) =>
  Object.keys(shp)
    .filter(k => /^shp_/i.test(k))
    .sort()
    .map(k => `:${k}=${shp[k]}`)
    .join('')

/** The string Robokassa hashes for a payment link (see the header). */
export function paymentSignatureBase(p: PaymentSignatureInput): string {
  const parts = [p.login, p.outSum, p.invId]
  if (p.receipt !== undefined) parts.push(phpUrlencode(p.receipt))
  if (p.resultUrl2 !== undefined) parts.push(phpUrlencode(p.resultUrl2))
  if (p.successUrl2 !== undefined)
    parts.push(phpUrlencode(p.successUrl2), p.successUrl2Method ?? 'GET')
  if (p.failUrl2 !== undefined)
    parts.push(phpUrlencode(p.failUrl2), p.failUrl2Method ?? 'GET')
  parts.push(p.pass1)
  return parts.join(':') + shpTail(p.shp)
}

export function paymentSignature(p: PaymentSignatureInput): string {
  return md5(paymentSignatureBase(p)).toUpperCase()
}

/** ResultURL: md5(OutSum:InvId:Password#2[:Shp_*]), compared case-blind. */
export function resultSignatureOk(
  form: Record<string, string>,
  pass2: string
): boolean {
  const got = String(form.SignatureValue ?? '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(got) || !pass2) return false
  const shp: Record<string, string> = {}
  for (const k of Object.keys(form)) if (/^shp_/i.test(k)) shp[k] = form[k]
  const want = md5(
    `${form.OutSum ?? ''}:${form.InvId ?? ''}:${pass2}${shpTail(shp)}`
  )
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))
}

function publicBase(env: NodeJS.ProcessEnv): string {
  return String(
    env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
}

/** The Robokassa payment URL for one order. */
export function paymentUrl(
  cfg: Extract<CheckoutConfig, { on: true }>,
  o: {
    invId: number
    orderId: string
    email: string
    lang: 'ru' | 'en'
    /** The amount frozen on the order row. */
    rub: number
  },
  env: NodeJS.ProcessEnv = process.env
): string {
  const base = publicBase(env)
  const back = `${base}/api/course/checkout/return?order=${o.orderId}`
  const sig: PaymentSignatureInput = {
    login: cfg.login,
    outSum: String(o.rub),
    invId: String(o.invId),
    resultUrl2: `${base}/api/course/checkout/result`,
    successUrl2: back,
    successUrl2Method: 'GET',
    failUrl2: back,
    failUrl2Method: 'GET',
    pass1: cfg.pass1,
  }
  const q = new URLSearchParams({
    MerchantLogin: cfg.login,
    OutSum: sig.outSum,
    InvId: sig.invId,
    Description: `t27 club: ${CLUB_DAYS} days of course access`,
    Email: o.email,
    Culture: o.lang,
    ResultUrl2: sig.resultUrl2!,
    SuccessUrl2: sig.successUrl2!,
    SuccessUrl2Method: 'GET',
    FailUrl2: sig.failUrl2!,
    FailUrl2Method: 'GET',
    SignatureValue: paymentSignature(sig),
  })
  if (cfg.test) q.set('IsTest', '1')
  return `${ROBOKASSA_URL}?${q.toString()}`
}

let ensured: Promise<void> | null = null
export function forgetCheckoutTablesForTests(): void {
  ensured = null
}
export async function ensureCheckoutTables(pool: Queryable): Promise<void> {
  ensured ??= (async () => {
    await ensureCourseTables(pool)
    await pool.query(
      `CREATE SEQUENCE IF NOT EXISTS course_order_inv_seq
         START ${INV_START} MINVALUE ${INV_START} MAXVALUE ${INT32_MAX}`
    )
    await pool.query(`CREATE TABLE IF NOT EXISTS course_order (
      id text PRIMARY KEY,
      inv_id integer UNIQUE NOT NULL DEFAULT nextval('course_order_inv_seq'),
      email text NOT NULL,
      route text NOT NULL,
      lang text NOT NULL,
      rub integer NOT NULL,
      pay_via text NOT NULL DEFAULT 'robokassa',
      from_placement text,
      source text,
      status text NOT NULL DEFAULT 'pending',
      learner_id text,
      key text,
      until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      paid_at timestamptz)`)
    // A table made before a column existed gets it here; re-running is free.
    for (const col of [
      `pay_via text NOT NULL DEFAULT 'robokassa'`,
      `from_placement text`,
      `source text`,
      // TON orders: the transfer comment, the nanoton frozen at creation, the
      // expiry, and the hash of the transfer that paid it.
      `ton_code text`,
      `ton_nano bigint`,
      `expires_at timestamptz`,
      `ton_tx text`,
    ])
      await pool.query(
        `ALTER TABLE course_order ADD COLUMN IF NOT EXISTS ${col}`
      )
    // One code is one order, and one transfer pays at most one order.
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS course_order_ton_code_key ON course_order (ton_code)`
    )
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS course_order_ton_tx_key ON course_order (ton_tx)`
    )
  })().catch(e => {
    ensured = null
    throw e
  })
  return ensured
}

export interface CheckoutDeps {
  getPool: () => Promise<Queryable>
  readBody: (req: unknown) => Promise<string>
  /** The owner's live message; injectable so tests send nothing. */
  tellOwner?: (text: string) => Promise<unknown>
  now?: () => Date
  env?: NodeJS.ProcessEnv
  /** The CBR fetch; injectable so tests reach no network. */
  fetchRate?: typeof fetch
  /** The CoinGecko and toncenter fetch; injectable so tests reach no network. */
  fetchTon?: typeof fetch
}

export interface CheckoutReply {
  status: number
  body?: Record<string, unknown>
  /** A plain-text answer (Robokassa's OK<InvId>). */
  text?: string
  /** A 302 target. */
  location?: string
}

async function tell(deps: CheckoutDeps, text: string): Promise<void> {
  try {
    if (deps.tellOwner) {
      await deps.tellOwner(text)
      return
    }
    const { sendToTelegram } = await import('../auth/telegram-sender')
    const env = deps.env ?? process.env
    await sendToTelegram(
      String(env.OWNER_TELEGRAM_ID || PLATFORM_OWNER_FALLBACK),
      text,
      undefined,
      { event: 'payment' }
    )
  } catch {
    // The order row is the record; a failed message never fails the payment.
  }
}

/** An optional tag from the site; anything else is stored as null, never refused. */
function tag(v: unknown): string | null {
  return typeof v === 'string' && TAG.test(v) ? v : null
}

/** POST /api/course/checkout: validate, store the order, hand back the URL. */
export async function createOrder(
  pool: Queryable,
  body: Record<string, unknown>,
  deps: CheckoutDeps
): Promise<CheckoutReply> {
  const env = deps.env ?? process.env
  const cfg = checkoutConfig(env)
  if (!cfg.on) return { status: 200, body: { ok: false, reason: 'off' } }
  if (body.lang !== 'ru')
    return { status: 200, body: { ok: false, reason: 'lang' } }
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase()
  if (email.length > 254 || !EMAIL.test(email))
    return { status: 200, body: { ok: false, reason: 'bad_email' } }
  const route = String(body.route ?? '')
  if (!ROUTE.test(route))
    return { status: 200, body: { ok: false, reason: 'bad_route' } }
  await ensureCheckoutTables(pool)
  const now = (deps.now ?? (() => new Date()))()
  const { rub } = await clubPrice(env, deps.fetchRate, now.getTime())
  const id = crypto.randomBytes(24).toString('base64url') // 32 chars
  // The amount is frozen here; the ResultURL check reads it back from the row.
  const r = await pool.query(
    `INSERT INTO course_order
       (id, email, route, lang, rub, pay_via, from_placement, source)
     VALUES ($1, $2, $3, $4, $5, 'robokassa', $6, $7) RETURNING inv_id`,
    [id, email, route, 'ru', rub, tag(body.from), tag(body.source)]
  )
  const invId = Number(r.rows[0]?.inv_id)
  return {
    status: 200,
    body: {
      ok: true,
      order: id,
      rub,
      url: paymentUrl(cfg, { invId, orderId: id, email, lang: 'ru', rub }, env),
    },
  }
}

/** GET /api/course/checkout/return: back to the order's own course page. */
export async function returnTo(
  pool: Queryable,
  orderId: string
): Promise<CheckoutReply> {
  if (!ORDER_ID.test(orderId)) return { status: 302, location: `${SITE}/` }
  await ensureCheckoutTables(pool)
  const r = await pool.query(`SELECT route FROM course_order WHERE id = $1`, [
    orderId,
  ])
  const route = String(r.rows[0]?.route ?? '')
  // The route was checked when stored; checked again, so no stored value can
  // ever turn this into a redirect off t27.ai.
  if (!ROUTE.test(route)) return { status: 302, location: `${SITE}/` }
  return {
    status: 302,
    location: `${SITE}/#/${route}?order=${encodeURIComponent(orderId)}`,
  }
}

/** GET /api/course/checkout/order: pending or paid; the key only when paid. */
export async function orderStatus(
  pool: Queryable,
  orderId: string,
  deps?: CheckoutDeps
): Promise<CheckoutReply> {
  if (!ORDER_ID.test(orderId))
    return { status: 404, body: { ok: false, reason: 'not_found' } }
  await ensureCheckoutTables(pool)
  const select = async () =>
    (
      await pool.query(
        `SELECT status, key, until, pay_via, inv_id, email, ton_code, ton_nano, created_at, expires_at FROM course_order WHERE id = $1`,
        [orderId]
      )
    ).rows[0]
  let row = await select()
  if (!row) return { status: 404, body: { ok: false, reason: 'not_found' } }
  if (row.pay_via === 'ton' && deps && !(row.status === 'paid' && row.key)) {
    const seen = await settleTon(pool, orderId, row, deps)
    if (seen === 'expired')
      return { status: 200, body: { ok: true, status: 'expired' } }
    if (seen === 'paid') row = await select()
  }
  if (row.status !== 'paid' || !row.key)
    return {
      status: 200,
      body: {
        ok: true,
        status: 'pending',
        ...(row.pay_via === 'ton' && row.status !== 'paid'
          ? { ton: tonTransfer(row, deps?.env ?? process.env) }
          : {}),
      },
    }
  return {
    status: 200,
    body: {
      ok: true,
      status: 'paid',
      key: String(row.key),
      until: new Date(row.until).toISOString().slice(0, 10),
    },
  }
}

/**
 * Mint the paid key for a claimed order that has none yet. Nothing here knows
 * how the order was paid (pay_via): a later rail (TON, say) claims its own
 * order and calls the same fulfil, so every web buyer gets the same STEP_PAID
 * key against the same email-keyed learner. The spec decides:
 * mintOk(STEP_PAID, paid=true, hasSecret) and keyDays(STEP_PAID, club days).
 * The UPDATE writes only where no key is stored, so two deliveries cannot
 * leave two different keys.
 */
async function fulfil(
  pool: Queryable,
  order: { inv_id: number; email: string },
  secret: Buffer | null,
  now: Date
): Promise<{ key: string; until: string } | null> {
  if (!mintOk(SPEC.STEP_PAID, true, secret !== null)) return null
  const learnerId = crypto
    .randomBytes(16)
    .toString('base64url')
    .slice(0, SPEC.LEARNER_ID_CHARS)
  await pool.query(
    `INSERT INTO course_learner (learner_id, telegram_id, email) VALUES ($1, NULL, $2)`,
    [learnerId, order.email]
  )
  const days = keyDays(SPEC.STEP_PAID, CLUB_DAYS)
  const key = mintKey(SPEC.STEP_PAID, learnerId, days, now, secret!)
  const until = new Date(
    (Math.floor(now.getTime() / DAY_MS) + days) * DAY_MS
  ).toISOString()
  const w = await pool.query(
    `UPDATE course_order SET learner_id = $2, key = $3, until = $4
      WHERE inv_id = $1 AND key IS NULL RETURNING inv_id`,
    [order.inv_id, learnerId, key, until]
  )
  return w.rows.length ? { key, until } : null
}

/** Robokassa's ResultUrl2 notification: verify, claim once, mint, tell. */
export async function settle(
  pool: Queryable,
  form: Record<string, string>,
  deps: CheckoutDeps
): Promise<CheckoutReply> {
  const env = deps.env ?? process.env
  const cfg = checkoutConfig(env)
  const pass2 = String(env.ROBOKASSA_PASSWORD_2 || '')
  if (!resultSignatureOk(form, pass2)) return { status: 400, text: 'bad sign' }
  const invId = Number(form.InvId)
  if (!Number.isInteger(invId) || invId < 1 || invId > INT32_MAX)
    return { status: 400, text: 'bad inv' }
  await ensureCheckoutTables(pool)
  const found = await pool.query(
    `SELECT inv_id, email, route, rub, status, key, pay_via FROM course_order WHERE inv_id = $1`,
    [invId]
  )
  const order = found.rows[0]
  // A TON order is settled by the chain only, never by a Robokassa notice.
  if (!order || (order.pay_via && order.pay_via !== 'robokassa'))
    return { status: 404, text: 'unknown order' }
  const paid = Number(form.OutSum)
  if (!Number.isFinite(paid) || Math.abs(paid - Number(order.rub)) > 0.005)
    return { status: 400, text: 'bad sum' }
  const now = (deps.now ?? (() => new Date()))()
  const secret = cfg.on ? cfg.secret : courseKeySecret(env)
  if (order.status === 'paid') {
    // A replay. Answer OK; mint only if an earlier delivery claimed the
    // order and then failed before its key was stored.
    if (!order.key) await fulfil(pool, order, secret, now)
    return { status: 200, text: `OK${invId}` }
  }
  const claim = await pool.query(
    `UPDATE course_order SET status = 'paid', paid_at = now()
      WHERE inv_id = $1 AND status = 'pending' RETURNING inv_id, email, route, rub, from_placement, source`,
    [invId]
  )
  if (!claim.rows.length) return { status: 200, text: `OK${invId}` }
  const won = claim.rows[0]
  const minted = await fulfil(pool, won, secret, now)
  await tell(deps, paidNotice(won, `${won.rub} RUB`, minted))
  return { status: 200, text: `OK${invId}` }
}

/** The owner's paid-club notice, the same words for every rail. */
function paidNotice(
  won: {
    email: unknown
    route: unknown
    from_placement?: unknown
    source?: unknown
  },
  paid: string,
  minted: { until: string } | null
): string {
  return (
    `Course checkout: ${maskEmail(String(won.email))} paid ${paid} on t27.ai for "${won.route}"` +
    saleOrigin(won) +
    (minted
      ? `, paid key valid until ${minted.until.slice(0, 10)}.`
      : ', but NO key was minted (course keys are off) -- check SESSION_SIGNING_KEY.')
  )
}

/** GET's TON block: on with a fresh rate and the wallet set, else off. */
export async function tonOffer(
  env: NodeJS.ProcessEnv,
  fetchFn?: typeof fetch,
  nowMs?: number
): Promise<
  | { on: false }
  | {
      on: true
      amount: number
      address: string
      rate: number
      rateDate: string
    }
> {
  const cfg = tonConfig(env)
  // No key secret, no key: TON is not taken for a key that cannot be minted.
  if (!cfg.on || !courseKeySecret(env)) return { on: false }
  const fx = await tonUsd(fetchFn, nowMs)
  if (!fx) return { on: false }
  return {
    on: true,
    amount: nanoToTon(tonNano(CLUB_USD, fx.rate)),
    address: cfg.address,
    rate: fx.rate,
    rateDate: fx.date,
  }
}

/** The transfer a TON order asks for, from its own row. */
function tonTransfer(
  row: { ton_code: unknown; ton_nano: unknown; expires_at: unknown },
  env: NodeJS.ProcessEnv
): Record<string, unknown> {
  const cfg = tonConfig(env)
  const address = cfg.on ? cfg.address : ''
  const nano = BigInt(String(row.ton_nano ?? '0'))
  const comment = String(row.ton_code ?? '')
  return {
    address,
    amount: nanoToTon(nano),
    nano: nano.toString(),
    comment,
    link: address ? tonLink(address, nano, comment) : null,
    expiresAt: row.expires_at
      ? new Date(row.expires_at as string | Date).toISOString()
      : null,
  }
}

/** POST /api/course/checkout with pay:'ton': store the order, hand back the transfer. */
export async function createTonOrder(
  pool: Queryable,
  body: Record<string, unknown>,
  deps: CheckoutDeps
): Promise<CheckoutReply> {
  const env = deps.env ?? process.env
  const cfg = tonConfig(env)
  if (!cfg.on || !courseKeySecret(env))
    return { status: 200, body: { ok: false, reason: 'off' } }
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase()
  if (email.length > 254 || !EMAIL.test(email))
    return { status: 200, body: { ok: false, reason: 'bad_email' } }
  const route = String(body.route ?? '')
  if (!ROUTE.test(route))
    return { status: 200, body: { ok: false, reason: 'bad_route' } }
  const now = (deps.now ?? (() => new Date()))()
  const fx = await tonUsd(deps.fetchTon, now.getTime())
  if (!fx) return { status: 200, body: { ok: false, reason: 'no_rate' } }
  await ensureCheckoutTables(pool)
  const nano = tonNano(CLUB_USD, fx.rate)
  const expires = new Date(now.getTime() + TON_ORDER_MS)
  // Any language may pay in TON; the tag is kept only for the record.
  const lang =
    typeof body.lang === 'string' && /^[a-z]{2}$/i.test(body.lang)
      ? body.lang.toLowerCase()
      : 'und'
  const id = crypto.randomBytes(24).toString('base64url') // 32 chars
  let code = ''
  for (let i = 0; i < CODE_TRIES && !code; i++) {
    const c = orderCode()
    try {
      // rub is 0: a TON order carries no rouble amount; ton_nano is its price.
      await pool.query(
        `INSERT INTO course_order
           (id, email, route, lang, rub, pay_via, from_placement, source,
            ton_code, ton_nano, created_at, expires_at)
         VALUES ($1, $2, $3, $4, 0, 'ton', $5, $6, $7, $8, $9, $10)`,
        [
          id,
          email,
          route,
          lang,
          tag(body.from),
          tag(body.source),
          c,
          nano.toString(),
          now.toISOString(),
          expires.toISOString(),
        ]
      )
      code = c
    } catch (e) {
      if ((e as { code?: string })?.code !== '23505') throw e
    }
  }
  if (!code) return { status: 503, body: { ok: false, reason: 'busy' } }
  return {
    status: 200,
    body: {
      ok: true,
      order: id,
      ton: tonTransfer(
        { ton_code: code, ton_nano: nano.toString(), expires_at: expires },
        env
      ),
    },
  }
}

/**
 * A pending TON order: read the wallet, and when a transfer pays this order,
 * claim it once (the same atomic UPDATE as the rouble rail, plus the tx hash
 * under a unique index, so one transfer never pays two orders), then mint
 * through the same fulfil() and tell the owner. An unreadable chain changes
 * nothing; an order past its window with no paying transfer is 'expired'.
 */
async function settleTon(
  pool: Queryable,
  orderId: string,
  row: Record<string, any>,
  deps: CheckoutDeps
): Promise<'paid' | 'pending' | 'expired'> {
  const env = deps.env ?? process.env
  const now = (deps.now ?? (() => new Date()))()
  const secret = courseKeySecret(env)
  if (row.status === 'paid') {
    // Claimed earlier and failed before its key was stored: mint now.
    if (!row.key) await fulfil(pool, row as any, secret, now)
    return 'paid'
  }
  if (row.status !== 'pending') return 'pending'
  const createdMs = new Date(row.created_at).getTime()
  const expiresMs = new Date(row.expires_at).getTime()
  if (!Number.isFinite(createdMs) || !Number.isFinite(expiresMs))
    return 'pending'
  if (now.getTime() > expiresMs + TON_LATE_LOOK_MS) return 'expired'
  const cfg = tonConfig(env)
  if (!cfg.on) return now.getTime() > expiresMs ? 'expired' : 'pending'
  const order = {
    code: String(row.ton_code ?? ''),
    nano: BigInt(String(row.ton_nano ?? '0')),
    createdMs,
    expiresMs,
  }
  if (!order.code || order.nano <= 0n) return 'pending'
  let txs
  try {
    txs = await walletTxs(cfg, deps.fetchTon, now.getTime())
  } catch (e) {
    if (e instanceof TonUnreadable) return 'pending'
    throw e
  }
  for (const tx of txs) {
    if (!txPaysTonOrder(tx, order)) continue
    let claim
    try {
      claim = await pool.query(
        `UPDATE course_order SET status = 'paid', paid_at = now(), ton_tx = $2
          WHERE id = $1 AND status = 'pending' AND pay_via = 'ton'
          RETURNING inv_id, email, route, ton_nano, from_placement, source`,
        [orderId, tx.hash]
      )
    } catch (e) {
      // This transfer already paid another order: it pays nothing here.
      if ((e as { code?: string })?.code === '23505') continue
      throw e
    }
    if (!claim.rows.length) return 'paid' // another poll claimed it first
    const won = claim.rows[0]
    const minted = await fulfil(pool, won, secret, now)
    const ton = nanoToTon(BigInt(String(won.ton_nano)))
    await tell(deps, paidNotice(won, `${ton} TON`, minted))
    return 'paid'
  }
  return now.getTime() > expiresMs ? 'expired' : 'pending'
}

/** ", via blog:foo / source x" -- only the parts the order carries. */
function saleOrigin(o: { from_placement?: unknown; source?: unknown }): string {
  const parts: string[] = []
  if (o.from_placement) parts.push(`via ${String(o.from_placement)}`)
  if (o.source) parts.push(`source ${String(o.source)}`)
  return parts.length ? ` (${parts.join(' / ')})` : ''
}

/** The five routes, one handler; render-server.ts writes what it returns. */
export async function handleCheckout(
  req: { url?: string; method?: string; headers?: Record<string, unknown> },
  deps: CheckoutDeps
): Promise<CheckoutReply> {
  const url = new URL(req.url || '/', 'http://local')
  const path = url.pathname
  const env = deps.env ?? process.env
  if (path === '/api/course/checkout' && req.method === 'GET') {
    const now = (deps.now ?? (() => new Date()))()
    const ton = await tonOffer(env, deps.fetchTon, now.getTime())
    if (!checkoutConfig(env).on)
      return { status: 200, body: { on: false, ton } }
    const p = await clubPrice(env, deps.fetchRate, now.getTime())
    return { status: 200, body: { on: true, ...p, ton } }
  }
  if (path === '/api/course/checkout/return' && req.method === 'GET')
    return returnTo(await deps.getPool(), url.searchParams.get('order') || '')
  if (path === '/api/course/checkout/order' && req.method === 'GET')
    return orderStatus(
      await deps.getPool(),
      url.searchParams.get('id') || '',
      deps
    )
  if (path === '/api/course/checkout/result') {
    let form: Record<string, string>
    if (req.method === 'GET') form = Object.fromEntries(url.searchParams)
    else if (req.method === 'POST') {
      const raw = (await deps.readBody(req)) || ''
      const ct = String(req.headers?.['content-type'] ?? '')
      if (/json/i.test(ct)) {
        try {
          const j = JSON.parse(raw) as Record<string, unknown>
          form = Object.fromEntries(
            Object.entries(j).map(([k, v]) => [k, String(v ?? '')])
          )
        } catch {
          return { status: 400, text: 'bad body' }
        }
      } else form = Object.fromEntries(new URLSearchParams(raw))
    } else return { status: 405, text: 'method' }
    return settle(await deps.getPool(), form, deps)
  }
  if (path === '/api/course/checkout' && req.method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = JSON.parse((await deps.readBody(req)) || '{}')
    } catch {
      return { status: 400, body: { ok: false, reason: 'bad_json' } }
    }
    if (!body || typeof body !== 'object')
      return { status: 400, body: { ok: false, reason: 'bad_json' } }
    if (body.pay === 'ton')
      return createTonOrder(await deps.getPool(), body, deps)
    if (!checkoutConfig(env).on)
      return { status: 200, body: { ok: false, reason: 'off' } }
    return createOrder(await deps.getPool(), body, deps)
  }
  return { status: 405, body: { ok: false, reason: 'method' } }
}
