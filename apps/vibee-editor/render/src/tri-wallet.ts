/**
 * TRI WALLET BINDING: which TON wallet a person says their TRI should go to.
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

/** TON Connect network ids: mainnet and testnet. */
export const TON_NETWORKS = ['-239', '-3'] as const
export type TonNetwork = (typeof TON_NETWORKS)[number]

/** How long an issued payload, and a signed proof, stay acceptable. */
export const PROOF_TTL_MS = 15 * 60 * 1000
/** A wallet clock this far ahead of ours is still not "from the future". */
const CLOCK_SKEW_MS = 60 * 1000
/** Unspent challenges one person may hold at once. */
export const MAX_OPEN_CHALLENGES = 5

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
  const ageMs = nowMs - p.timestamp * 1000
  if (ageMs > PROOF_TTL_MS) return { ok: false, code: 'proof_expired' }
  if (ageMs < -CLOCK_SKEW_MS) return { ok: false, code: 'proof_from_future' }
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
  return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tri_wallets (
      telegram_id text NOT NULL,
      chain text NOT NULL CHECK (chain IN ('ton')),
      network text NOT NULL CHECK (network IN ('-239', '-3')),
      address text NOT NULL,
      public_key text NOT NULL,
      bound_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (telegram_id, chain, network),
      UNIQUE (chain, network, address)
    )`)
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
  if ((open.rows[0]?.n ?? 0) >= MAX_OPEN_CHALLENGES) return null
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
  chain: 'ton'
  network: TonNetwork
  address: string
  friendly: string
  boundAt: string
}

function toBound(row: any): BoundWallet {
  const network = String(row.network) as TonNetwork
  return {
    chain: 'ton',
    network,
    address: String(row.address),
    friendly: friendlyAddress(String(row.address), network),
    boundAt: new Date(row.bound_at).toISOString(),
  }
}

export async function listWallets(
  pool: Queryable,
  telegramId: string
): Promise<BoundWallet[]> {
  const r = await pool.query(
    `SELECT network, address, bound_at FROM tri_wallets
      WHERE telegram_id = $1 AND chain = 'ton' ORDER BY network`,
    [telegramId]
  )
  return r.rows.map(toBound)
}

export type BindResult =
  | { ok: true; wallet: BoundWallet }
  | { ok: false; code: 'wallet_bound_elsewhere' }

export async function bindWallet(
  pool: Queryable,
  telegramId: string,
  network: TonNetwork,
  address: string,
  publicKey: string
): Promise<BindResult> {
  const taken = await pool.query(
    `SELECT telegram_id FROM tri_wallets
      WHERE chain = 'ton' AND network = $1 AND address = $2`,
    [network, address]
  )
  const holder = taken.rows[0]?.telegram_id
  if (holder != null && String(holder) !== telegramId)
    return { ok: false, code: 'wallet_bound_elsewhere' }

  let r: { rows: any[] }
  try {
    r = await pool.query(
      `INSERT INTO tri_wallets (telegram_id, chain, network, address, public_key)
       VALUES ($1, 'ton', $2, $3, $4)
       ON CONFLICT (telegram_id, chain, network) DO UPDATE
         SET address = EXCLUDED.address, public_key = EXCLUDED.public_key,
             bound_at = now()
       RETURNING network, address, bound_at`,
      [telegramId, network, address, publicKey]
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
     VALUES ($1, 'ton', $2, $3, 'bind')`,
    [telegramId, network, address]
  )
  return { ok: true, wallet: toBound(r.rows[0]) }
}

export async function unbindWallet(
  pool: Queryable,
  telegramId: string,
  network: TonNetwork
): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM tri_wallets
      WHERE telegram_id = $1 AND chain = 'ton' AND network = $2
      RETURNING address`,
    [telegramId, network]
  )
  const address = r.rows[0]?.address
  if (address == null) return false
  await pool.query(
    `INSERT INTO tri_wallet_events (telegram_id, chain, network, address, action)
     VALUES ($1, 'ton', $2, $3, 'unbind')`,
    [telegramId, network, String(address)]
  )
  return true
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export const TRI_WALLET_PATH = '/api/tri/wallet'
export const TRI_WALLET_CHALLENGE_PATH = '/api/tri/wallet/challenge'

export interface TriWalletDeps {
  getPool: () => Queryable | Promise<Queryable>
  /** The person's own telegram_id, or null for any other credential. */
  personOf: (req: IncomingMessage) => string | null
  readBody: (req: IncomingMessage, maxBytes: number) => Promise<string>
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

/**
 * Handles the four TRI wallet routes and returns true, or returns false for
 * any other URL. Every answered request writes exactly one log line.
 */
export async function handleTriWallet(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TriWalletDeps
): Promise<boolean> {
  const path = (req.url || '').split('?')[0]
  if (path !== TRI_WALLET_PATH && path !== TRI_WALLET_CHALLENGE_PATH)
    return false

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

  const allowed =
    path === TRI_WALLET_CHALLENGE_PATH ? ['POST'] : ['GET', 'POST', 'DELETE']
  if (!allowed.includes(req.method || ''))
    return answer(405, { error: 'method_not_allowed' }, 'method_not_allowed')

  const who = deps.personOf(req)
  if (!who) return answer(401, { error: 'person_required' }, 'person_required')

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
    if (path === TRI_WALLET_CHALLENGE_PATH) {
      const issued = await issueChallenge(pool, who, now())
      if (!issued)
        return answer(
          429,
          { error: 'too_many_challenges' },
          'too_many_challenges'
        )
      return answer(200, issued, 'challenge_issued')
    }

    if (req.method === 'GET')
      return answer(200, { wallets: await listWallets(pool, who) }, 'listed')

    if (req.method === 'DELETE') {
      const network = new URL(req.url || '', 'http://x').searchParams.get(
        'network'
      )
      if (!(TON_NETWORKS as readonly string[]).includes(network ?? ''))
        return answer(400, { error: 'network_unknown' }, 'network_unknown')
      const gone = await unbindWallet(pool, who, network as TonNetwork)
      return answer(
        gone ? 200 : 404,
        { unbound: gone },
        gone ? 'unbound' : 'not_bound'
      )
    }

    let input: TonProofInput
    try {
      input = JSON.parse((await deps.readBody(req, 16 * 1024)) || '{}')
    } catch {
      return answer(400, { error: 'body_malformed' }, 'body_malformed')
    }
    const checked = checkTonProof(input, deps.proofDomain, now())
    if (!checked.ok) return answer(400, { error: checked.code }, checked.code)
    if (!(await consumeChallenge(pool, who, input.proof.payload, now())))
      return answer(400, { error: 'payload_unknown' }, 'payload_unknown')
    const bound = await bindWallet(
      pool,
      who,
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
