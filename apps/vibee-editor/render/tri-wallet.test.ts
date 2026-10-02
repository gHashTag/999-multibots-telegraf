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
      if (t.startsWith('CREATE ')) return { rows: [] }
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
          rows: wallets.filter(w => w.network === p[0] && w.address === p[1]),
        }
      if (t.startsWith('INSERT INTO tri_wallets')) {
        const existing = wallets.find(
          w => w.telegram_id === p[0] && w.network === p[1]
        )
        const row = existing ?? { telegram_id: p[0], network: p[1] }
        Object.assign(row, {
          address: p[2],
          public_key: p[3],
          bound_at: new Date(NOW),
        })
        if (!existing) wallets.push(row)
        return { rows: [row] }
      }
      if (t.startsWith('INSERT INTO tri_wallet_events')) {
        events.push({
          telegram_id: p[0],
          network: p[1],
          address: p[2],
          action: t.includes("'bind'") ? 'bind' : 'unbind',
        })
        return { rows: [] }
      }
      if (t.startsWith('SELECT network, address, bound_at FROM tri_wallets'))
        return { rows: wallets.filter(w => w.telegram_id === p[0]) }
      if (t.startsWith('DELETE FROM tri_wallets')) {
        const i = wallets.findIndex(
          w => w.telegram_id === p[0] && w.network === p[1]
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
      { telegram_id: '111', network: '-239', address: w.raw, action: 'bind' },
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

  it('refuses an agent key that chatIdentity would accept', async () => {
    const { chatIdentity, personIdentity } = await import('./src/agent/routes')
    process.env.AGENT_KEYS = 'tri_walletprobe:144022504'
    const r = req(TRI_WALLET_PATH, { 'x-agent-key': 'tri_walletprobe' })
    // The control: the same request IS somebody for the chat routes.
    expect(chatIdentity(r, null)).toBe('144022504')
    expect(personIdentity(r)).toBeNull()
  })

  it('refuses the server key naming a telegram_id', async () => {
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
  })
})
