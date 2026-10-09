import { describe, it, expect, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Address, Cell } from '@ton/core'
import { keyPairFromSeed, sign, type KeyPair } from '@ton/crypto'
import {
  assembleQuorum,
  attestationDigest,
  ed25519Verify,
  handleTriClaim,
  linkGithub,
  mintBody,
  resetTriClaimEnsureForTests,
  type Attestation,
  type MinterState,
  type Outside,
  type SignerAnswer,
  type TriClaimDeps,
} from './src/tri-claim'

/**
 * The claim side, against the minter's own vectors: the digest is the Zig
 * oracle's golden digest and the mint body is the BOC trinity-fpga's
 * TriMinter wrapper builds for the same attestation, so a byte that drifts
 * from the contract fails here, not on chain. Signatures are real ed25519.
 */

const ORACLE_DIGEST =
  '9ce2cee577fd87a72b837d56c728b70a580e366f4a5b7339dba8146439c1dde7'
const ORACLE_PK0 =
  'cecc1507dc1ddd7295951c290888f095adb9044d1b73d696e6df065d683bd4fc'
const ORACLE_SIG0 =
  '670a391db25b567d13262d640c396b9e1847879b9d63f212bb2e4cfea74bcce64170fa67c516c7ce707da7750e1795a0556554e32d9495b3c27de82df74b8203'
const ORACLE_SIG1 =
  'f1e57f4fe075f474cb8721821a3d77553b93de135fd646ef8ea2009231e1f38b4a133aa81bedf759bd565b32c6fdbc444103dff4a08fde26ef7da88dd3d3fc0c'
// mintBody({ att: sampleAtt(1n, 5n), sigs: {0: SIG0, 1: SIG1} }) from contracts/ton/wrappers/TriMinter.ts.
const WRAPPER_MINT_BOC =
  'te6cckEBBAEA+AAB01RSSTEAAAAAAAAAAAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkBAAAAAAAAAAUAAAAAAAAAAAAAAAAAAAABAAAAAcABAgHPAgMAgRnCjkdsltWfRMmLWQMOWueGEeHm51j8hK7Lkz+p0vM5kFw+mfFFsfOcH2ndQ4XlaBVZVTjLZSVs8J96C33S4IDgAIE8eV/T+B19HTLhyGCGj13VTuT3hNf1kbvjqIAkjHh84tKEzqoG+33Wb1WWzLG/bxEQQPf9KCP3ibvfaiN09P8DIMTIqEQ='

const key = (i: number): KeyPair => {
  const seed = Buffer.alloc(32)
  seed[0] = i + 1
  return keyPairFromSeed(seed)
}
const KEYS = [0, 1, 2].map(key)

const sampleAtt: Attestation = {
  worker: Buffer.alloc(32, 7),
  workId: Buffer.alloc(32, 9),
  chain: 1,
  amountMtri: 5n,
  globalNonce: 1n,
  epoch: 1,
}

describe('the bytes the minter reads', () => {
  it('the attestation digest is the oracle golden vector', () => {
    expect(attestationDigest(sampleAtt).toString('hex')).toBe(ORACLE_DIGEST)
  })

  it('the mint body is the BOC the minter wrapper builds', () => {
    const sigs = new Map([
      [0, Buffer.from(ORACLE_SIG0, 'hex')],
      [1, Buffer.from(ORACLE_SIG1, 'hex')],
    ])
    const ours = mintBody(sampleAtt, sigs)
    expect(ours.hash().equals(Cell.fromBase64(WRAPPER_MINT_BOC).hash())).toBe(
      true
    )
  })

  it('verifies an oracle signature, and nothing else', () => {
    const d = Buffer.from(ORACLE_DIGEST, 'hex')
    const pk = Buffer.from(ORACLE_PK0, 'hex')
    expect(ed25519Verify(d, Buffer.from(ORACLE_SIG0, 'hex'), pk)).toBe(true)
    expect(ed25519Verify(d, Buffer.from(ORACLE_SIG1, 'hex'), pk)).toBe(false)
    expect(ed25519Verify(d, Buffer.alloc(3), pk)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

const WORK_ID = 'e'.repeat(64)
const PAYEE_RAW = `0:${'ab'.repeat(32)}`
const PAYEE = Address.parseRaw(PAYEE_RAW)
const NONCE = 123456789n

const attFor = (over: Partial<Attestation> = {}): Attestation => ({
  worker: PAYEE.hash,
  workId: Buffer.from(WORK_ID, 'hex'),
  chain: 1,
  amountMtri: 27_000n,
  globalNonce: NONCE,
  epoch: 1,
  ...over,
})

function signed(i: number, att = attFor(), signer = KEYS[i]): SignerAnswer {
  const d = attestationDigest(att)
  return {
    ok: true,
    index: i,
    signature: sign(d, signer.secretKey).toString('hex'),
    digest: d.toString('hex'),
    attestation: {
      worker: att.worker.toString('hex'),
      workId: att.workId.toString('hex'),
      chain: att.chain,
      amountMtri: att.amountMtri.toString(),
      globalNonce: att.globalNonce.toString(),
      epoch: att.epoch,
    },
  }
}

const minterState: MinterState = {
  epoch: 1,
  threshold: 2,
  keyAt: async i => KEYS[i]?.publicKey ?? null,
}
const want = { workId: WORK_ID, payee: PAYEE, amountMtri: 27_000n }

describe('assembling a quorum', () => {
  it('takes exactly the threshold of signatures the minter keys verify', async () => {
    const q = await assembleQuorum(
      [signed(0), signed(1), signed(2)],
      want,
      minterState
    )
    expect(q.ok).toBe(true)
    if (q.ok) expect([...q.sigs.keys()]).toEqual([0, 1])
  })

  it('drops a signature not made by the key the minter holds at that index', async () => {
    const q = await assembleQuorum(
      [signed(0, attFor(), KEYS[2]), signed(1)],
      want,
      minterState
    )
    expect(q).toMatchObject({
      ok: false,
      refusals: ['signature_not_from_minter_key'],
    })
  })

  it('drops an attestation for another payee, amount or epoch', async () => {
    const other = attFor({ worker: Buffer.alloc(32, 1) })
    const more = attFor({ amountMtri: 81_000n })
    const old = attFor({ epoch: 0 })
    const q = await assembleQuorum(
      [signed(0, other), signed(1, more), signed(2, old)],
      want,
      minterState
    )
    expect(q).toMatchObject({
      ok: false,
      code: 'signer_attested_something_else',
    })
  })

  it('names the one reason when every signer gives it', async () => {
    const no: SignerAnswer = { ok: false, code: 'already_minted' }
    expect(await assembleQuorum([no, no, no], want, minterState)).toMatchObject(
      {
        ok: false,
        code: 'already_minted',
      }
    )
    expect(
      await assembleQuorum(
        [
          signed(0),
          { ok: false, code: 'not_merged' },
          { ok: false, code: 'signer_unreachable' },
        ],
        want,
        minterState
      )
    ).toMatchObject({ ok: false, code: 'quorum_not_reached' })
  })

  it('takes an answer that does not parse as that signer refusing, and keeps the others', async () => {
    const bad = signed(0)
    if (bad.ok) bad.attestation.amountMtri = 'lots'
    const noSig = {
      ...signed(1),
      signature: undefined,
    } as unknown as SignerAnswer
    const q = await assembleQuorum(
      [bad, noSig, signed(1), signed(2)],
      want,
      minterState
    )
    expect(q.ok).toBe(true)
    if (q.ok) expect([...q.sigs.keys()]).toEqual([1, 2])
    expect(
      await assembleQuorum([bad, bad, bad], want, minterState)
    ).toMatchObject({ ok: false, code: 'signer_answer_malformed' })
  })
})

// ---------------------------------------------------------------------------
// The routes, over a fake pool that knows exactly the statements the module
// sends; an unknown statement throws.
// ---------------------------------------------------------------------------

type Row = Record<string, any>

function fakePool() {
  const flows: Row[] = []
  const links: Row[] = []
  const linkEvents: Row[] = []
  const claimEvents: Row[] = []
  const wallets: Row[] = [
    { telegram_id: '7', chain: 'ton', network: '-3', address: PAYEE_RAW },
  ]
  const created: string[] = []
  const pool = {
    created,
    flows,
    links,
    linkEvents,
    claimEvents,
    wallets,
    async query(text: string, p: any[] = []) {
      const t = text.replace(/\s+/g, ' ').trim()
      // The wallet tables come with their ALTERs (tri-wallet.ts: the
      // proposal columns, the every-chain check); schema only, no rows.
      if (t.startsWith('CREATE ') || t.startsWith('ALTER TABLE')) {
        created.push(t)
        return { rows: [] }
      }
      if (t.startsWith('DELETE FROM tri_github_flows')) {
        for (let i = flows.length - 1; i >= 0; i--)
          if (flows[i].telegram_id === p[0]) flows.splice(i, 1)
        return { rows: [] }
      }
      if (t.startsWith('INSERT INTO tri_github_flows')) {
        flows.push({
          device_code: p[0],
          telegram_id: p[1],
          user_code: p[2],
          interval_s: p[3],
          expires_at: p[4],
          polled_at: null,
        })
        return { rows: [] }
      }
      if (
        t.startsWith(
          'SELECT device_code, interval_s, expires_at, polled_at FROM tri_github_flows'
        )
      )
        return { rows: flows.filter(f => f.telegram_id === p[0]) }
      if (t.startsWith('UPDATE tri_github_flows SET polled_at')) {
        for (const f of flows)
          if (f.telegram_id === p[0])
            Object.assign(f, { polled_at: p[1], interval_s: p[2] })
        return { rows: [] }
      }
      if (t.startsWith('DELETE FROM tri_github WHERE (github_id')) {
        const gone = links.filter(
          l =>
            (l.github_id === p[0] ||
              String(l.github_login).toLowerCase() ===
                String(p[2]).toLowerCase()) &&
            l.telegram_id !== p[1]
        )
        for (const g of gone) links.splice(links.indexOf(g), 1)
        return { rows: gone }
      }
      if (t.startsWith('DELETE FROM tri_github WHERE telegram_id')) {
        const gone = links.filter(l => l.telegram_id === p[0])
        for (const g of gone) links.splice(links.indexOf(g), 1)
        return { rows: gone }
      }
      if (t.startsWith('INSERT INTO tri_github ')) {
        const row = links.find(l => l.telegram_id === p[0])
        if (row) Object.assign(row, { github_id: p[1], github_login: p[2] })
        else
          links.push({
            telegram_id: p[0],
            github_id: p[1],
            github_login: p[2],
            linked_at: 'now',
          })
        return { rows: [] }
      }
      if (t.startsWith('INSERT INTO tri_github_events')) {
        linkEvents.push({
          telegram_id: p[0],
          github_id: p[1],
          github_login: p[2],
          action: t.includes("'link'") ? 'link' : 'unlink',
        })
        return { rows: [] }
      }
      if (
        t.startsWith(
          'SELECT github_login, github_id, linked_at FROM tri_github'
        )
      )
        return { rows: links.filter(l => l.telegram_id === p[0]) }
      if (t.startsWith('SELECT address FROM tri_wallets'))
        return {
          rows: wallets.filter(
            w => w.telegram_id === p[0] && w.network === p[1]
          ),
        }
      if (t.startsWith('SELECT w.address FROM tri_github g')) {
        const l = links.find(
          x => x.github_login.toLowerCase() === String(p[0]).toLowerCase()
        )
        return {
          rows: l
            ? wallets.filter(
                w => w.telegram_id === l.telegram_id && w.network === p[1]
              )
            : [],
        }
      }
      if (t.startsWith('INSERT INTO tri_claim_events')) {
        claimEvents.push({
          telegram_id: p[0],
          work_id: p[1],
          network: p[2],
          payee: p[3],
          outcome: p[4],
        })
        return { rows: [] }
      }
      if (t.startsWith('SELECT DISTINCT work_id FROM tri_claim_events'))
        return {
          rows: claimEvents.filter(
            e => e.telegram_id === p[0] && e.outcome === 'built'
          ),
        }
      throw new Error(`unexpected statement: ${t}`)
    },
  }
  return pool
}

const MINTER = Address.parseRaw(`0:${'5a'.repeat(32)}`)

type FakeOutside = Outside & { polls: number }

function fakeOutside(over: Partial<Outside> = {}): FakeOutside {
  const o: FakeOutside = {
    polls: 0,
    queenEarning: async (id: string) =>
      id === WORK_ID
        ? {
            triPerSpec: 27,
            earning: {
              workId: WORK_ID,
              repo: 'gHashTag/t27',
              issue: 5429,
              commit: '7808383a3ca84c8a7ec813ae0869d8f3f7dc6309',
              specPaths: ['specs/x.t27'],
              acceptedAt: '2026-09-30T00:00:00.000Z',
              revokedAt: null,
            },
            earner: { github: 'gHashTag' },
          }
        : null,
    queenEarningsOf: async (): Promise<{
      triPerSpec: number
      earnings: any[]
    }> => ({
      triPerSpec: 27,
      earnings: [(await o.queenEarning(WORK_ID))!.earning],
    }),
    sign: async () => [
      signed(0),
      signed(1),
      { ok: false as const, code: 'signer_unreachable' },
    ],
    minter: async () => ({
      ...minterState,
      address: MINTER,
      isSpent: async () => false,
    }),
    githubDeviceCode: async () => ({
      device_code: 'DEVICE-SECRET',
      user_code: 'ABCD-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 899,
      interval: 5,
    }),
    githubPoll: async () => {
      o.polls += 1
      return o.polls === 1
        ? { error: 'authorization_pending' }
        : { login: 'gHashTag', id: 4242 }
    },
  }
  return Object.assign(o, over)
}

let clock = Date.UTC(2026, 9, 2, 12, 0, 0)

async function call(
  deps: TriClaimDeps,
  method: string,
  url: string,
  body?: unknown
) {
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
  const handled = await handleTriClaim(req, res, deps)
  if (!handled) return null
  return { status, body: JSON.parse(text) }
}

function depsFor(
  pool: ReturnType<typeof fakePool>,
  person: string | null,
  outside: Outside | null = fakeOutside()
): TriClaimDeps {
  return {
    getPool: () => pool,
    personOf: () => person,
    readBody: async (req: IncomingMessage) => {
      let s = ''
      for await (const c of req as unknown as AsyncIterable<Buffer>)
        s += c.toString()
      return s
    },
    outside,
    now: () => clock,
    log: () => {},
  }
}

async function linked(
  pool: ReturnType<typeof fakePool>,
  person = '7',
  outside: FakeOutside = fakeOutside()
) {
  await call(depsFor(pool, person, outside), 'POST', '/api/tri/github/start')
  outside.polls = 1 // the next poll is approved
  const r = await call(
    depsFor(pool, person, outside),
    'POST',
    '/api/tri/github/poll'
  )
  expect(r?.status).toBe(200)
}

describe('the TRI claim routes', () => {
  beforeEach(() => {
    resetTriClaimEnsureForTests()
    clock = Date.UTC(2026, 9, 2, 12, 0, 0)
  })

  it('leaves every other URL alone, and wants a person for all but the payee record', async () => {
    expect(
      await call(depsFor(fakePool(), '7'), 'GET', '/api/tri/wallet')
    ).toBeNull()
    expect(
      (await call(depsFor(fakePool(), null), 'GET', '/api/tri/claims'))?.status
    ).toBe(401)
    expect(
      (
        await call(
          depsFor(fakePool(), null),
          'GET',
          '/api/tri/payee?github=gHashTag&network=-3'
        )
      )?.status
    ).toBe(200)
  })

  it('links GitHub by device flow, keeps the device code server-side, and never outpaces GitHub', async () => {
    const pool = fakePool()
    const outside = fakeOutside()
    const deps = depsFor(pool, '7', outside)
    const start = await call(deps, 'POST', '/api/tri/github/start')
    expect(start?.body).toEqual({
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 899,
      interval: 5,
    })
    expect(JSON.stringify(start?.body)).not.toContain('DEVICE-SECRET')

    expect((await call(deps, 'POST', '/api/tri/github/poll'))?.status).toBe(202)
    // Within the interval: answered here, GitHub is not asked.
    expect(
      (await call(deps, 'POST', '/api/tri/github/poll'))?.body
    ).toMatchObject({ pending: true })
    expect(outside.polls).toBe(1)

    clock += 6000
    const done = await call(deps, 'POST', '/api/tri/github/poll')
    expect(done).toEqual({
      status: 200,
      body: { github: { login: 'gHashTag' } },
    })
    expect(pool.links).toMatchObject([
      { telegram_id: '7', github_id: 4242, github_login: 'gHashTag' },
    ])
    expect(pool.flows).toEqual([])
  })

  it('moves an account another person had linked, and logs both sides', async () => {
    const pool = fakePool()
    await linked(pool, '8')
    await linked(pool, '7')
    expect(pool.links.map(l => l.telegram_id)).toEqual(['7'])
    expect(pool.linkEvents.map(e => `${e.telegram_id}:${e.action}`)).toEqual([
      '8:link',
      '8:unlink',
      '7:link',
    ])
  })

  it('moves a login a renamed account freed, and logs the old account id', async () => {
    const pool = fakePool()
    await linkGithub(pool, '8', { login: 'Alice', id: 111 })
    await linkGithub(pool, '7', { login: 'alice', id: 222 })
    expect(pool.links.map(l => `${l.telegram_id}:${l.github_id}`)).toEqual([
      '7:222',
    ])
    expect(
      pool.linkEvents.map(e => `${e.telegram_id}:${e.github_id}:${e.action}`)
    ).toEqual(['8:111:link', '8:111:unlink', '7:222:link'])
  })

  it('reports a denied or expired approval and forgets the flow', async () => {
    const pool = fakePool()
    const outside = fakeOutside({
      githubPoll: async () => ({ error: 'access_denied' }),
    })
    await call(depsFor(pool, '7', outside), 'POST', '/api/tri/github/start')
    expect(
      (await call(depsFor(pool, '7', outside), 'POST', '/api/tri/github/poll'))
        ?.status
    ).toBe(403)
    expect(pool.flows).toEqual([])
    await call(depsFor(pool, '7', outside), 'POST', '/api/tri/github/start')
    clock += 900_000
    expect(
      (await call(depsFor(pool, '7', outside), 'POST', '/api/tri/github/poll'))
        ?.status
    ).toBe(410)
  })

  it('the payee record answers on a database the wallet route never touched', async () => {
    // A signer may ask before anybody opened the wallet card: the claim side
    // joins tri_wallets, so it has to create that table itself.
    const pool = fakePool()
    await call(
      depsFor(pool, null),
      'GET',
      '/api/tri/payee?github=gHashTag&network=-3'
    )
    expect(
      pool.created.some(t =>
        /^CREATE TABLE IF NOT EXISTS tri_wallets\b/.test(t)
      )
    ).toBe(true)
  })

  it('publishes the payee record a signer reads, and only a bound one', async () => {
    const pool = fakePool()
    const before = await call(
      depsFor(pool, null),
      'GET',
      '/api/tri/payee?github=gHashTag&network=-3'
    )
    expect(before?.body.address).toBeNull()
    await linked(pool)
    const after = await call(
      depsFor(pool, null),
      'GET',
      '/api/tri/payee?github=ghashtag&network=-3'
    )
    expect(after?.body.address).toBe(PAYEE_RAW)
    expect(
      (
        await call(
          depsFor(pool, null),
          'GET',
          '/api/tri/payee?github=-x-&network=-3'
        )
      )?.status
    ).toBe(400)
    expect(
      (
        await call(
          depsFor(pool, null),
          'GET',
          '/api/tri/payee?github=gHashTag&network=1'
        )
      )?.status
    ).toBe(400)
  })

  it('refuses a claim before GitHub is linked, without a wallet, or for somebody else', async () => {
    const pool = fakePool()
    const claim = (p = pool, who = '7', outside = fakeOutside()) =>
      call(depsFor(p, who, outside), 'POST', '/api/tri/claim', {
        workId: WORK_ID,
      })
    expect((await claim())?.body).toEqual({ error: 'github_unlinked' })
    await linked(pool)
    pool.wallets.length = 0
    expect((await claim())?.body).toEqual({ error: 'wallet_unbound' })
    pool.wallets.push({
      telegram_id: '7',
      chain: 'ton',
      network: '-3',
      address: PAYEE_RAW,
    })
    const stranger = fakeOutside()
    const real = stranger.queenEarning
    stranger.queenEarning = async id => {
      const e = await real(id)
      return e && { ...e, earner: { github: 'someone-else' } }
    }
    expect((await claim(pool, '7', stranger))?.status).toBe(403)
  })

  it('builds the mint for the person to send: minter, value, and a body the minter accepts', async () => {
    const pool = fakePool()
    await linked(pool)
    const r = await call(depsFor(pool, '7'), 'POST', '/api/tri/claim', {
      workId: WORK_ID,
    })
    expect(r?.status).toBe(200)
    expect(r?.body.message.address).toBe(
      MINTER.toString({ testOnly: true, bounceable: true })
    )
    expect(r?.body.message.amount).toBe('100000000')
    expect(r?.body.attestation).toMatchObject({
      amountMtri: '27000',
      signers: [0, 1],
    })
    const body = Cell.fromBase64(r?.body.message.payload)
    expect(
      body.hash().equals(
        mintBody(
          attFor(),
          new Map([
            [0, Buffer.from((signed(0) as any).signature, 'hex')],
            [1, Buffer.from((signed(1) as any).signature, 'hex')],
          ])
        ).hash()
      )
    ).toBe(true)
    expect(pool.claimEvents.map(e => e.outcome)).toEqual(['built'])

    const list = await call(depsFor(pool, '7'), 'GET', '/api/tri/claims')
    expect(list?.body).toMatchObject({
      github: { login: 'gHashTag' },
      wallet: PAYEE_RAW,
      triPerSpec: 27,
    })
    expect(list?.body.earnings).toMatchObject([
      { workId: WORK_ID, issue: 5429, requested: true },
    ])
  })

  it('passes on a refusal every signer agrees on, and logs it', async () => {
    const pool = fakePool()
    await linked(pool)
    const no = { ok: false as const, code: 'already_minted' }
    const outside = fakeOutside({ sign: async () => [no, no, no] })
    const r = await call(
      depsFor(pool, '7', outside),
      'POST',
      '/api/tri/claim',
      { workId: WORK_ID }
    )
    expect(r).toMatchObject({ status: 409, body: { error: 'already_minted' } })
    expect(pool.claimEvents.map(e => e.outcome)).toEqual(['already_minted'])
  })

  it('answers 503 rather than half-working when the claim side is not configured', async () => {
    expect(
      (
        await call(depsFor(fakePool(), '7', null), 'POST', '/api/tri/claim', {
          workId: WORK_ID,
        })
      )?.status
    ).toBe(503)
  })
})

describe('withdraw all: many mint messages in one request (spec tri-claim-batch)', () => {
  beforeEach(() => {
    resetTriClaimEnsureForTests()
    clock = Date.UTC(2026, 9, 2, 12, 0, 0)
  })

  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => i.toString(16).padStart(64, '0'))
  /** Queen credits every id to gHashTag; the signers sign each id for real. */
  const many = (
    minted: Set<string> = new Set(),
    revoked = new Set<string>()
  ) => {
    let minterCalls = 0
    const o = fakeOutside({
      queenEarning: async id => ({
        triPerSpec: 27,
        earning: {
          workId: id,
          repo: 'gHashTag/t27',
          issue: 1,
          commit: 'c'.repeat(40),
          specPaths: ['specs/x.t27'],
          acceptedAt: '2026-09-30T00:00:00.000Z',
          revokedAt: revoked.has(id) ? '2026-10-01T00:00:00.000Z' : null,
        },
        earner: { github: 'gHashTag' },
      }),
      sign: async id => {
        if (minted.has(id)) {
          const no = { ok: false as const, code: 'already_minted' }
          return [no, no, no]
        }
        const att = attFor({ workId: Buffer.from(id, 'hex') })
        return [signed(0, att), signed(1, att), signed(2, att)]
      },
    })
    const minter = o.minter
    o.minter = async () => {
      minterCalls += 1
      return minter()
    }
    return { o, minterCalls: () => minterCalls }
  }
  const batch = (
    pool: ReturnType<typeof fakePool>,
    outside: Outside,
    body: unknown
  ) => call(depsFor(pool, '7', outside), 'POST', '/api/tri/claim/batch', body)

  it('builds at most sixteen messages, each with its own quorum, and reads the minter once', async () => {
    const pool = fakePool()
    await linked(pool)
    const { o, minterCalls } = many()
    const r = await batch(pool, o, { workIds: ids(20), walletMax: 255 })
    expect(r?.status).toBe(200)
    expect(r?.body.messages).toHaveLength(16)
    expect(r?.body.left).toBe(4)
    expect(r?.body.refused).toEqual([])
    expect(r?.body.perTx).toBe(255)
    expect(minterCalls()).toBe(1)
    for (const [i, m] of r!.body.messages.entries()) {
      expect(m.workId).toBe(ids(20)[i])
      expect(m.amount).toBe('100000000')
      const want = mintBody(
        attFor({ workId: Buffer.from(m.workId, 'hex') }),
        new Map([
          [
            0,
            Buffer.from(
              (
                signed(
                  0,
                  attFor({ workId: Buffer.from(m.workId, 'hex') })
                ) as any
              ).signature,
              'hex'
            ),
          ],
          [
            1,
            Buffer.from(
              (
                signed(
                  1,
                  attFor({ workId: Buffer.from(m.workId, 'hex') })
                ) as any
              ).signature,
              'hex'
            ),
          ],
        ])
      )
      expect(Cell.fromBase64(m.payload).hash().equals(want.hash())).toBe(true)
    }
    expect(pool.claimEvents.filter(e => e.outcome === 'built')).toHaveLength(16)
  })

  it('names each refused earning and still builds the rest', async () => {
    const pool = fakePool()
    await linked(pool)
    const all = ids(4)
    const { o } = many(new Set([all[1]]), new Set([all[2]]))
    const r = await batch(pool, o, { workIds: all })
    expect(r?.body.messages.map((m: any) => m.workId)).toEqual([all[0], all[3]])
    expect(r?.body.refused).toEqual([
      { workId: all[1], code: 'already_minted' },
      { workId: all[2], code: 'earning_revoked' },
    ])
  })

  it('carries what the wallet allows, four when it says nothing, never above 255', async () => {
    const pool = fakePool()
    await linked(pool)
    const { o } = many()
    for (const [walletMax, perTx] of [
      [undefined, 4],
      [0, 4],
      [1, 1],
      [255, 255],
      [1000, 255],
      [-3, 4],
      [2.5, 4],
    ] as const)
      expect(
        (await batch(pool, o, { workIds: ids(1), walletMax }))?.body.perTx
      ).toBe(perTx)
  })

  it('refuses a batch with no valid id, before GitHub, or without a wallet', async () => {
    const pool = fakePool()
    const { o } = many()
    expect((await batch(pool, o, { workIds: ['nope'] }))?.body).toEqual({
      error: 'work_id_malformed',
    })
    expect((await batch(pool, o, { workIds: ids(2) }))?.body).toEqual({
      error: 'github_unlinked',
    })
    await linked(pool)
    pool.wallets.length = 0
    expect((await batch(pool, o, { workIds: ids(2) }))?.body).toEqual({
      error: 'wallet_unbound',
    })
    expect(
      (
        await call(
          depsFor(fakePool(), '7', null),
          'POST',
          '/api/tri/claim/batch',
          {
            workIds: ids(1),
          }
        )
      )?.status
    ).toBe(503)
  })
})
