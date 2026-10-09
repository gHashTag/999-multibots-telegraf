import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Address, beginCell, contractAddress, storeStateInit } from '@ton/core'
import {
  checkTonProof,
  handleTriWallet,
  resetTriWalletEnsureForTests,
  tonProofMessage,
  PROOF_TTL_MS,
  MAX_OPEN_CHALLENGES,
  TRI_WALLET_PATH,
  type TonProofInput,
  type TriWalletDeps,
} from './src/tri-wallet'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { base58, createBase58check } from '@scure/base'
import {
  bindMessage,
  checkChainProof,
  eip55,
  parseAddress,
  signerOf,
  type TextChain,
} from './src/tri-wallet-chains'

/*
 * Budget for a test that reaches ./tools or ./routes itself (#3750, #3764).
 * That import is CPU-bound -- ~1.5-2.3 s cold on an idle machine, 4.4-5.0 s
 * at load ~25 -- and is free only when an earlier test already paid it. Run
 * alone (`-t`, a reorder) the test pays it under vitest's 5 s default.
 */
const SLOW_IMPORT_TIMEOUT_MS = 30_000

/**
 * Every proof here is a real one: an ed25519 key made in the test, a wallet
 * state init carrying that key where a v4 wallet keeps it, the address that
 * state init hashes to, and a signature over the exact TON Connect message.
 * Nothing about the signature check is mocked, so a wrong byte order or a
 * wrong prefix in tonProofMessage fails these tests rather than shipping.
 */

const DOMAIN = 'app.t27.ai'
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0)
const PAYLOAD = 'a'.repeat(64)

interface Wallet {
  priv: KeyObject
  pub: Buffer
  raw: string
  stateInit: string
}

function makeWallet(layout: 'v4' | 'v5' = 'v4'): Wallet {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12)
  const data =
    layout === 'v4'
      ? beginCell().storeUint(0, 32).storeUint(698983191, 32).storeBuffer(pub)
      : beginCell()
          .storeBit(1)
          .storeUint(0, 32)
          .storeUint(2147483409, 32)
          .storeBuffer(pub)
  const init = {
    code: beginCell()
      .storeUint(layout === 'v4' ? 4 : 5, 8)
      .endCell(),
    data: data.endCell(),
  }
  return {
    priv: privateKey,
    pub,
    raw: contractAddress(0, init).toRawString(),
    stateInit: beginCell()
      .store(storeStateInit(init))
      .endCell()
      .toBoc()
      .toString('base64'),
  }
}

function proofFor(
  w: Wallet,
  over: Partial<{
    domain: string
    timestamp: number
    payload: string
    address: string
    signer: KeyObject
    network: string
    stateInit: string
  }> = {}
): TonProofInput {
  const address = over.address ?? w.raw
  const domain = over.domain ?? DOMAIN
  const timestamp = over.timestamp ?? Math.floor(NOW / 1000)
  const payload = over.payload ?? PAYLOAD
  const signed = tonProofMessage(
    // The signer signs for the address it believes in.
    Address.parseRaw(address),
    domain,
    timestamp,
    payload
  )
  const signature = sign(null, signed, over.signer ?? w.priv).toString('base64')
  return {
    address,
    network: over.network ?? '-239',
    stateInit: over.stateInit ?? w.stateInit,
    proof: {
      timestamp,
      domain: { lengthBytes: Buffer.byteLength(domain), value: domain },
      signature,
      payload,
    },
  }
}

describe('checkTonProof', () => {
  it('accepts a proof signed by the key the address was deployed with', () => {
    const w = makeWallet()
    const r = checkTonProof(proofFor(w), DOMAIN, NOW)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.address.toRawString()).toBe(w.raw)
      expect(r.publicKey).toBe(w.pub.toString('hex'))
      expect(r.network).toBe('-239')
    }
  })

  it('finds the key where a v5 wallet keeps it, one bit later', () => {
    const w = makeWallet('v5')
    expect(checkTonProof(proofFor(w), DOMAIN, NOW).ok).toBe(true)
  })

  it('refuses a signature from any other key, even over the right message', () => {
    const w = makeWallet()
    const thief = generateKeyPairSync('ed25519').privateKey
    expect(checkTonProof(proofFor(w, { signer: thief }), DOMAIN, NOW)).toEqual({
      ok: false,
      code: 'signature_invalid',
    })
  })

  it("refuses somebody else's state init presented for this address", () => {
    const victim = makeWallet()
    const attacker = makeWallet()
    // Signed correctly by the attacker for the victim's address, with the
    // attacker's state init: the key inside it is the attacker's, but that
    // state init does not hash to the victim's address.
    const input = proofFor(attacker, {
      address: victim.raw,
      stateInit: attacker.stateInit,
    })
    expect(checkTonProof(input, DOMAIN, NOW)).toEqual({
      ok: false,
      code: 'state_init_not_this_address',
    })
  })

  it('refuses a proof made for another site', () => {
    const w = makeWallet()
    expect(
      checkTonProof(proofFor(w, { domain: 'evil.example' }), DOMAIN, NOW)
    ).toEqual({ ok: false, code: 'domain_mismatch' })
  })

  it('refuses a proof older than the window, and one from the future', () => {
    const w = makeWallet()
    const old = Math.floor((NOW - PROOF_TTL_MS - 1000) / 1000)
    expect(checkTonProof(proofFor(w, { timestamp: old }), DOMAIN, NOW)).toEqual(
      { ok: false, code: 'proof_expired' }
    )
    const ahead = Math.floor((NOW + 5 * 60 * 1000) / 1000)
    expect(
      checkTonProof(proofFor(w, { timestamp: ahead }), DOMAIN, NOW)
    ).toEqual({ ok: false, code: 'proof_from_future' })
  })

  it('refuses a payload that is not one of ours in shape', () => {
    const w = makeWallet()
    expect(
      checkTonProof(proofFor(w, { payload: 'hello' }), DOMAIN, NOW)
    ).toEqual({ ok: false, code: 'payload_malformed' })
  })

  it('refuses an unknown network and a masterchain address', () => {
    const w = makeWallet()
    expect(checkTonProof(proofFor(w, { network: '1' }), DOMAIN, NOW)).toEqual({
      ok: false,
      code: 'network_unknown',
    })
    const master = '-1:' + w.raw.slice(2)
    expect(
      checkTonProof(proofFor(w, { address: master }), DOMAIN, NOW)
    ).toEqual({ ok: false, code: 'workchain_refused' })
  })
})

// ---------------------------------------------------------------------------
// The routes, over a fake pool that understands exactly the statements the
// module sends. An unknown statement throws, so a new query cannot pass as
// zero rows.
// ---------------------------------------------------------------------------

interface Row {
  [k: string]: any
}

function fakePool() {
  const challenges: Row[] = []
  const wallets: Row[] = []
  const events: Row[] = []
  const pool = {
    challenges,
    wallets,
    events,
    async query(text: string, p: any[] = []) {
      const t = text.replace(/\s+/g, ' ').trim()
      if (t.startsWith('CREATE ') || t.startsWith('ALTER TABLE'))
        return { rows: [] }
      if (t.startsWith('DELETE FROM tri_wallet_challenges')) {
        for (let i = challenges.length - 1; i >= 0; i--) {
          const c = challenges[i]
          if (c.telegram_id === p[0] && (c.expires_at <= p[1] || c.used_at))
            challenges.splice(i, 1)
        }
        return { rows: [] }
      }
      if (t.startsWith('SELECT count(*)::int AS n FROM tri_wallet_challenges'))
        return {
          rows: [{ n: challenges.filter(c => c.telegram_id === p[0]).length }],
        }
      if (t.startsWith('INSERT INTO tri_wallet_challenges')) {
        challenges.push({ payload: p[0], telegram_id: p[1], expires_at: p[2] })
        return { rows: [] }
      }
      if (t.startsWith('SELECT telegram_id, proposed_chain')) {
        const c = challenges.find(x => x.payload === p[0])
        return { rows: c ? [{ ...c }] : [] }
      }
      if (t.startsWith('SELECT payload, proposed_chain'))
        return {
          rows: challenges
            .filter(
              c =>
                c.telegram_id === p[0] &&
                c.proposed_at &&
                !c.used_at &&
                c.expires_at > p[1]
            )
            .map(c => ({ ...c })),
        }
      if (t.startsWith('UPDATE tri_wallet_challenges SET proposed_chain')) {
        // Only the conditions the statement names: a race between two
        // proposals is decided by the SQL, so the fake must not decide it.
        const c = challenges.find(
          x =>
            x.payload === p[0] &&
            !x.used_at &&
            x.expires_at > p[5] &&
            (!t.includes('AND proposed_at IS NULL') || !x.proposed_at)
        )
        if (!c) return { rows: [], rowCount: 0 }
        Object.assign(c, {
          proposed_chain: p[1],
          proposed_network: p[2],
          proposed_address: p[3],
          proposed_key: p[4],
          proposed_at: p[5],
        })
        return { rows: [{ payload: c.payload }], rowCount: 1 }
      }
      if (t.startsWith('UPDATE tri_wallet_challenges SET used_at')) {
        const c = challenges.find(
          x =>
            x.payload === p[0] &&
            x.telegram_id === p[1] &&
            !x.used_at &&
            x.expires_at > p[2]
        )
        if (!c) return { rows: [], rowCount: 0 }
        c.used_at = p[2]
        return { rows: [{ payload: c.payload }], rowCount: 1 }
      }
      if (t.startsWith('SELECT telegram_id FROM tri_wallets'))
        return {
          rows: wallets
            .filter(
              w => w.chain === p[0] && w.network === p[1] && w.address === p[2]
            )
            .map(w => ({ ...w })),
        }
      if (t.startsWith('INSERT INTO tri_wallets')) {
        const existing = wallets.find(
          w => w.telegram_id === p[0] && w.chain === p[1] && w.network === p[2]
        )
        const row = existing ?? {
          telegram_id: p[0],
          chain: p[1],
          network: p[2],
        }
        Object.assign(row, {
          address: p[3],
          public_key: p[4],
          bound_at: new Date(NOW),
        })
        if (!existing) wallets.push(row)
        return { rows: [{ ...row }] }
      }
      if (t.startsWith('INSERT INTO tri_wallet_events')) {
        events.push({
          telegram_id: p[0],
          chain: p[1],
          network: p[2],
          address: p[3],
          action: t.includes("'bind'") ? 'bind' : 'unbind',
        })
        return { rows: [] }
      }
      if (
        t.startsWith(
          'SELECT chain, network, address, bound_at FROM tri_wallets'
        )
      )
        return {
          rows: wallets
            .filter(w => w.telegram_id === p[0])
            .map(w => ({ ...w })),
        }
      if (t.startsWith('DELETE FROM tri_wallets')) {
        const i = wallets.findIndex(
          w => w.telegram_id === p[0] && w.chain === p[1] && w.network === p[2]
        )
        if (i < 0) return { rows: [] }
        const [gone] = wallets.splice(i, 1)
        return { rows: [{ address: gone.address }] }
      }
      throw new Error(`unexpected statement: ${t}`)
    },
  }
  return pool
}

interface Answer {
  status: number
  body: any
}

async function call(
  deps: TriWalletDeps,
  method: string,
  url: string,
  body?: unknown
): Promise<Answer | null> {
  const req = Readable.from(
    body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  ) as unknown as IncomingMessage
  Object.assign(req, { method, url, headers: {} })
  let status = 0
  let text = ''
  const res = {
    writeHead(code: number) {
      status = code
      return res
    },
    end(chunk?: string) {
      text = chunk ?? ''
    },
  } as unknown as ServerResponse
  const handled = await handleTriWallet(req, res, deps)
  if (!handled) return null
  return { status, body: JSON.parse(text) }
}

function depsFor(
  pool: ReturnType<typeof fakePool>,
  person: string | null,
  lines: Record<string, unknown>[] = []
): TriWalletDeps {
  return {
    getPool: () => pool,
    personOf: () => person,
    readBody: async (req: IncomingMessage) => {
      let s = ''
      for await (const c of req as unknown as AsyncIterable<Buffer>)
        s += c.toString()
      return s
    },
    proofDomain: DOMAIN,
    now: () => NOW,
    log: l => lines.push(l),
  }
}

describe('the TRI wallet routes', () => {
  beforeEach(() => resetTriWalletEnsureForTests())

  it('leaves every other URL alone', async () => {
    expect(await call(depsFor(fakePool(), '1'), 'GET', '/api/other')).toBeNull()
  })

  it('answers 401 to anybody who is not signed in as a person', async () => {
    const lines: Record<string, unknown>[] = []
    const r = await call(
      depsFor(fakePool(), null, lines),
      'GET',
      '/api/tri/wallet'
    )
    expect(r).toEqual({ status: 401, body: { error: 'person_required' } })
    expect(lines).toEqual([
      { route: 'GET /api/tri/wallet', status: 401, outcome: 'person_required' },
    ])
  })

  it('binds a wallet with a payload issued to this person, once', async () => {
    const pool = fakePool()
    const deps = depsFor(pool, '111')
    const ch = await call(deps, 'POST', '/api/tri/wallet/challenge')
    expect(ch?.status).toBe(200)
    const payload = ch!.body.payload as string

    const w = makeWallet()
    const input = proofFor(w, { payload })
    const bound = await call(deps, 'POST', '/api/tri/wallet', input)
    expect(bound?.status).toBe(200)
    expect(bound!.body.wallet).toMatchObject({
      chain: 'ton',
      network: '-239',
      address: w.raw,
    })
    expect(bound!.body.wallet.friendly).toMatch(/^UQ/)
    expect(pool.events).toEqual([
      {
        telegram_id: '111',
        chain: 'ton',
        network: '-239',
        address: w.raw,
        action: 'bind',
      },
    ])

    // The same proof again: the payload is spent.
    const replay = await call(deps, 'POST', '/api/tri/wallet', input)
    expect(replay).toEqual({ status: 400, body: { error: 'payload_unknown' } })

    const listed = await call(deps, 'GET', '/api/tri/wallet')
    expect(listed!.body.wallets.map((x: any) => x.address)).toEqual([w.raw])
  })

  it('refuses a payload issued to somebody else', async () => {
    const pool = fakePool()
    const ch = await call(
      depsFor(pool, '111'),
      'POST',
      '/api/tri/wallet/challenge'
    )
    const input = proofFor(makeWallet(), { payload: ch!.body.payload })
    const r = await call(depsFor(pool, '222'), 'POST', '/api/tri/wallet', input)
    expect(r).toEqual({ status: 400, body: { error: 'payload_unknown' } })
    expect(pool.wallets).toEqual([])
  })

  it('refuses a wallet already bound to another person', async () => {
    const pool = fakePool()
    const w = makeWallet()
    for (const who of ['111', '222']) {
      const deps = depsFor(pool, who)
      const ch = await call(deps, 'POST', '/api/tri/wallet/challenge')
      const r = await call(
        deps,
        'POST',
        '/api/tri/wallet',
        proofFor(w, { payload: ch!.body.payload })
      )
      if (who === '111') expect(r?.status).toBe(200)
      else
        expect(r).toEqual({
          status: 409,
          body: { error: 'wallet_bound_elsewhere' },
        })
    }
    expect(pool.wallets.map(x => x.telegram_id)).toEqual(['111'])
  })

  it('rebinding replaces the address and leaves both in the event log', async () => {
    const pool = fakePool()
    const deps = depsFor(pool, '111')
    const first = makeWallet()
    const second = makeWallet()
    for (const w of [first, second]) {
      const ch = await call(deps, 'POST', '/api/tri/wallet/challenge')
      await call(
        deps,
        'POST',
        '/api/tri/wallet',
        proofFor(w, { payload: ch!.body.payload })
      )
    }
    expect(pool.wallets.map(x => x.address)).toEqual([second.raw])
    expect(pool.events.map(e => e.address)).toEqual([first.raw, second.raw])
  })

  it('unbinds, logs it, and says so when there was nothing to unbind', async () => {
    const pool = fakePool()
    const deps = depsFor(pool, '111')
    const w = makeWallet()
    const ch = await call(deps, 'POST', '/api/tri/wallet/challenge')
    await call(
      deps,
      'POST',
      '/api/tri/wallet',
      proofFor(w, { payload: ch!.body.payload })
    )
    expect(await call(deps, 'DELETE', '/api/tri/wallet?network=-239')).toEqual({
      status: 200,
      body: { unbound: true },
    })
    expect(pool.events.map(e => e.action)).toEqual(['bind', 'unbind'])
    expect(await call(deps, 'DELETE', '/api/tri/wallet?network=-239')).toEqual({
      status: 404,
      body: { unbound: false },
    })
  })

  it('caps the challenges one person may hold open', async () => {
    const deps = depsFor(fakePool(), '111')
    for (let i = 0; i < MAX_OPEN_CHALLENGES; i++)
      expect(
        (await call(deps, 'POST', '/api/tri/wallet/challenge'))?.status
      ).toBe(200)
    expect(await call(deps, 'POST', '/api/tri/wallet/challenge')).toEqual({
      status: 429,
      body: { error: 'too_many_challenges' },
    })
  })

  it('answers 405 to a method the route does not take', async () => {
    const r = await call(
      depsFor(fakePool(), '111'),
      'GET',
      '/api/tri/wallet/challenge'
    )
    expect(r?.status).toBe(405)
  })
})

describe('personIdentity -- who may bind a payout address', () => {
  const saved = {
    AGENT_KEYS: process.env.AGENT_KEYS,
    RENDER_API_KEY: process.env.RENDER_API_KEY,
  }
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
  const req = (url: string, headers: Record<string, string>) =>
    ({ url, method: 'POST', headers }) as any

  it(
    'refuses an agent key that chatIdentity would accept',
    async () => {
      const { chatIdentity, personIdentity } = await import(
        './src/agent/routes'
      )
      process.env.AGENT_KEYS = 'tri_walletprobe:144022504'
      const r = req(TRI_WALLET_PATH, { 'x-agent-key': 'tri_walletprobe' })
      // The control: the same request IS somebody for the chat routes.
      expect(chatIdentity(r, null)).toBe('144022504')
      expect(personIdentity(r)).toBeNull()
    },
    SLOW_IMPORT_TIMEOUT_MS
  )

  it(
    'refuses the server key naming a telegram_id',
    async () => {
      const { resolveIdentity, personIdentity } = await import(
        './src/agent/routes'
      )
      process.env.RENDER_API_KEY = 'server-key-for-this-test' // secret-guard-ok: test fixture, not a credential
      const r = req(`${TRI_WALLET_PATH}?telegram_id=144022504`, {
        'x-api-key': 'server-key-for-this-test',
      })
      expect(
        await resolveIdentity(r, async () => {
          throw new Error('no db')
        })
      ).toBe('144022504')
      expect(personIdentity(r)).toBeNull()
    },
    SLOW_IMPORT_TIMEOUT_MS
  )
})

// ---------------------------------------------------------------------------
// EVM, Solana and TRON (spec automation/tri-wallet-chains.t27)
// ---------------------------------------------------------------------------

/*
 * Every signature below is real: a secp256k1 or ed25519 key made in the test,
 * the text the server would print, and the wallet's own prefix. The prefix is
 * computed here, independently of the host, and the EVM recovery is also held
 * to a signature made by another implementation (web3.js), so a wrong byte in
 * the host's digest fails rather than agreeing with itself.
 */

const tron = createBase58check(sha256)

interface SecpWallet {
  priv: Uint8Array
  key: Uint8Array
  evm: string
  tron: string
}

function secpWallet(): SecpWallet {
  const priv = secp256k1.utils.randomSecretKey()
  const key = keccak_256(
    secp256k1.getPublicKey(priv, false).subarray(1)
  ).subarray(12)
  return {
    priv,
    key,
    evm: eip55(key),
    tron: tron.encode(Uint8Array.of(0x41, ...key)),
  }
}

function secpSign(
  prefix: 'Ethereum' | 'TRON',
  priv: Uint8Array,
  text: string,
  vBase = 27
): string {
  const body = Buffer.from(text, 'utf8')
  const head = Buffer.from(`\x19${prefix} Signed Message:\n${body.length}`)
  const digest = keccak_256(Buffer.concat([head, body]))
  const rec = secp256k1.sign(digest, priv, {
    prehash: false,
    format: 'recovered',
  })
  return (
    '0x' +
    Buffer.concat([
      Buffer.from(rec.subarray(1)),
      Buffer.from([vBase + rec[0]]),
    ]).toString('hex')
  )
}

interface SolWallet {
  priv: KeyObject
  address: string
}

function solWallet(): SolWallet {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12)
  return { priv: privateKey, address: base58.encode(pub) }
}

const ISSUED = new Date(NOW).toISOString()

function textProof(
  chain: TextChain,
  address: string,
  sign: (text: string) => string,
  over: Partial<{ nonce: string; issuedAt: string; signedAddress: string }> = {}
) {
  const nonce = over.nonce ?? PAYLOAD
  const issuedAt = over.issuedAt ?? ISSUED
  const text = bindMessage({
    domain: DOMAIN,
    chain,
    address: over.signedAddress ?? parseAddress(chain, address)!.canonical,
    nonce,
    issuedAt,
  })
  return { chain, address, nonce, issuedAt, signature: sign(text) }
}

const evmProof = (w: SecpWallet, over = {}) =>
  textProof('evm', w.evm, t => secpSign('Ethereum', w.priv, t), over)
const tronProof = (w: SecpWallet, over = {}) =>
  textProof('tron', w.tron, t => secpSign('TRON', w.priv, t), over)
const solProof = (w: SolWallet, over = {}) =>
  textProof(
    'solana',
    w.address,
    t => base58.encode(sign(null, Buffer.from(t, 'utf8'), w.priv)),
    over
  )

describe('signatures made elsewhere', () => {
  it('recovers the address web3.js signs "Some data" with', () => {
    // web3.js docs, accounts.sign('Some data', 0x4c08...2318).
    expect(
      signerOf(
        'evm',
        'Some data',
        '0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c'
      )
    ).toBe('0x2c7536E3605D9C16a7a3D7b1898e529396a65c23')
  })

  it('reads a TRON address as 0x41 and the EVM-style key hash', () => {
    // USDT on TRON: TR7NHq... is 41a614f8...d13c.
    const p = parseAddress('tron', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
    expect(Buffer.from(p!.key).toString('hex')).toBe(
      'a614f803b6fd780986a42c78ec9c7f77e6ded13c'
    )
    expect(
      parseAddress('tron', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u')
    ).toBeNull()
  })
})

describe('checkChainProof', () => {
  it('accepts an EVM signature and stores the checksummed address', () => {
    const w = secpWallet()
    const r = checkChainProof(
      { ...evmProof(w), address: w.evm.toLowerCase() },
      DOMAIN,
      NOW
    )
    expect(r).toMatchObject({
      ok: true,
      chain: 'evm',
      network: 'eip155',
      address: w.evm,
    })
  })

  it('accepts v as 0 or 1 too', () => {
    const w = secpWallet()
    const proof = textProof('evm', w.evm, t =>
      secpSign('Ethereum', w.priv, t, 0)
    )
    expect(checkChainProof(proof, DOMAIN, NOW).ok).toBe(true)
  })

  it('refuses a signature from another key over the same text', () => {
    const w = secpWallet()
    const thief = secpWallet()
    const proof = textProof('evm', w.evm, t =>
      secpSign('Ethereum', thief.priv, t)
    )
    expect(checkChainProof(proof, DOMAIN, NOW)).toEqual({
      ok: false,
      code: 'signature_invalid',
    })
  })

  it('refuses text signed for another nonce, domain or time', () => {
    const w = secpWallet()
    const sig = evmProof(w, { nonce: 'b'.repeat(64) }).signature
    expect(
      checkChainProof({ ...evmProof(w), signature: sig }, DOMAIN, NOW)
    ).toEqual({ ok: false, code: 'signature_invalid' })
    expect(checkChainProof(evmProof(w), 'evil.example', NOW)).toEqual({
      ok: false,
      code: 'signature_invalid',
    })
  })

  it('refuses a wrong EIP-55 checksum as a typo', () => {
    const w = secpWallet()
    const flipped = w.evm.replace(/[a-f]/, c => c.toUpperCase())
    expect(parseAddress('evm', flipped)).toBeNull()
  })

  it('times a text proof by the spec: 15 minutes old, a minute ahead', () => {
    const w = secpWallet()
    const at = (ms: number) =>
      evmProof(w, { issuedAt: new Date(ms).toISOString() })
    expect(checkChainProof(at(NOW - PROOF_TTL_MS), DOMAIN, NOW).ok).toBe(true)
    expect(checkChainProof(at(NOW - PROOF_TTL_MS - 1), DOMAIN, NOW)).toEqual({
      ok: false,
      code: 'proof_expired',
    })
    expect(checkChainProof(at(NOW + 60_000), DOMAIN, NOW).ok).toBe(true)
    expect(checkChainProof(at(NOW + 60_001), DOMAIN, NOW)).toEqual({
      ok: false,
      code: 'proof_from_future',
    })
  })

  it('accepts a Solana signature under the address itself', () => {
    const w = solWallet()
    expect(checkChainProof(solProof(w), DOMAIN, NOW)).toMatchObject({
      ok: true,
      chain: 'solana',
      network: 'solana',
      address: w.address,
    })
    const thief = solWallet()
    const forged = textProof('solana', w.address, t =>
      base58.encode(sign(null, Buffer.from(t, 'utf8'), thief.priv))
    )
    expect(checkChainProof(forged, DOMAIN, NOW)).toEqual({
      ok: false,
      code: 'signature_invalid',
    })
  })

  it("accepts a TRON signature with TRON's prefix and not with Ethereum's", () => {
    const w = secpWallet()
    expect(checkChainProof(tronProof(w), DOMAIN, NOW)).toMatchObject({
      ok: true,
      chain: 'tron',
      network: 'tron',
      address: w.tron,
    })
    const wrongPrefix = textProof('tron', w.tron, t =>
      secpSign('Ethereum', w.priv, t)
    )
    expect(checkChainProof(wrongPrefix, DOMAIN, NOW)).toEqual({
      ok: false,
      code: 'signature_invalid',
    })
  })

  it('does not sign TON as text, nor a chain it does not know', () => {
    const w = secpWallet()
    for (const chain of ['ton', 'bitcoin', '', 3])
      expect(checkChainProof({ ...evmProof(w), chain }, DOMAIN, NOW)).toEqual({
        ok: false,
        code: 'chain_unknown',
      })
  })
})

describe('the TRI wallet routes on every chain', () => {
  beforeEach(() => resetTriWalletEnsureForTests())

  const bindWith = async (
    pool: ReturnType<typeof fakePool>,
    who: string,
    proof: (nonce: string) => Record<string, unknown>
  ) => {
    const deps = depsFor(pool, who)
    const ch = await call(deps, 'POST', '/api/tri/wallet/challenge')
    return call(deps, 'POST', '/api/tri/wallet', proof(ch!.body.payload))
  }

  it('binds an EVM, a Solana and a TRON wallet beside TON, unpaid until the bridge', async () => {
    const pool = fakePool()
    const e = secpWallet()
    const s = solWallet()
    const t = secpWallet()
    const ton = makeWallet()
    expect(
      (await bindWith(pool, '111', n => evmProof(e, { nonce: n })))?.status
    ).toBe(200)
    expect(
      (await bindWith(pool, '111', n => solProof(s, { nonce: n })))?.status
    ).toBe(200)
    expect(
      (await bindWith(pool, '111', n => tronProof(t, { nonce: n })))?.status
    ).toBe(200)
    expect(
      (await bindWith(pool, '111', n => proofFor(ton, { payload: n }) as any))
        ?.status
    ).toBe(200)
    const listed = await call(depsFor(pool, '111'), 'GET', '/api/tri/wallet')
    const rows = listed!.body.wallets.map((w: any) => [
      w.chain,
      w.address,
      w.paid,
    ])
    expect(rows).toEqual(
      expect.arrayContaining([
        ['evm', e.evm, false],
        ['solana', s.address, false],
        ['tron', t.tron, false],
        ['ton', ton.raw, true],
      ])
    )
    expect(listed!.body.wallets).toHaveLength(4)
    expect(pool.events.map(x => x.chain).sort()).toEqual([
      'evm',
      'solana',
      'ton',
      'tron',
    ])
  })

  it('refuses an EVM address another person holds, and a spent nonce', async () => {
    const pool = fakePool()
    const w = secpWallet()
    expect(
      (await bindWith(pool, '111', n => evmProof(w, { nonce: n })))?.status
    ).toBe(200)
    expect(await bindWith(pool, '222', n => evmProof(w, { nonce: n }))).toEqual(
      {
        status: 409,
        body: { error: 'wallet_bound_elsewhere' },
      }
    )
    const deps = depsFor(pool, '111')
    const ch = await call(deps, 'POST', '/api/tri/wallet/challenge')
    const proof = evmProof(w, { nonce: ch!.body.payload })
    expect((await call(deps, 'POST', '/api/tri/wallet', proof))?.status).toBe(
      200
    )
    expect(await call(deps, 'POST', '/api/tri/wallet', proof)).toEqual({
      status: 400,
      body: { error: 'payload_unknown' },
    })
  })

  it('unbinds an EVM wallet by chain, and leaves TON alone', async () => {
    const pool = fakePool()
    const w = secpWallet()
    await bindWith(pool, '111', n => evmProof(w, { nonce: n }))
    await bindWith(
      pool,
      '111',
      n => proofFor(makeWallet(), { payload: n }) as any
    )
    const deps = depsFor(pool, '111')
    expect(await call(deps, 'DELETE', '/api/tri/wallet?chain=evm')).toEqual({
      status: 200,
      body: { unbound: true },
    })
    expect(pool.wallets.map(x => x.chain)).toEqual(['ton'])
    expect(await call(deps, 'DELETE', '/api/tri/wallet?chain=bitcoin')).toEqual(
      {
        status: 400,
        body: { error: 'network_unknown' },
      }
    )
  })

  it('prints the text to sign without a person, and only for a parsed address', async () => {
    const w = secpWallet()
    const deps = depsFor(fakePool(), null)
    const r = await call(deps, 'POST', '/api/tri/wallet/message', {
      chain: 'evm',
      address: w.evm.toLowerCase(),
      nonce: PAYLOAD,
    })
    expect(r?.status).toBe(200)
    expect(r!.body.address).toBe(w.evm)
    expect(r!.body.message).toBe(
      bindMessage({
        domain: DOMAIN,
        chain: 'evm',
        address: w.evm,
        nonce: PAYLOAD,
        issuedAt: ISSUED,
      })
    )
    expect(r!.body.message.split('\n')).toHaveLength(8)
    expect(
      await call(deps, 'POST', '/api/tri/wallet/message', {
        chain: 'evm',
        address: '0x1234',
        nonce: PAYLOAD,
      })
    ).toEqual({ status: 400, body: { error: 'address_malformed' } })
  })

  it('a wallet browser proposes once, binds nothing, and the person confirms', async () => {
    const pool = fakePool()
    const person = depsFor(pool, '111')
    const browser = depsFor(pool, null)
    const ch = await call(person, 'POST', '/api/tri/wallet/challenge')
    const nonce = ch!.body.payload
    const w = solWallet()

    const proposed = await call(
      browser,
      'POST',
      '/api/tri/wallet/propose',
      solProof(w, { nonce })
    )
    expect(proposed).toEqual({
      status: 200,
      body: { proposed: true, chain: 'solana', address: w.address },
    })
    expect(pool.wallets).toEqual([])

    // A second signer on the same nonce is refused: first one stands.
    const other = await call(
      browser,
      'POST',
      '/api/tri/wallet/propose',
      solProof(solWallet(), { nonce })
    )
    expect(other).toEqual({ status: 400, body: { error: 'already_proposed' } })

    const listed = await call(person, 'GET', '/api/tri/wallet')
    expect(listed!.body.proposals).toMatchObject([
      { nonce, chain: 'solana', network: 'solana', address: w.address },
    ])

    // Not somebody else's yes.
    expect(
      await call(depsFor(pool, '222'), 'POST', '/api/tri/wallet', {
        confirm: nonce,
      })
    ).toEqual({ status: 400, body: { error: 'proposal_unknown' } })

    const bound = await call(person, 'POST', '/api/tri/wallet', {
      confirm: nonce,
    })
    expect(bound?.status).toBe(200)
    expect(bound!.body.wallet).toMatchObject({
      chain: 'solana',
      address: w.address,
      paid: false,
    })
    expect(
      await call(person, 'POST', '/api/tri/wallet', { confirm: nonce })
    ).toEqual({ status: 400, body: { error: 'proposal_unknown' } })
  })

  it('two wallets racing on one nonce: the database keeps the first', async () => {
    const pool = fakePool()
    const ch = await call(
      depsFor(pool, '111'),
      'POST',
      '/api/tri/wallet/challenge'
    )
    const nonce = ch!.body.payload
    const browser = depsFor(pool, null)
    const [a, b] = await Promise.all(
      [secpWallet(), secpWallet()].map(w =>
        call(browser, 'POST', '/api/tri/wallet/propose', evmProof(w, { nonce }))
      )
    )
    expect([a?.status, b?.status].sort()).toEqual([200, 400])
    const loser = a?.status === 400 ? a : b
    expect(loser!.body).toEqual({ error: 'already_proposed' })
    const winner = a?.status === 200 ? a : b
    expect(pool.challenges[0].proposed_address).toBe(winner!.body.address)
  })

  it('refuses a proposal on a nonce nobody was issued, or with a bad signature', async () => {
    const pool = fakePool()
    const browser = depsFor(pool, null)
    const w = secpWallet()
    expect(
      await call(browser, 'POST', '/api/tri/wallet/propose', evmProof(w))
    ).toEqual({ status: 400, body: { error: 'payload_unknown' } })
    const ch = await call(
      depsFor(pool, '111'),
      'POST',
      '/api/tri/wallet/challenge'
    )
    const forged = textProof(
      'evm',
      w.evm,
      t => secpSign('Ethereum', secpWallet().priv, t),
      { nonce: ch!.body.payload }
    )
    expect(
      await call(browser, 'POST', '/api/tri/wallet/propose', forged)
    ).toEqual({ status: 400, body: { error: 'signature_invalid' } })
  })

  it('confirms nothing that was never proposed', async () => {
    const pool = fakePool()
    const person = depsFor(pool, '111')
    const ch = await call(person, 'POST', '/api/tri/wallet/challenge')
    expect(
      await call(person, 'POST', '/api/tri/wallet', {
        confirm: ch!.body.payload,
      })
    ).toEqual({ status: 400, body: { error: 'proposal_unknown' } })
  })

  it('keeps the bind, challenge and list routes behind the person', async () => {
    const deps = depsFor(fakePool(), null)
    for (const [m, u] of [
      ['GET', '/api/tri/wallet'],
      ['POST', '/api/tri/wallet/challenge'],
      ['DELETE', '/api/tri/wallet?chain=evm'],
    ])
      expect(await call(deps, m, u)).toEqual({
        status: 401,
        body: { error: 'person_required' },
      })
  })
})

describe('the guard and the table', () => {
  it(
    'lets exactly the message and propose routes past the guard',
    async () => {
      const { isPublic } = await import('./auth')
      const { TRI_WALLET_PUBLIC_PATHS } = await import('./src/tri-wallet')
      for (const p of TRI_WALLET_PUBLIC_PATHS)
        expect(isPublic({ url: p, method: 'POST' } as any), p).toBe(true)
      for (const p of ['/api/tri/wallet', '/api/tri/wallet/challenge'])
        for (const method of ['GET', 'POST', 'DELETE'])
          expect(isPublic({ url: p, method } as any), `${method} ${p}`).toBe(
            false
          )
    },
    SLOW_IMPORT_TIMEOUT_MS
  )

  it("swaps a TON-only table's checks for one that names every chain", async () => {
    const seen: string[] = []
    const { ensureTriWalletTables } = await import('./src/tri-wallet')
    await ensureTriWalletTables({
      async query(text: string) {
        seen.push(text.replace(/\s+/g, ' '))
        return { rows: [] }
      },
    })
    const swap = seen.find(t => t.includes('ALTER TABLE tri_wallets '))!
    expect(swap).toContain('DROP CONSTRAINT IF EXISTS tri_wallets_chain_check')
    expect(swap).toContain(
      'DROP CONSTRAINT IF EXISTS tri_wallets_network_check'
    )
    for (const pair of [
      "chain = 'ton' AND network IN ('-239', '-3')",
      "chain = 'evm' AND network = 'eip155'",
      "chain = 'solana' AND network = 'solana'",
      "chain = 'tron' AND network = 'tron'",
    ])
      expect(swap).toContain(pair)
    expect(
      seen.some(t => t.includes('ADD COLUMN IF NOT EXISTS proposed_address'))
    ).toBe(true)
  })
})
