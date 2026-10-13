/**
 * THE CLUB, PAID ON t27.ai IN TON, FOR A READER WITHOUT TELEGRAM.
 *
 * Owner, 2026-10-13: next to the rouble checkout, "or with crypto". A reader
 * of any language may pay the same club period (CLUB_USD, the club's Stars at
 * the shared star value) in native TON to the bot's own wallet. Nothing here
 * involves any project token: no token payment, no token reward, no token
 * price. TON is accepted as payment for a service, and that is all.
 *
 * Reused from the bot, not invented:
 *  - the wallet: the bot's TON_WALLET_ADDRESS (src/core/ton/config.ts), with
 *    its TON_NETWORK (mainnet by default) and its optional TON_API_KEY;
 *  - the chain read: toncenter v2 getTransactions with archival=true, the
 *    in_msg value in nanoton and the text comment, exactly as
 *    src/core/ton/index.ts getNativeTransactions reads it;
 *  - the rule that "I could not look" is not "nobody paid"
 *    (src/core/ton/chainRead.ts): an unreadable chain leaves the order
 *    pending, it never answers "not paid".
 *
 * The TON/USD rate is CoinGecko's public simple-price answer, cached 10
 * minutes. With no fresh rate the TON offer is off: a rate is never guessed,
 * and a stale one is not kept past its 10 minutes.
 *
 * This module holds the pieces that need no database: config, rate, amount,
 * order code, deeplink and the chain read. The order flow (create, claim,
 * mint) lives in course-checkout.ts next to the rouble flow and its fulfil().
 */
import crypto from 'node:crypto'

/** CoinGecko's keyless simple-price endpoint for TON in dollars. */
export const TON_RATE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd&include_last_updated_at=true'
const TONCENTER = {
  mainnet: 'https://toncenter.com/api/v2',
  testnet: 'https://testnet.toncenter.com/api/v2',
} as const

// t27-plumbing: a cache lifetime for a market rate, 10 minutes
const TON_RATE_TTL_MS = 10 * 60 * 1000
// t27-plumbing: a network timeout, the same deadline chainRead.ts holds
const TON_FETCH_TIMEOUT_MS = 15_000
// One read of the wallet serves every poll, so the site's polling never runs
// into toncenter's keyless rate limit.
// t27-plumbing: a cache lifetime for one wallet read, 10 seconds
const TON_TXS_TTL_MS = 10_000
// t27-plumbing: how many recent wallet transactions one read asks for, as the bot's
const TON_TXS_LIMIT = 50
// t27-plumbing: a unit, nanoton per TON
const NANO_PER_TON = 1_000_000_000n
// t27-plumbing: a rounding step of 0.1 TON, in nanoton
const NANO_PER_TENTH = 100_000_000n
/** A user-friendly TON address (48 base64url chars) or a raw one (wc:hex). */
const TON_ADDRESS = /^(?:[A-Za-z0-9_-]{48}|-?\d{1,3}:[0-9a-fA-F]{64})$/
/** The order code's alphabet: no 0/O/1/I/L, so it survives being retyped. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
// t27-plumbing: an order code length, about 40 bits of randomness
const CODE_CHARS = 8

export type TonConfig =
  | { on: false }
  | {
      on: true
      address: string
      network: 'mainnet' | 'testnet'
      apiKey: string
      api: string
    }

/** On only when the bot's wallet address is set and looks like an address. */
export function tonConfig(env: NodeJS.ProcessEnv = process.env): TonConfig {
  const address = String(env.TON_WALLET_ADDRESS ?? '').trim()
  if (!TON_ADDRESS.test(address)) return { on: false }
  const network =
    String(env.TON_NETWORK ?? '').trim() === 'testnet' ? 'testnet' : 'mainnet'
  return {
    on: true,
    address,
    network,
    apiKey: String(env.TON_API_KEY ?? '').trim(),
    api: TONCENTER[network],
  }
}

export interface TonUsd {
  /** Dollars per TON. */
  rate: number
  /** CoinGecko's own time for the rate, ISO 8601. */
  date: string
  source: 'coingecko' | 'cache'
}

let lastRate: (TonUsd & { at: number }) | null = null
let lastTxs: { key: string; at: number; txs: TonInTx[] } | null = null
export function forgetTonForTests(): void {
  lastRate = null
  lastTxs = null
}

/** TON/USD from CoinGecko, cached 10 minutes; null when there is none. */
export async function tonUsd(
  fetchFn: typeof fetch = globalThis.fetch,
  nowMs: number = Date.now()
): Promise<TonUsd | null> {
  if (lastRate && nowMs - lastRate.at < TON_RATE_TTL_MS)
    return { rate: lastRate.rate, date: lastRate.date, source: 'cache' }
  try {
    const r = await fetchFn(TON_RATE_URL, {
      signal: AbortSignal.timeout(TON_FETCH_TIMEOUT_MS),
    })
    if (!r.ok) throw new Error(`coingecko ${r.status}`)
    const j = (await r.json()) as {
      'the-open-network'?: { usd?: number; last_updated_at?: number }
    }
    const rate = Number(j?.['the-open-network']?.usd)
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('no TON rate')
    const at = Number(j['the-open-network']?.last_updated_at)
    const date = new Date(
      Number.isFinite(at) && at > 0 ? at * 1000 : nowMs
    ).toISOString()
    lastRate = { rate, date, source: 'coingecko', at: nowMs }
    return { rate, date, source: 'coingecko' }
  } catch {
    // No guess and no stale rate: the TON offer is simply off for now.
    return null
  }
}

/** Nanoton for a dollar price at a rate: usd / rate, rounded UP to 0.1 TON. */
export function tonNano(usd: number, rate: number): bigint {
  // Rounded to 1e-6 first, so float noise never adds a whole step.
  const tenths = Math.round((usd / rate) * 10 * 1e6) / 1e6
  return BigInt(Math.ceil(tenths)) * NANO_PER_TENTH
}

/** A nanoton amount as TON, e.g. 29500000000n -> 29.5. */
export function nanoToTon(nano: bigint): number {
  return (
    Number(nano / NANO_PER_TON) + Number(nano % NANO_PER_TON) / 1_000_000_000
  )
}

/** A short order code for the transfer comment, e.g. T27-K7QX2MPA. */
export function orderCode(): string {
  let s = ''
  for (let i = 0; i < CODE_CHARS; i++)
    s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
  return `T27-${s}`
}

/** ton://transfer/<address>?amount=<nano>&text=<comment>. */
export function tonLink(
  address: string,
  nano: bigint,
  comment: string
): string {
  return `ton://transfer/${address}?amount=${nano.toString()}&text=${encodeURIComponent(comment)}`
}

/** One incoming native-TON transfer, as the bot's reader shapes it. */
export interface TonInTx {
  hash: string
  /** Seconds since the epoch. */
  utime: number
  nano: bigint
  comment: string
}

/** The text comment of an in_msg: msg.dataText (base64), else `message`. */
function commentOf(inMsg: Record<string, any>): string {
  const d = inMsg?.msg_data
  try {
    if (d?.['@type'] === 'msg.dataText' && typeof d.text === 'string')
      return Buffer.from(d.text, 'base64').toString('utf-8')
  } catch {
    // fall through to the decoded field
  }
  return typeof inMsg?.message === 'string' ? inMsg.message : ''
}

/** Thrown when the chain could not be read; says nothing about payment. */
export class TonUnreadable extends Error {
  readonly chainUnreadable = true as const
}

/**
 * The wallet's recent incoming transfers, one toncenter read shared by every
 * poll for 10 seconds. Throws TonUnreadable on any failure, never [] for it.
 */
export async function walletTxs(
  cfg: Extract<TonConfig, { on: true }>,
  fetchFn: typeof fetch = globalThis.fetch,
  nowMs: number = Date.now()
): Promise<TonInTx[]> {
  const key = `${cfg.api}|${cfg.address}`
  if (lastTxs && lastTxs.key === key && nowMs - lastTxs.at < TON_TXS_TTL_MS)
    return lastTxs.txs
  const url =
    `${cfg.api}/getTransactions?address=${encodeURIComponent(cfg.address)}` +
    `&limit=${TON_TXS_LIMIT}&archival=true`
  const headers: Record<string, string> = {}
  if (cfg.apiKey) headers['X-API-Key'] = cfg.apiKey
  let data: { ok?: boolean; result?: unknown[]; error?: unknown }
  try {
    const r = await fetchFn(url, {
      headers,
      signal: AbortSignal.timeout(TON_FETCH_TIMEOUT_MS),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status} from toncenter`)
    data = (await r.json()) as typeof data
  } catch (e) {
    throw new TonUnreadable(e instanceof Error ? e.message : String(e))
  }
  if (!data?.ok || !Array.isArray(data.result))
    throw new TonUnreadable(String(data?.error ?? 'ok: false'))
  const txs: TonInTx[] = []
  for (const tx of data.result as any[]) {
    const m = tx?.in_msg
    if (!m || !m.source || !m.value) continue
    let nano: bigint
    try {
      nano = BigInt(String(m.value))
    } catch {
      continue
    }
    const hash = String(tx.transaction_id?.hash || tx.hash || '')
    if (nano <= 0n || !hash) continue
    txs.push({
      hash,
      utime: Number(tx.utime) || 0,
      nano,
      comment: commentOf(m),
    })
  }
  lastTxs = { key, at: nowMs, txs }
  return txs
}

/**
 * Does this transfer pay this order? Its comment is the order's code, it
 * carries at least the frozen amount, and it landed inside the order's own
 * window -- never before the order was made, never after it expired.
 */
// t27-plumbing: a match of toncenter's data against the stored order row
export function txPaysTonOrder(
  tx: TonInTx,
  order: { code: string; nano: bigint; createdMs: number; expiresMs: number }
): boolean {
  if (tx.comment.trim().toUpperCase() !== order.code) return false
  if (tx.nano < order.nano) return false
  return (
    tx.utime >= Math.floor(order.createdMs / 1000) &&
    tx.utime <= Math.ceil(order.expiresMs / 1000)
  )
}
