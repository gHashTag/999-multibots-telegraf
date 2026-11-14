/**
 * TRI WALLET BINDING: which wallets a person says their TRI should go to --
 * TON, EVM, Solana and TRON (spec automation/tri-wallet-chains.t27).
 *
 * Nothing here moves a coin. No TRI contract is deployed; this only records,
 * with proof, that the person signed in as telegram_id X controls wallet W, so
 * that a later mint has an address it did not have to take on anybody's word.
 *
 * THE PROOF IS TON CONNECT'S `ton_proof`, checked here and nowhere else:
 *
 *   message = "ton-proof-item-v2/" ++ workchain (int32 BE) ++ address hash (32)
 *             ++ domain length (uint32 LE) ++ domain ++ timestamp (uint64 LE)
 *             ++ payload
 *   signed  = sha256(0xffff ++ "ton-connect" ++ sha256(message))
 *
 * and the key it must verify under is taken from the wallet's own state init,
 * never from the request: the state init is accepted only when it hashes to
 * the claimed address, so the key in its data is the key that address was
 * deployed with. A client-supplied public key is ignored -- trusting it would
 * let anybody sign for any address with a key of their own.
 *
 * WHICH CREDENTIAL MAY BIND. Only the person's own: a mini-app initData
 * signature or the app session. Not an agent key, not the server key with an
 * explicit telegram_id, not a game token. A bound wallet is where TRI would be
 * paid, so whoever can bind can redirect it; a credential handed to an agent,
 * or minted under a prompt that asked only for a name and a picture
 * (GAME_TOKEN_TOOLS in src/agent/routes.ts), must not be able to.
 *
 * THE OTHER CHAINS (src/tri-wallet-chains.ts) sign text: an EVM, Solana or
 * TRON wallet signs the spec's message carrying the person's nonce, and the
 * server rebuilds that message and checks the signature against the key the
 * address itself fixes. Inside Telegram a phone has no such wallet, so the
 * mini app opens the wallet's OWN browser at /tri/bind with the nonce in the
 * fragment. That page has no credential and may only PROPOSE the address it
 * signed for (/api/tri/wallet/propose); the binding is the person's own
 * confirmation in the mini app, where they see the address (spec may_propose,
 * may_confirm). A nonce that leaks can put a proposal in front of the person,
 * never a binding.
 *
 * WHY AN EVENT LOG BESIDE THE TABLE. tri_wallets says where TRI goes now;
 * tri_wallet_events says where it went before and when that changed. A payout
 * address that can be changed without a trace is the first thing anybody
 * stealing a payout would change.
 */

import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  Address,
  Cell,
  contractAddress,
  loadStateInit,
  type StateInit,
} from '@ton/core'
import * as SPEC from './spec/tri-wallet-chains.gen'
import {
  checksSignature,
  mayBind,
  mayCallPublic,
  mayConfirm,
  mayIssue,
  mayPropose,
  paidOn,
  proofExpired,
  proofFromFuture,
  proposalBinds,
} from './spec/tri-wallet-chains.logic'
import {
  CHAIN_ID,
  bindMessage,
  checkChainProof,
  isNonceShape,
  parseAddress,
  proofAge,
  textChainOf,
  TEXT_CHAIN_NETWORK,
  type ChainName,
  type ChainProofInput,
  type TextChain,
} from './tri-wallet-chains'

/** TON Connect network ids: mainnet and testnet. */
export const TON_NETWORKS = [SPEC.TON_MAINNET, SPEC.TON_TESTNET] as const
export type TonNetwork = (typeof TON_NETWORKS)[number]

/** How long an issued payload, and a signed proof, stay acceptable. */
export const PROOF_TTL_MS = SPEC.PROOF_TTL_MS
/** Unspent challenges one person may hold at once. */
export const MAX_OPEN_CHALLENGES = SPEC.MAX_OPEN_CHALLENGES

export interface TonProofInput {
  address: string
  network: string
  stateInit: string
  proof: {
    timestamp: number
    domain: { lengthBytes: number; value: string }
    signature: string
    payload: string
  }
}

export type ProofCheck =
  | { ok: true; address: Address; network: TonNetwork; publicKey: string }
  | { ok: false; code: string }

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/**
 * Where a standard wallet keeps its key in its data cell, in bits:
 * v1/v2 seqno(32); v3/v4 seqno(32) subwallet(32); v5 a signature flag(1)
 * seqno(32) wallet_id(32). The key is accepted only if the signature verifies
 * under it, and the data is fixed by the address, so trying each offset gives
 * an attacker nothing: they cannot choose the data behind somebody else's
 * address.
 */
const KEY_OFFSETS = [64, 65, 32] as const

function keysInData(init: StateInit): Buffer[] {
  if (!init.data) return []
  const out: Buffer[] = []
  for (const offset of KEY_OFFSETS) {
    try {
      const s = init.data.beginParse()
      if (s.remainingBits < offset + 256) continue
      s.skip(offset)
      out.push(s.loadBuffer(32))
    } catch {
      // A layout this offset does not fit; the next one may.
    }
  }
  return out
}

export function tonProofMessage(
  address: Address,
  domain: string,
  timestampSec: number,
  payload: string
): Buffer {
  const wc = Buffer.alloc(4)
  wc.writeInt32BE(address.workChain)
  const domainBytes = Buffer.from(domain, 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(domainBytes.length)
  const ts = Buffer.alloc(8)
  ts.writeBigUInt64LE(BigInt(timestampSec))
  const message = Buffer.concat([
    Buffer.from('ton-proof-item-v2/', 'utf8'),
    wc,
    address.hash,
    len,
    domainBytes,
    ts,
    Buffer.from(payload, 'utf8'),
  ])
  const inner = createHash('sha256').update(message).digest()
  return createHash('sha256')
    .update(
      Buffer.concat([
        Buffer.from([0xff, 0xff]),
        Buffer.from('ton-connect', 'utf8'),
        inner,
      ])
    )
    .digest()
}

function ed25519Verifies(
  key: Buffer,
  signed: Buffer,
  signature: Buffer
): boolean {
  try {
    const pub = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, key]),
      format: 'der',
      type: 'spki',
    })
    return verify(null, signed, pub, signature)
  } catch {
    return false
  }
}

/**
 * Pure: everything about a proof that does not need the database. The payload
 * is checked for shape here and for ownership by consumeChallenge.
 */
export function checkTonProof(
  input: TonProofInput,
  expectedDomain: string,
  nowMs: number
): ProofCheck {
  if (!(TON_NETWORKS as readonly string[]).includes(input.network))
    return { ok: false, code: 'network_unknown' }
  const network = input.network as TonNetwork

  let address: Address
  try {
    address = Address.parseRaw(input.address)
  } catch {
    return { ok: false, code: 'address_malformed' }
  }
  if (address.workChain !== 0) return { ok: false, code: 'workchain_refused' }

  const p = input.proof
  if (!p || typeof p !== 'object') return { ok: false, code: 'proof_missing' }
  if (p.domain?.value !== expectedDomain)
    return { ok: false, code: 'domain_mismatch' }
  if (Buffer.byteLength(p.domain.value, 'utf8') !== p.domain.lengthBytes)
    return { ok: false, code: 'domain_length_mismatch' }
  if (!Number.isSafeInteger(p.timestamp) || p.timestamp <= 0)
    return { ok: false, code: 'timestamp_malformed' }
  const age = proofAge(p.timestamp * 1000, nowMs)
  if (proofExpired(age)) return { ok: false, code: 'proof_expired' }
  if (proofFromFuture(age)) return { ok: false, code: 'proof_from_future' }
  if (!isChallengeShape(p.payload))
    return { ok: false, code: 'payload_malformed' }

  let init: StateInit
  try {
    init = loadStateInit(Cell.fromBase64(input.stateInit).beginParse())
  } catch {
    return { ok: false, code: 'state_init_malformed' }
  }
  if (!contractAddress(address.workChain, init).equals(address))
    return { ok: false, code: 'state_init_not_this_address' }

  let signature: Buffer
  try {
    signature = Buffer.from(p.signature, 'base64')
  } catch {
    return { ok: false, code: 'signature_malformed' }
  }
  if (signature.length !== 64) return { ok: false, code: 'signature_malformed' }

  const signed = tonProofMessage(
    address,
    p.domain.value,
    p.timestamp,
    p.payload
  )
  const key = keysInData(init).find(k => ed25519Verifies(k, signed, signature))
  if (!key) return { ok: false, code: 'signature_invalid' }
  return { ok: true, address, network, publicKey: key.toString('hex') }
}

/** 32 random bytes, hex: what a payload we issued looks like. */
export function newChallenge(): string {
  return randomBytes(32).toString('hex')
}

export function isChallengeShape(s: unknown): s is string {
  return isNonceShape(s)
}

/** The form a person reads: non-bounceable, testnet-flagged on testnet. */
export function friendlyAddress(raw: string, network: TonNetwork): string {
  return Address.parseRaw(raw).toString({
    bounceable: false,
    testOnly: network === '-3',
  })
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

interface Queryable {
  query(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: any[]; rowCount?: number | null }>
}

export async function ensureTriWalletTables(pool: Queryable): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tri_wallet_challenges (
      payload text PRIMARY KEY,
      telegram_id text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS tri_wallet_challenges_owner
       ON tri_wallet_challenges (telegram_id, expires_at)`
  )
  // The wallet browser's proposal rides on the nonce it signed (spec
  // may_propose): which address, on which chain, and the key it proved.
  await pool.query(`
    ALTER TABLE tri_wallet_challenges
      ADD COLUMN IF NOT EXISTS proposed_chain text,
      ADD COLUMN IF NOT EXISTS proposed_network text,
      ADD COLUMN IF NOT EXISTS proposed_address text,
      ADD COLUMN IF NOT EXISTS proposed_key text,
      ADD COLUMN IF NOT EXISTS proposed_at timestamptz`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tri_wallets (
      telegram_id text NOT NULL,
      chain text NOT NULL,
      network text NOT NULL,
      address text NOT NULL,
      public_key text NOT NULL,
      bound_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (telegram_id, chain, network),
      UNIQUE (chain, network, address),
      CONSTRAINT tri_wallets_chain_network_check CHECK (${CHAIN_NETWORK_SQL})
    )`)
  // A table made before the other chains carries the TON-only checks; one
  // statement swaps them, so no moment exists with neither.
  await pool.query(`
    ALTER TABLE tri_wallets
      DROP CONSTRAINT IF EXISTS tri_wallets_chain_check,
      DROP CONSTRAINT IF EXISTS tri_wallets_network_check,
      DROP CONSTRAINT IF EXISTS tri_wallets_chain_network_check,
      ADD CONSTRAINT tri_wallets_chain_network_check CHECK (${CHAIN_NETWORK_SQL})`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tri_wallet_events (
      id bigserial PRIMARY KEY,
      telegram_id text NOT NULL,
      chain text NOT NULL,
      network text NOT NULL,
      address text NOT NULL,
      action text NOT NULL CHECK (action IN ('bind', 'unbind')),
      at timestamptz NOT NULL DEFAULT now()
    )`)
}

/** Every (chain, network) pair a row may hold, from the spec's names. */
const CHAIN_NETWORK_SQL = [
  `(chain = '${SPEC.CHAIN_TON_NAME}' AND network IN ('${SPEC.TON_MAINNET}', '${SPEC.TON_TESTNET}'))`,
  `(chain = '${SPEC.CHAIN_EVM_NAME}' AND network = '${SPEC.EVM_NETWORK}')`,
  `(chain = '${SPEC.CHAIN_SOLANA_NAME}' AND network = '${SPEC.SOLANA_NETWORK}')`,
  `(chain = '${SPEC.CHAIN_TRON_NAME}' AND network = '${SPEC.TRON_NETWORK}')`,
].join(' OR ')

let ensured: Promise<void> | null = null
function ensureOnce(pool: Queryable): Promise<void> {
  if (!ensured)
    ensured = ensureTriWalletTables(pool).catch(e => {
      ensured = null
      throw e
    })
  return ensured
}

/** Test seam: forget that the tables were ensured. */
export function resetTriWalletEnsureForTests(): void {
  ensured = null
}

export async function issueChallenge(
  pool: Queryable,
  telegramId: string,
  nowMs: number
): Promise<{ payload: string; expiresIn: number } | null> {
  await pool.query(
    `DELETE FROM tri_wallet_challenges
      WHERE telegram_id = $1 AND (expires_at <= $2 OR used_at IS NOT NULL)`,
    [telegramId, new Date(nowMs)]
  )
  const open = await pool.query(
    `SELECT count(*)::int AS n FROM tri_wallet_challenges
      WHERE telegram_id = $1`,
    [telegramId]
  )
  if (!mayIssue(open.rows[0]?.n ?? 0)) return null
  const payload = newChallenge()
  await pool.query(
    `INSERT INTO tri_wallet_challenges (payload, telegram_id, expires_at)
     VALUES ($1, $2, $3)`,
    [payload, telegramId, new Date(nowMs + PROOF_TTL_MS)]
  )
  return { payload, expiresIn: PROOF_TTL_MS / 1000 }
}

/** Spends a payload once, and only for the person it was issued to. */
export async function consumeChallenge(
  pool: Queryable,
  telegramId: string,
  payload: string,
  nowMs: number
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE tri_wallet_challenges SET used_at = $3
      WHERE payload = $1 AND telegram_id = $2
        AND used_at IS NULL AND expires_at > $3
      RETURNING payload`,
    [payload, telegramId, new Date(nowMs)]
  )
  return (r.rowCount ?? r.rows.length) === 1
}

export interface BoundWallet {
  chain: ChainName
  network: string
  address: string
  friendly: string
  boundAt: string
  /** TRI is paid to this address today (spec paid_on: TON until the bridge). */
  paid: boolean
}

/** What a person reads: TON's friendly form, the other chains as stored. */
function friendlyOf(chain: ChainName, network: string, address: string) {
  return chain === 'ton'
    ? friendlyAddress(address, network as TonNetwork)
    : address
}

function toBound(row: any): BoundWallet {
  const chain = String(row.chain ?? 'ton') as ChainName
  const network = String(row.network)
  return {
    chain,
    network,
    address: String(row.address),
    friendly: friendlyOf(chain, network, String(row.address)),
    boundAt: new Date(row.bound_at).toISOString(),
    paid: paidOn(CHAIN_ID[chain] ?? 0),
  }
}

export async function listWallets(
  pool: Queryable,
  telegramId: string
): Promise<BoundWallet[]> {
  const r = await pool.query(
    `SELECT chain, network, address, bound_at FROM tri_wallets
      WHERE telegram_id = $1 ORDER BY chain, network`,
    [telegramId]
  )
  return r.rows.map(toBound)
}

/** An address a wallet browser signed for, waiting for the person's yes. */
export interface Proposal {
  nonce: string
  chain: TextChain
  network: string
  address: string
  proposedAt: string
}

export async function listProposals(
  pool: Queryable,
  telegramId: string,
  nowMs: number
): Promise<Proposal[]> {
  const r = await pool.query(
    `SELECT payload, proposed_chain, proposed_network, proposed_address, proposed_at
       FROM tri_wallet_challenges
      WHERE telegram_id = $1 AND proposed_at IS NOT NULL
        AND used_at IS NULL AND expires_at > $2
      ORDER BY proposed_at`,
    [telegramId, new Date(nowMs)]
  )
  return r.rows.map(row => ({
    nonce: String(row.payload),
    chain: String(row.proposed_chain) as TextChain,
    network: String(row.proposed_network),
    address: String(row.proposed_address),
    proposedAt: new Date(row.proposed_at).toISOString(),
  }))
}

export type BindResult =
  | { ok: true; wallet: BoundWallet }
  | { ok: false; code: 'wallet_bound_elsewhere' }

export async function bindWallet(
  pool: Queryable,
  telegramId: string,
  chain: ChainName,
  network: string,
  address: string,
  publicKey: string
): Promise<BindResult> {
  const taken = await pool.query(
    `SELECT telegram_id FROM tri_wallets
      WHERE chain = $1 AND network = $2 AND address = $3`,
    [chain, network, address]
  )
  const holder = taken.rows[0]?.telegram_id
  if (!mayBind(true, holder != null && String(holder) !== telegramId))
    return { ok: false, code: 'wallet_bound_elsewhere' }

  let r: { rows: any[] }
  try {
    r = await pool.query(
      `INSERT INTO tri_wallets (telegram_id, chain, network, address, public_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (telegram_id, chain, network) DO UPDATE
         SET address = EXCLUDED.address, public_key = EXCLUDED.public_key,
             bound_at = now()
       RETURNING chain, network, address, bound_at`,
      [telegramId, chain, network, address, publicKey]
    )
  } catch (e) {
    // Two people binding one wallet at once: the check above passed for both,
    // and UNIQUE (chain, network, address) let only one through.
    if ((e as { code?: string })?.code === '23505')
      return { ok: false, code: 'wallet_bound_elsewhere' }
    throw e
  }
  await pool.query(
    `INSERT INTO tri_wallet_events (telegram_id, chain, network, address, action)
     VALUES ($1, $2, $3, $4, 'bind')`,
    [telegramId, chain, network, address]
  )
  return { ok: true, wallet: toBound(r.rows[0]) }
}

export async function unbindWallet(
  pool: Queryable,
  telegramId: string,
  chain: ChainName,
  network: string
): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM tri_wallets
      WHERE telegram_id = $1 AND chain = $2 AND network = $3
      RETURNING address`,
    [telegramId, chain, network]
  )
  const address = r.rows[0]?.address
  if (address == null) return false
  await pool.query(
    `INSERT INTO tri_wallet_events (telegram_id, chain, network, address, action)
     VALUES ($1, $2, $3, $4, 'unbind')`,
    [telegramId, chain, network, String(address)]
  )
  return true
}

/** The open nonce a wallet browser signed with: whose, open, proposed yet. */
async function nonceRow(pool: Queryable, nonce: string, nowMs: number) {
  const r = await pool.query(
    `SELECT telegram_id, proposed_chain, proposed_network, proposed_address,
            proposed_key, proposed_at, used_at, expires_at
       FROM tri_wallet_challenges WHERE payload = $1`,
    [nonce]
  )
  const row = r.rows[0]
  if (!row) return null
  return {
    telegramId: String(row.telegram_id),
    open: row.used_at == null && new Date(row.expires_at).getTime() > nowMs,
    proposed: row.proposed_at != null,
    chain: row.proposed_chain as TextChain | null,
    network: row.proposed_network as string | null,
    address: row.proposed_address as string | null,
    key: row.proposed_key as string | null,
  }
}

/** Records the first proposal on an open nonce; false if one beat it. */
async function storeProposal(
  pool: Queryable,
  nonce: string,
  p: { chain: TextChain; network: string; address: string; key: string },
  nowMs: number
) {
  const r = await pool.query(
    `UPDATE tri_wallet_challenges
        SET proposed_chain = $2, proposed_network = $3, proposed_address = $4,
            proposed_key = $5, proposed_at = $6
      WHERE payload = $1 AND used_at IS NULL AND expires_at > $6
        AND proposed_at IS NULL
      RETURNING payload`,
    [nonce, p.chain, p.network, p.address, p.key, new Date(nowMs)]
  )
  return (r.rowCount ?? r.rows.length) === 1
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export const TRI_WALLET_PATH = '/api/tri/wallet'
export const TRI_WALLET_CHALLENGE_PATH = '/api/tri/wallet/challenge'
/** Public: the text a wallet signs. Pure, no database, no person. */
export const TRI_WALLET_MESSAGE_PATH = '/api/tri/wallet/message'
/** Public: the wallet browser's proposal. The nonce is the only authority. */
export const TRI_WALLET_PROPOSE_PATH = '/api/tri/wallet/propose'

const ROUTES: Record<string, string[]> = {
  [TRI_WALLET_PATH]: ['GET', 'POST', 'DELETE'],
  [TRI_WALLET_CHALLENGE_PATH]: ['POST'],
  [TRI_WALLET_MESSAGE_PATH]: ['POST'],
  [TRI_WALLET_PROPOSE_PATH]: ['POST'],
}

/** The routes that answer without a person: auth.ts lists exactly these. */
export const TRI_WALLET_PUBLIC_PATHS = [
  TRI_WALLET_MESSAGE_PATH,
  TRI_WALLET_PROPOSE_PATH,
] as const

/**
 * Calls of the two public doors per caller address in the current window
 * (spec may_call_public). Memory only: a restart forgets, nothing is stored,
 * and past PUBLIC_CALLERS_TRACKED the oldest callers are let go.
 */
const publicCalls = new Map<string, { window: number; n: number }>()

export function countPublicCall(caller: string, nowMs: number): number {
  const window = Math.floor(nowMs / SPEC.PUBLIC_WINDOW_MS)
  const key = caller || 'unknown'
  const seen = publicCalls.get(key)
  if (seen && seen.window === window) {
    seen.n += 1
    return seen.n
  }
  publicCalls.delete(key)
  if (publicCalls.size >= SPEC.PUBLIC_CALLERS_TRACKED) {
    const oldest = publicCalls.keys().next().value
    if (oldest !== undefined) publicCalls.delete(oldest)
  }
  publicCalls.set(key, { window, n: 1 })
  return 1
}

/** Test seam: forget every counted call. */
export function resetPublicCallsForTests(): void {
  publicCalls.clear()
}

export interface TriWalletDeps {
  getPool: () => Queryable | Promise<Queryable>
  /** The person's own telegram_id, or null for any other credential. */
  personOf: (req: IncomingMessage) => string | null
  readBody: (req: IncomingMessage, maxBytes: number) => Promise<string>
  /** The caller's address, for the public doors' budget; forgeable. */
  callerOf?: (req: IncomingMessage) => string
  /** The host a proof must name: the player's, app.t27.ai. */
  proofDomain: string
  now?: () => number
  log?: (line: Record<string, unknown>) => void
}

function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** A TON unbind names its network; every other chain has exactly one. */
function unbindTarget(url: URL): { chain: ChainName; network: string } | null {
  const chainParam = url.searchParams.get('chain') ?? SPEC.CHAIN_TON_NAME
  const network = url.searchParams.get('network') ?? ''
  if (chainParam === SPEC.CHAIN_TON_NAME)
    return (TON_NETWORKS as readonly string[]).includes(network)
      ? { chain: 'ton', network }
      : null
  const chain = textChainOf(chainParam)
  return chain ? { chain, network: TEXT_CHAIN_NETWORK[chain] } : null
}

/**
 * Handles the TRI wallet routes and returns true, or returns false for any
 * other URL. Every answered request writes exactly one log line.
 */
export async function handleTriWallet(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TriWalletDeps
): Promise<boolean> {
  const path = (req.url || '').split('?')[0]
  const allowed = ROUTES[path]
  if (!allowed) return false

  const now = deps.now ?? Date.now
  const log =
    deps.log ??
    ((line: Record<string, unknown>) =>
      console.log(JSON.stringify({ event: 'tri_wallet', ...line })))
  const route = `${req.method} ${path}`
  const answer = (
    code: number,
    body: unknown,
    outcome: string,
    extra: Record<string, unknown> = {}
  ) => {
    log({ route, status: code, outcome, ...extra })
    send(res, code, body)
    return true
  }

  if (!allowed.includes(req.method || ''))
    return answer(405, { error: 'method_not_allowed' }, 'method_not_allowed')

  const readJson = async (): Promise<any | null> => {
    try {
      const v = JSON.parse((await deps.readBody(req, 16 * 1024)) || '{}')
      return v && typeof v === 'object' ? v : null
    } catch {
      return null
    }
  }

  // The doors without a person answer each caller a budget per window;
  // past it nothing is read, checked or written (spec may_call_public).
  const isPublicDoor = (TRI_WALLET_PUBLIC_PATHS as readonly string[]).includes(
    path
  )
  if (
    isPublicDoor &&
    !mayCallPublic(countPublicCall(deps.callerOf?.(req) ?? '', now()))
  )
    return answer(429, { error: 'too_many_requests' }, 'too_many_requests')

  // The text a wallet signs: pure, so it needs neither a person nor the
  // database. A chain or address it cannot parse gets no text to sign.
  if (path === TRI_WALLET_MESSAGE_PATH) {
    const body = await readJson()
    if (!body) return answer(400, { error: 'body_malformed' }, 'body_malformed')
    const chain = textChainOf(body.chain)
    if (!chain) return answer(400, { error: 'chain_unknown' }, 'chain_unknown')
    const parsed = parseAddress(chain, body.address)
    if (!parsed)
      return answer(400, { error: 'address_malformed' }, 'address_malformed')
    if (!isNonceShape(body.nonce))
      return answer(400, { error: 'payload_malformed' }, 'payload_malformed')
    const issuedAt = new Date(now()).toISOString()
    const message = bindMessage({
      domain: deps.proofDomain,
      chain,
      address: parsed.canonical,
      nonce: body.nonce,
      issuedAt,
    })
    return answer(
      200,
      { message, issuedAt, address: parsed.canonical },
      'message',
      { chain }
    )
  }

  const isPropose = path === TRI_WALLET_PROPOSE_PATH
  const who = isPropose ? null : deps.personOf(req)
  if (!isPropose && !mayBind(who !== null, false))
    return answer(401, { error: 'person_required' }, 'person_required')

  let pool: Queryable
  try {
    pool = await deps.getPool()
    await ensureOnce(pool)
  } catch {
    return answer(
      503,
      { error: 'database_unavailable' },
      'database_unavailable'
    )
  }

  try {
    // The wallet's own browser: no credential, so it may only propose.
    if (isPropose) {
      const body = await readJson()
      if (!body)
        return answer(400, { error: 'body_malformed' }, 'body_malformed')
      // The nonce first: a signature is checked only on an open nonce
      // nobody proposed on (spec checks_signature), so a dead one is cheap.
      const row = isNonceShape(body.nonce)
        ? await nonceRow(pool, body.nonce, now())
        : null
      const open = row?.open === true
      const proposedBefore = row?.proposed === true
      if (!checksSignature(open, proposedBefore)) {
        const code = open ? 'already_proposed' : 'payload_unknown'
        return answer(400, { error: code }, code)
      }
      const checked = checkChainProof(
        body as ChainProofInput,
        deps.proofDomain,
        now()
      )
      const may = mayPropose(open, checked.ok, proposedBefore)
      if (!may || !checked.ok) {
        const code = !checked.ok
          ? checked.code
          : !row?.open
            ? 'payload_unknown'
            : 'already_proposed'
        return answer(400, { error: code }, code)
      }
      const stored = await storeProposal(
        pool,
        body.nonce,
        {
          chain: checked.chain,
          network: checked.network,
          address: checked.address,
          key: checked.publicKey,
        },
        now()
      )
      if (!stored)
        return answer(400, { error: 'already_proposed' }, 'already_proposed')
      return answer(
        200,
        { proposed: true, chain: checked.chain, address: checked.address },
        'proposed',
        { chain: checked.chain }
      )
    }

    const person = who as string

    if (path === TRI_WALLET_CHALLENGE_PATH) {
      const issued = await issueChallenge(pool, person, now())
      if (!issued)
        return answer(
          429,
          { error: 'too_many_challenges' },
          'too_many_challenges'
        )
      return answer(200, issued, 'challenge_issued')
    }

    if (req.method === 'GET')
      return answer(
        200,
        {
          wallets: await listWallets(pool, person),
          proposals: await listProposals(pool, person, now()),
        },
        'listed'
      )

    if (req.method === 'DELETE') {
      const target = unbindTarget(new URL(req.url || '', 'http://x'))
      if (!target)
        return answer(400, { error: 'network_unknown' }, 'network_unknown')
      const gone = await unbindWallet(
        pool,
        person,
        target.chain,
        target.network
      )
      return answer(
        gone ? 200 : 404,
        { unbound: gone },
        gone ? 'unbound' : 'not_bound',
        { chain: target.chain }
      )
    }

    const body = await readJson()
    if (!body) return answer(400, { error: 'body_malformed' }, 'body_malformed')

    // The person says yes to what their wallet browser proposed.
    if ('confirm' in body) {
      const nonce = body.confirm
      const row = isNonceShape(nonce)
        ? await nonceRow(pool, nonce, now())
        : null
      if (
        !row ||
        !mayConfirm(row.telegramId === person, row.open, row.proposed) ||
        !proposalBinds(true)
      )
        return answer(400, { error: 'proposal_unknown' }, 'proposal_unknown')
      if (!(await consumeChallenge(pool, person, nonce, now())))
        return answer(400, { error: 'proposal_unknown' }, 'proposal_unknown')
      const bound = await bindWallet(
        pool,
        person,
        row.chain as TextChain,
        row.network as string,
        row.address as string,
        row.key as string
      )
      if (!bound.ok)
        return answer(409, { error: bound.code }, bound.code, {
          chain: row.chain,
        })
      return answer(200, { wallet: bound.wallet }, 'bound', {
        chain: row.chain,
        via: 'proposal',
      })
    }

    // An EVM, Solana or TRON wallet signed right here (a desktop browser, or
    // the app opened inside the wallet with a session).
    if ('chain' in body && body.chain !== SPEC.CHAIN_TON_NAME) {
      const checked = checkChainProof(
        body as ChainProofInput,
        deps.proofDomain,
        now()
      )
      if (!checked.ok) return answer(400, { error: checked.code }, checked.code)
      if (!(await consumeChallenge(pool, person, body.nonce, now())))
        return answer(400, { error: 'payload_unknown' }, 'payload_unknown')
      const bound = await bindWallet(
        pool,
        person,
        checked.chain,
        checked.network,
        checked.address,
        checked.publicKey
      )
      if (!bound.ok)
        return answer(409, { error: bound.code }, bound.code, {
          chain: checked.chain,
        })
      return answer(200, { wallet: bound.wallet }, 'bound', {
        chain: checked.chain,
      })
    }

    const input = body as TonProofInput
    const checked = checkTonProof(input, deps.proofDomain, now())
    if (!checked.ok) return answer(400, { error: checked.code }, checked.code)
    if (!(await consumeChallenge(pool, person, input.proof.payload, now())))
      return answer(400, { error: 'payload_unknown' }, 'payload_unknown')
    const bound = await bindWallet(
      pool,
      person,
      'ton',
      checked.network,
      checked.address.toRawString(),
      checked.publicKey
    )
    if (!bound.ok)
      return answer(409, { error: bound.code }, bound.code, {
        network: checked.network,
      })
    return answer(200, { wallet: bound.wallet }, 'bound', {
      network: checked.network,
    })
  } catch {
    return answer(500, { error: 'internal' }, 'internal')
  }
}
