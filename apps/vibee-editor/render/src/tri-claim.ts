/**
 * TRI CLAIM: from an accepted .t27 spec to a mint the author sends themselves.
 *
 * Three things have to be true before TRI can mint to a person, and each has
 * its own proof:
 *
 *   1. The person is the GitHub account Queen credits the earning to. They
 *      prove it with GitHub's device flow (/api/tri/github/start, /poll): the
 *      app shows a code, the person enters it on github.com, and GitHub tells
 *      us which account approved it. The access token is used once, to read
 *      the login, and dropped; nothing of it is stored.
 *   2. The person controls a TON wallet: tri-wallet.ts, a TON Connect ton_proof.
 *   3. M of N attestors agree, each on its own (trinity-fpga
 *      contracts/ton/signer): the earning exists, is not revoked, its commit
 *      was merged with the spec, and its payee is the wallet in (2). The
 *      payee record they read is /api/tri/payee, below.
 *
 * /api/tri/claim gathers the signatures, checks every one of them against the
 * key the minter itself holds, and hands back a message for the person's own
 * wallet to send: they sign it in TON Connect and pay the gas, the minter
 * returns what gas is left. This server never holds a key that can mint.
 *
 * TESTNET ONLY, and V1, signer quorum, NOT trustless: signers that collude,
 * or a payee record that lies to all of them, still mint wrongly.
 */

import { createHash, createPublicKey, verify } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Address, beginCell, Dictionary } from '@ton/core'

/** The "Trinity S3AI" OAuth App. A client id is public; device flow needs no secret. */
export const TRI_GITHUB_CLIENT_ID = 'Ov23lin1tYAHrKx2IaDw'
/** The only network a claim is built for until a mainnet minter exists. */
export const CLAIM_NETWORK = '-3'
export const CHAIN_TON = 1
/** trinity-fpga contracts/ton/wrappers/TriMinter.ts OP_MINT_ON_ATT ("TRI1"). */
export const OP_MINT_ON_ATT = 0x54524931
/** Sent with the mint; the minter needs 0.05 TON and returns what is left. */
export const MINT_VALUE_NANO = 100_000_000n
export const STATUS = 'testnet only -- V1, signer quorum, NOT trustless'

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const WORK_ID = /^[0-9a-f]{64}$/
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/

// ---------------------------------------------------------------------------
// The attestation, byte for byte as the minter reads it
// ---------------------------------------------------------------------------

export interface Attestation {
  worker: Buffer
  workId: Buffer
  chain: number
  amountMtri: bigint
  globalNonce: bigint
  epoch: number
}

/** mint_authority.zig `Attestation.digest`; pinned by its golden vector in the test. */
export function attestationDigest(a: Attestation): Buffer {
  const b = Buffer.alloc(93)
  a.worker.copy(b, 0)
  a.workId.copy(b, 32)
  b.writeUInt8(a.chain, 64)
  b.writeBigUInt64BE(a.amountMtri, 65)
  b.writeBigUInt64BE(a.globalNonce >> 64n, 73)
  b.writeBigUInt64BE(a.globalNonce & 0xffff_ffff_ffff_ffffn, 81)
  b.writeUInt32BE(a.epoch, 89)
  return createHash('sha256').update(b).digest()
}

/** The op::mint_on_att body; pinned by a BOC the minter's own wrapper built. */
export function mintBody(
  att: Attestation,
  sigs: Map<number, Buffer>,
  queryId = 0n
) {
  const d = Dictionary.empty(
    Dictionary.Keys.Uint(8),
    Dictionary.Values.Buffer(64)
  )
  for (const [i, s] of sigs) d.set(i, s)
  return beginCell()
    .storeUint(OP_MINT_ON_ATT, 32)
    .storeUint(queryId, 64)
    .storeBuffer(att.worker, 32)
    .storeBuffer(att.workId, 32)
    .storeUint(att.chain, 8)
    .storeUint(att.amountMtri, 64)
    .storeUint(att.globalNonce, 128)
    .storeUint(att.epoch, 32)
    .storeDict(d)
    .endCell()
}

export function ed25519Verify(
  message: Buffer,
  signature: Buffer,
  publicKey: Buffer
): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) return false
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, publicKey]),
      format: 'der',
      type: 'spki',
    })
    return verify(null, message, key, signature)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// The quorum
// ---------------------------------------------------------------------------

/** What one signer answers (trinity-fpga contracts/ton/signer/attest.ts). */
export type SignerAnswer =
  | {
      ok: true
      index: number
      signature: string
      digest: string
      attestation: {
        worker: string
        workId: string
        chain: number
        amountMtri: string
        globalNonce: string
        epoch: number
      }
    }
  | { ok: false; code: string }

export interface MinterState {
  epoch: number
  threshold: number
  keyAt(index: number): Promise<Buffer | null>
}

export type Quorum =
  | { ok: true; att: Attestation; sigs: Map<number, Buffer> }
  | { ok: false; code: string; refusals: string[] }

/**
 * Keeps only signatures that are exactly what this claim asked for -- this
 * payee, this earning, the published amount, the live epoch -- and that the
 * minter's own key at that index verifies. Then needs `threshold` of them.
 */
export async function assembleQuorum(
  answers: SignerAnswer[],
  want: { workId: string; payee: Address; amountMtri: bigint },
  minter: MinterState
): Promise<Quorum> {
  const refusals: string[] = []
  const sigs = new Map<number, Buffer>()
  let att: Attestation | null = null
  let agreed: string | null = null
  for (const a of answers) {
    if (!a.ok) {
      refusals.push(a.code)
      continue
    }
    const x = a.attestation
    const candidate: Attestation = {
      worker: Buffer.from(x.worker, 'hex'),
      workId: Buffer.from(x.workId, 'hex'),
      chain: x.chain,
      amountMtri: BigInt(x.amountMtri),
      globalNonce: BigInt(x.globalNonce),
      epoch: x.epoch,
    }
    const fits =
      candidate.worker.equals(want.payee.hash) &&
      x.workId === want.workId &&
      candidate.chain === CHAIN_TON &&
      candidate.amountMtri === want.amountMtri &&
      candidate.epoch === minter.epoch
    if (!fits) {
      refusals.push('signer_attested_something_else')
      continue
    }
    const digest = attestationDigest(candidate)
    if (agreed !== null && digest.toString('hex') !== agreed) {
      refusals.push('signers_disagree')
      continue
    }
    const key = await minter.keyAt(a.index)
    if (!key || !ed25519Verify(digest, Buffer.from(a.signature, 'hex'), key)) {
      refusals.push('signature_not_from_minter_key')
      continue
    }
    agreed = digest.toString('hex')
    att = candidate
    if (sigs.size < minter.threshold)
      sigs.set(a.index, Buffer.from(a.signature, 'hex'))
  }
  if (att && sigs.size >= minter.threshold) return { ok: true, att, sigs }
  // Every signer refusing for the same reason is that reason; otherwise say so.
  const same = refusals.length > 0 && refusals.every(r => r === refusals[0])
  return {
    ok: false,
    code: same ? refusals[0] : 'quorum_not_reached',
    refusals,
  }
}

// ---------------------------------------------------------------------------
// The outside world: Queen, the signers, the minter, GitHub
// ---------------------------------------------------------------------------

export interface QueenEarning {
  workId: string
  repo: string
  issue: number
  commit: string
  specPaths: string[]
  acceptedAt: string
  revokedAt: string | null
}

export interface Outside {
  queenEarning(workId: string): Promise<{
    triPerSpec: number
    earning: QueenEarning
    earner: { github?: string }
  } | null>
  queenEarningsOf(
    github: string
  ): Promise<{ triPerSpec: number; earnings: QueenEarning[] }>
  sign(workId: string): Promise<SignerAnswer[]>
  minter(): Promise<
    MinterState & { address: Address; isSpent(nonce: bigint): Promise<boolean> }
  >
  githubDeviceCode(): Promise<{
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
  }>
  /** GitHub's answer to one poll: a login, or why not yet. */
  githubPoll(
    deviceCode: string
  ): Promise<
    { login: string; id: number } | { error: string; interval?: number }
  >
}

export interface OutsideConfig {
  queenUrl: string
  signerUrls: string[]
  minter: string
  toncenterUrl?: string
  toncenterKey?: string
  githubClientId?: string
  fetch?: typeof fetch
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function liveOutside(cfg: OutsideConfig): Outside {
  const f = cfg.fetch ?? fetch
  const queen = cfg.queenUrl.replace(/\/+$/, '')
  const ton = cfg.toncenterUrl ?? 'https://testnet.toncenter.com/api/v2/jsonRPC'
  const clientId = cfg.githubClientId ?? TRI_GITHUB_CLIENT_ID
  const minterAddress = Address.parse(cfg.minter)

  async function getJson<T>(
    url: string,
    init?: RequestInit
  ): Promise<T | null> {
    const r = await f(url, init)
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`${url.split('?')[0]} -> ${r.status}`)
    return (await r.json()) as T
  }

  /** A minter get-method over toncenter; retries the keyless rate limit. */
  async function get(
    method: string,
    stack: [string, string][] = []
  ): Promise<bigint[]> {
    for (let i = 0; ; i++) {
      const r = await f(ton, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cfg.toncenterKey ? { 'x-api-key': cfg.toncenterKey } : {}),
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'runGetMethod',
          params: { address: minterAddress.toString(), method, stack },
        }),
      })
      if ((r.status === 429 || r.status >= 500) && i < 6) {
        await sleep(1200 * (i + 1))
        continue
      }
      const j = (await r.json()) as {
        ok: boolean
        result?: { exit_code: number; stack: [string, string][] }
      }
      if (!j.ok || !j.result || j.result.exit_code !== 0)
        throw new Error(`minter ${method} failed`)
      return j.result.stack.map(([, v]) => BigInt(v))
    }
  }

  return {
    queenEarning: workId => getJson(`${queen}/queen/public-earnings/${workId}`),
    async queenEarningsOf(github) {
      const r = await getJson<{ triPerSpec: number; earnings: QueenEarning[] }>(
        `${queen}/queen/public-earnings/by/${encodeURIComponent(github)}`
      )
      return r ?? { triPerSpec: 0, earnings: [] }
    },
    async sign(workId) {
      return Promise.all(
        cfg.signerUrls.map(async url => {
          try {
            const r = await f(`${url.replace(/\/+$/, '')}/sign`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ workId }),
              signal: AbortSignal.timeout(30_000),
            })
            return (await r.json()) as SignerAnswer
          } catch {
            return { ok: false as const, code: 'signer_unreachable' }
          }
        })
      )
    },
    async minter() {
      const [, , epoch, threshold] = await get('get_tri_state')
      const keys = new Map<number, Buffer | null>()
      return {
        address: minterAddress,
        epoch: Number(epoch),
        threshold: Number(threshold),
        async keyAt(index) {
          if (!keys.has(index)) {
            const [k] = await get('attestor_key', [
              ['num', `0x${index.toString(16)}`],
            ])
            keys.set(
              index,
              k === 0n
                ? null
                : Buffer.from(k.toString(16).padStart(64, '0'), 'hex')
            )
          }
          return keys.get(index) ?? null
        },
        async isSpent(nonce) {
          const [s] = await get('is_spent', [
            ['num', `0x${nonce.toString(16)}`],
          ])
          return s !== 0n
        },
      }
    },
    async githubDeviceCode() {
      const r = await f('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ client_id: clientId }),
      })
      const j = (await r.json()) as Record<string, unknown>
      if (!r.ok || typeof j.device_code !== 'string')
        throw new Error(`github device code: ${String(j.error ?? r.status)}`)
      return j as never
    },
    async githubPoll(deviceCode) {
      const r = await f('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })
      const j = (await r.json()) as {
        access_token?: string
        error?: string
        interval?: number
      }
      if (!j.access_token)
        return { error: j.error ?? 'github_refused', interval: j.interval }
      // Used once, to learn who approved; never stored.
      const u = await f('https://api.github.com/user', {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${j.access_token}`,
        },
      })
      const me = (await u.json()) as { login?: string; id?: number }
      if (!u.ok || !me.login || !me.id)
        return { error: 'github_user_unreadable' }
      return { login: me.login, id: me.id }
    },
  }
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

export async function ensureTriClaimTables(pool: Queryable): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tri_github_flows (
      device_code text PRIMARY KEY,
      telegram_id text NOT NULL,
      user_code text NOT NULL,
      interval_s int NOT NULL,
      expires_at timestamptz NOT NULL,
      polled_at timestamptz
    )`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tri_github (
      telegram_id text PRIMARY KEY,
      github_id bigint NOT NULL UNIQUE,
      github_login text NOT NULL,
      linked_at timestamptz NOT NULL DEFAULT now()
    )`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tri_github_events (
      id bigserial PRIMARY KEY,
      telegram_id text NOT NULL,
      github_id bigint NOT NULL,
      github_login text NOT NULL,
      action text NOT NULL CHECK (action IN ('link', 'unlink')),
      at timestamptz NOT NULL DEFAULT now()
    )`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tri_claim_events (
      id bigserial PRIMARY KEY,
      telegram_id text NOT NULL,
      work_id text NOT NULL,
      network text NOT NULL,
      payee text NOT NULL,
      outcome text NOT NULL,
      at timestamptz NOT NULL DEFAULT now()
    )`)
}

let ensured: Promise<void> | null = null
function ensureOnce(pool: Queryable): Promise<void> {
  if (!ensured)
    ensured = ensureTriClaimTables(pool).catch(e => {
      ensured = null
      throw e
    })
  return ensured
}

/** Test seam: forget that the tables were ensured. */
export function resetTriClaimEnsureForTests(): void {
  ensured = null
}

async function githubOf(pool: Queryable, telegramId: string) {
  const r = await pool.query(
    `SELECT github_login, github_id, linked_at FROM tri_github WHERE telegram_id = $1`,
    [telegramId]
  )
  const row = r.rows[0]
  return row
    ? {
        login: String(row.github_login),
        id: Number(row.github_id),
        linkedAt: row.linked_at,
      }
    : null
}

async function testnetWalletOf(
  pool: Queryable,
  telegramId: string
): Promise<string | null> {
  const r = await pool.query(
    `SELECT address FROM tri_wallets
      WHERE telegram_id = $1 AND chain = 'ton' AND network = $2`,
    [telegramId, CLAIM_NETWORK]
  )
  return r.rows[0]?.address ?? null
}

/**
 * The one GitHub account a person links. Re-linking an account another person
 * had linked moves it: whoever approves on github.com controls it now. Both
 * moves are in the event log.
 */
export async function linkGithub(
  pool: Queryable,
  telegramId: string,
  github: { login: string; id: number }
): Promise<void> {
  const moved = await pool.query(
    `DELETE FROM tri_github WHERE github_id = $1 AND telegram_id <> $2
     RETURNING telegram_id, github_login`,
    [github.id, telegramId]
  )
  for (const m of moved.rows)
    await pool.query(
      `INSERT INTO tri_github_events (telegram_id, github_id, github_login, action)
       VALUES ($1, $2, $3, 'unlink')`,
      [String(m.telegram_id), github.id, String(m.github_login)]
    )
  await pool.query(
    `INSERT INTO tri_github (telegram_id, github_id, github_login)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE
       SET github_id = EXCLUDED.github_id, github_login = EXCLUDED.github_login, linked_at = now()`,
    [telegramId, github.id, github.login]
  )
  await pool.query(
    `INSERT INTO tri_github_events (telegram_id, github_id, github_login, action)
     VALUES ($1, $2, $3, 'link')`,
    [telegramId, github.id, github.login]
  )
}

/** The wallet a GitHub login proved it controls, on `network`: the payee record. */
export async function payeeOf(
  pool: Queryable,
  github: string,
  network: string
): Promise<string | null> {
  const r = await pool.query(
    `SELECT w.address FROM tri_github g
       JOIN tri_wallets w
         ON w.telegram_id = g.telegram_id AND w.chain = 'ton' AND w.network = $2
      WHERE lower(g.github_login) = lower($1)`,
    [github, network]
  )
  return r.rows[0]?.address ?? null
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export const TRI_GITHUB_PATH = '/api/tri/github'
export const TRI_GITHUB_START_PATH = '/api/tri/github/start'
export const TRI_GITHUB_POLL_PATH = '/api/tri/github/poll'
export const TRI_PAYEE_PATH = '/api/tri/payee'
export const TRI_CLAIMS_PATH = '/api/tri/claims'
export const TRI_CLAIM_PATH = '/api/tri/claim'

const ROUTES: Record<string, string[]> = {
  [TRI_GITHUB_PATH]: ['GET', 'DELETE'],
  [TRI_GITHUB_START_PATH]: ['POST'],
  [TRI_GITHUB_POLL_PATH]: ['POST'],
  [TRI_PAYEE_PATH]: ['GET'],
  [TRI_CLAIMS_PATH]: ['GET'],
  [TRI_CLAIM_PATH]: ['POST'],
}

export interface TriClaimDeps {
  getPool: () => Queryable | Promise<Queryable>
  /** The person's own telegram_id, or null for any other credential. */
  personOf: (req: IncomingMessage) => string | null
  readBody: (req: IncomingMessage, maxBytes: number) => Promise<string>
  /** Null when the claim side is not configured on this deployment. */
  outside: Outside | null
  now?: () => number
  log?: (line: Record<string, unknown>) => void
}

function send(
  res: ServerResponse,
  code: number,
  body: unknown,
  cache = 'no-store'
): void {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Cache-Control': cache,
  })
  res.end(JSON.stringify(body))
}

export async function handleTriClaim(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TriClaimDeps
): Promise<boolean> {
  const url = new URL(req.url || '', 'http://x')
  const path = url.pathname
  if (!ROUTES[path]) return false

  const now = deps.now ?? Date.now
  const log =
    deps.log ??
    ((line: Record<string, unknown>) =>
      console.log(JSON.stringify({ event: 'tri_claim', ...line })))
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

  if (!ROUTES[path].includes(req.method || ''))
    return answer(405, { error: 'method_not_allowed' }, 'method_not_allowed')

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
    // Public: what every signer reads. A wallet is public once TRI mints to it.
    if (path === TRI_PAYEE_PATH) {
      const github = url.searchParams.get('github') ?? ''
      const network = url.searchParams.get('network') ?? ''
      if (!GITHUB_LOGIN.test(github))
        return answer(400, { error: 'github_malformed' }, 'github_malformed')
      if (network !== '-3' && network !== '-239')
        return answer(400, { error: 'network_unknown' }, 'network_unknown')
      const address = await payeeOf(pool, github, network)
      log({ route, status: 200, outcome: address ? 'payee' : 'no_payee' })
      send(res, 200, { github, network, address }, 'public, max-age=30')
      return true
    }

    const who = deps.personOf(req)
    if (!who)
      return answer(401, { error: 'person_required' }, 'person_required')

    if (path === TRI_GITHUB_PATH) {
      if (req.method === 'GET')
        return answer(200, { github: await githubOf(pool, who) }, 'github_read')
      const gone = await pool.query(
        `DELETE FROM tri_github WHERE telegram_id = $1 RETURNING github_id, github_login`,
        [who]
      )
      for (const g of gone.rows)
        await pool.query(
          `INSERT INTO tri_github_events (telegram_id, github_id, github_login, action)
           VALUES ($1, $2, $3, 'unlink')`,
          [who, Number(g.github_id), String(g.github_login)]
        )
      return answer(
        gone.rows.length ? 200 : 404,
        { unlinked: gone.rows.length > 0 },
        'github_unlinked'
      )
    }

    const outside = deps.outside
    if (!outside)
      return answer(
        503,
        { error: 'claims_not_configured' },
        'claims_not_configured'
      )

    if (path === TRI_GITHUB_START_PATH) {
      await pool.query(`DELETE FROM tri_github_flows WHERE telegram_id = $1`, [
        who,
      ])
      const d = await outside.githubDeviceCode()
      await pool.query(
        `INSERT INTO tri_github_flows (device_code, telegram_id, user_code, interval_s, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          d.device_code,
          who,
          d.user_code,
          d.interval,
          new Date(now() + d.expires_in * 1000),
        ]
      )
      // The device code stays here: it is what trades for a token.
      return answer(
        200,
        {
          userCode: d.user_code,
          verificationUri: d.verification_uri,
          expiresIn: d.expires_in,
          interval: d.interval,
        },
        'github_started'
      )
    }

    if (path === TRI_GITHUB_POLL_PATH) {
      const r = await pool.query(
        `SELECT device_code, interval_s, expires_at, polled_at FROM tri_github_flows
          WHERE telegram_id = $1`,
        [who]
      )
      const flow = r.rows[0]
      if (!flow) return answer(404, { error: 'no_flow' }, 'no_flow')
      if (new Date(flow.expires_at).getTime() <= now()) {
        await pool.query(
          `DELETE FROM tri_github_flows WHERE telegram_id = $1`,
          [who]
        )
        return answer(410, { error: 'expired' }, 'expired')
      }
      // Never ask GitHub faster than it allowed; answer "pending" ourselves.
      if (
        flow.polled_at &&
        new Date(flow.polled_at).getTime() + flow.interval_s * 1000 > now()
      )
        return answer(
          202,
          { pending: true, interval: flow.interval_s },
          'pending_local'
        )
      const got = await outside.githubPoll(String(flow.device_code))
      if ('error' in got) {
        const interval =
          got.error === 'slow_down'
            ? (got.interval ?? flow.interval_s + 5)
            : flow.interval_s
        await pool.query(
          `UPDATE tri_github_flows SET polled_at = $2, interval_s = $3 WHERE telegram_id = $1`,
          [who, new Date(now()), interval]
        )
        if (got.error === 'authorization_pending' || got.error === 'slow_down')
          return answer(202, { pending: true, interval }, 'pending')
        await pool.query(
          `DELETE FROM tri_github_flows WHERE telegram_id = $1`,
          [who]
        )
        const code =
          got.error === 'access_denied'
            ? 403
            : got.error === 'expired_token'
              ? 410
              : 502
        return answer(code, { error: got.error }, got.error)
      }
      await linkGithub(pool, who, got)
      await pool.query(`DELETE FROM tri_github_flows WHERE telegram_id = $1`, [
        who,
      ])
      return answer(200, { github: { login: got.login } }, 'github_linked', {
        github: got.login,
      })
    }

    const github = await githubOf(pool, who)
    const wallet = await testnetWalletOf(pool, who)

    if (path === TRI_CLAIMS_PATH) {
      if (!github)
        return answer(
          200,
          {
            github: null,
            wallet,
            network: CLAIM_NETWORK,
            status: STATUS,
            earnings: [],
          },
          'claims_unlinked'
        )
      const of = await outside.queenEarningsOf(github.login)
      const asked = await pool.query(
        `SELECT DISTINCT work_id FROM tri_claim_events WHERE telegram_id = $1 AND outcome = 'built'`,
        [who]
      )
      const built = new Set(asked.rows.map(r => String(r.work_id)))
      return answer(
        200,
        {
          github: { login: github.login },
          wallet,
          network: CLAIM_NETWORK,
          status: STATUS,
          triPerSpec: of.triPerSpec,
          earnings: of.earnings.map(e => ({
            ...e,
            requested: built.has(e.workId),
          })),
        },
        'claims_listed',
        { n: of.earnings.length }
      )
    }

    // POST /api/tri/claim
    let workId: string
    try {
      workId = String(
        JSON.parse((await deps.readBody(req, 1024)) || '{}').workId ?? ''
      )
    } catch {
      return answer(400, { error: 'body_malformed' }, 'body_malformed')
    }
    if (!WORK_ID.test(workId))
      return answer(400, { error: 'work_id_malformed' }, 'work_id_malformed')
    if (!github)
      return answer(409, { error: 'github_unlinked' }, 'github_unlinked')
    if (!wallet)
      return answer(409, { error: 'wallet_unbound' }, 'wallet_unbound')

    const found = await outside.queenEarning(workId)
    if (!found)
      return answer(404, { error: 'earning_unknown' }, 'earning_unknown')
    if (found.earner.github?.toLowerCase() !== github.login.toLowerCase())
      return answer(403, { error: 'not_your_earning' }, 'not_your_earning')
    if (found.earning.revokedAt)
      return answer(409, { error: 'earning_revoked' }, 'earning_revoked')

    const event = (outcome: string) =>
      pool.query(
        `INSERT INTO tri_claim_events (telegram_id, work_id, network, payee, outcome)
         VALUES ($1, $2, $3, $4, $5)`,
        [who, workId, CLAIM_NETWORK, wallet, outcome]
      )

    const payee = Address.parseRaw(wallet)
    const [answers, minter] = await Promise.all([
      outside.sign(workId),
      outside.minter(),
    ])
    const q = await assembleQuorum(
      answers,
      { workId, payee, amountMtri: BigInt(found.triPerSpec) * 1000n },
      minter
    )
    if (!q.ok) {
      await event(q.code)
      const code =
        q.code === 'already_minted'
          ? 409
          : q.code === 'quorum_not_reached'
            ? 503
            : 422
      return answer(code, { error: q.code, refusals: q.refusals }, q.code, {
        workId,
      })
    }
    await event('built')
    return answer(
      200,
      {
        network: CLAIM_NETWORK,
        status: STATUS,
        validUntil: Math.floor(now() / 1000) + 300,
        message: {
          address: minter.address.toString({
            testOnly: true,
            bounceable: true,
          }),
          amount: MINT_VALUE_NANO.toString(),
          payload: mintBody(q.att, q.sigs).toBoc().toString('base64'),
        },
        attestation: {
          payee: payee.toString({ testOnly: true, bounceable: false }),
          workId,
          amountMtri: q.att.amountMtri.toString(),
          epoch: q.att.epoch,
          signers: [...q.sigs.keys()],
        },
      },
      'built',
      { workId }
    )
  } catch (e) {
    log({
      route,
      status: 502,
      outcome: 'outside_failed',
      error: e instanceof Error ? e.message : String(e),
    })
    send(res, 502, { error: 'outside_unavailable' })
    return true
  }
}
