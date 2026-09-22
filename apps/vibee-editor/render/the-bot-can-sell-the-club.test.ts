import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import {
  clubCaller,
  handleClub,
  forgetClubTablesForTests,
} from './src/agent/club-membership'
import { clubIdentity } from './src/agent/club-identity'
import { authenticate, isPublic } from './auth'
import { forgetTable } from './src/hive/journal'

/**
 * THE BOT CAN ASK FOR A CLUB INVOICE ON SOMEBODY'S BEHALF -- AND NOBODY ELSE CAN.
 *
 * Measured 2026-09-22: 49 new people in the bots in thirty days, 5 of them
 * ever opened the Mini App, and the club was sold only there -- because the
 * club routes accepted only a person's own proof (signature, app session,
 * agent key), so the bot could not mint an invoice at all. It sold retired
 * tiers instead.
 *
 * The bot now asks with the SERVER key and names the person in
 * `?telegram_id=`. The danger is the other half: these paths are PUBLIC_EXACT
 * in auth.ts, so the general guard never looks at them, and a name in the
 * query string read WITHOUT the server key would let anybody mint, verify or
 * read anybody's membership by typing a number.
 */

type Sql = { sql: string; params: unknown[] }

/** Knows the statements these routes make; anything else is a failure, not an empty answer. */
function strictPool() {
  const seen: Sql[] = []
  return {
    seen,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      seen.push({ sql: s, params })
      if (/^CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/i.test(s))
        return { rows: [] }
      if (
        /^INSERT INTO hive_events \(kind, who, bot, amount, what, severity\)/i.test(
          s
        )
      )
        return { rows: [] }
      if (
        /FROM club_period WHERE telegram_id = \$1 ORDER BY until DESC LIMIT 1$/i.test(
          s
        )
      )
        return { rows: [] }
      throw new Error(`strictPool does not know: ${s.slice(0, 100)}`)
    },
  }
}

function cashier() {
  const minted: Array<Record<string, any>> = []
  const fetchImpl = (async (url: string, init?: { body?: string }) => {
    if (!/\/createInvoiceLink$/.test(String(url))) {
      throw new Error(`the cashier was asked for ${url}`)
    }
    const body = JSON.parse(String(init?.body ?? '{}'))
    minted.push(body)
    return {
      json: async () => ({
        ok: true,
        result: `https://t.me/$club-${body.payload}`,
      }),
    }
  }) as unknown as typeof fetch
  return { minted, fetchImpl }
}

beforeEach(() => {
  forgetClubTablesForTests()
  forgetTable()
})

describe('clubCaller: whose club this request is about', () => {
  const at = (q: string) => ({ url: `/api/club/invoice${q}` })

  it("a person's own proof always wins over a name in the query", () => {
    expect(clubCaller(at('?telegram_id=900000062'), '900000061', true)).toBe(
      '900000061'
    )
    expect(clubCaller(at('?telegram_id=900000062'), '900000061', false)).toBe(
      '900000061'
    )
  })

  it('the server key may name a person', () => {
    expect(clubCaller(at('?telegram_id=900000061'), null, true)).toBe(
      '900000061'
    )
  })

  it('without the server key a name in the query is nobody', () => {
    expect(clubCaller(at('?telegram_id=900000061'), null, false)).toBeNull()
  })

  it('the server key cannot name a chat, a word or a short number', () => {
    for (const q of [
      '',
      '?telegram_id=',
      '?telegram_id=-100777',
      '?telegram_id=abc',
      '?telegram_id=1234',
      '?telegram_id=9000000611234567',
    ]) {
      expect(clubCaller(at(q), null, true), q).toBeNull()
    }
  })
})

describe('the invoice route, through clubCaller', () => {
  const deps = (
    pool: ReturnType<typeof strictPool>,
    fetchImpl: typeof fetch,
    proof: { person: string | null; server: boolean }
  ) => ({
    getPool: async () => pool,
    identity: (r: { url?: string }) =>
      clubCaller(r, proof.person, proof.server),
    botToken: 'cashier-token',
    credit: async () => ({ credited: true }),
    fetchImpl,
  })

  it('the bot with the server key gets an invoice FOR the person it named', async () => {
    const pool = strictPool()
    const c = cashier()
    const out = await handleClub(
      { url: '/api/club/invoice?telegram_id=900000061', method: 'POST' },
      deps(pool, c.fetchImpl, { person: null, server: true })
    )
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ ok: true, stars: 10_000, tokens: 2_571 })
    expect(c.minted).toHaveLength(1)
    expect(c.minted[0].payload).toBe('club:10000:900000061')
    expect(c.minted[0].subscription_period).toBe(30 * 24 * 60 * 60)
    // The sale is journaled against the person, not against the bot.
    const journal = pool.seen.filter(q => /INSERT INTO hive_events/.test(q.sql))
    expect(journal.map(j => j.params[1])).toEqual(['900000061'])
  })

  it('a name in the query without the server key mints nothing', async () => {
    const pool = strictPool()
    const c = cashier()
    const out = await handleClub(
      { url: '/api/club/invoice?telegram_id=900000061', method: 'POST' },
      deps(pool, c.fetchImpl, { person: null, server: false })
    )
    expect(out.status).toBe(401)
    expect(c.minted).toEqual([])
  })

  it('status and verify are closed the same way', async () => {
    for (const [url, method] of [
      ['/api/club/verify?telegram_id=900000061', 'POST'],
    ]) {
      const c = cashier()
      const out = await handleClub(
        { url, method },
        deps(strictPool(), c.fetchImpl, { person: null, server: false })
      )
      expect(out.status, url).toBe(401)
    }
    // Status without anybody answers the public price and NO membership.
    const out = await handleClub(
      { url: '/api/club/status?telegram_id=900000061', method: 'GET' },
      deps(strictPool(), cashier().fetchImpl, { person: null, server: false })
    )
    expect(out.body).toMatchObject({ anonymous: true, active: false })
  })

  it('a signed-in person naming somebody else still gets their own invoice', async () => {
    const pool = strictPool()
    const c = cashier()
    await handleClub(
      { url: '/api/club/invoice?telegram_id=900000062', method: 'POST' },
      deps(pool, c.fetchImpl, { person: '900000061', server: false })
    )
    expect(c.minted[0].payload).toBe('club:10000:900000061')
  })
})

/*
 * THE FUNCTION THE SERVER USES, RUN WITH THE BOT'S OWN REQUEST.
 *
 * Everything above takes "is this the server key" as a boolean. The defect
 * that shipped was in computing that boolean: the server asked
 * `authenticate(req).via === 'api-key'`, and on a PUBLIC_EXACT path
 * `authenticate` answers 'public' before it looks at any key -- so the bot's
 * route into the club was closed in production while every test here passed,
 * because the only wiring test read that expression out of render-server.ts
 * and pinned it. Here the real `clubIdentity` runs against a real
 * IncomingMessage carrying what the bot sends (src/services/clubMembership.ts:
 * X-Api-Key, ?telegram_id=), through the real auth.ts.
 */
const SERVER_KEY = 'club-server-key-for-tests-long-enough'

function incoming(
  url: string,
  method: string,
  headers: Record<string, string>
): IncomingMessage {
  const req = new IncomingMessage(new Socket())
  req.url = url
  req.method = method
  // Node hands a handler lower-cased header names, whatever the client wrote.
  req.headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  )
  return req
}

/** Exactly the request src/services/clubMembership.ts (callClub) makes. */
const fromTheBot = (
  route: 'status' | 'invoice' | 'verify',
  id: string,
  key: string | null = SERVER_KEY
) =>
  incoming(
    `/api/club/${route}?telegram_id=${encodeURIComponent(id)}`,
    route === 'status' ? 'GET' : 'POST',
    {
      ...(key === null ? {} : { 'X-Api-Key': key }),
      'Content-Type': 'application/json',
    }
  )

describe('clubIdentity: the server key reaches the club although the paths are public', () => {
  let savedKey: string | undefined
  let savedAgentKeys: string | undefined
  beforeEach(() => {
    savedKey = process.env.RENDER_API_KEY
    savedAgentKeys = process.env.AGENT_KEYS
    process.env.RENDER_API_KEY = SERVER_KEY
    delete process.env.AGENT_KEYS
  })
  afterEach(() => {
    if (savedKey === undefined) delete process.env.RENDER_API_KEY
    else process.env.RENDER_API_KEY = savedKey
    if (savedAgentKeys === undefined) delete process.env.AGENT_KEYS
    else process.env.AGENT_KEYS = savedAgentKeys
  })

  it('the trap is real: the club paths are public, so authenticate() never says api-key', () => {
    // If this stops being true the reason for clubIdentity changes, and this
    // file should be re-read rather than left green.
    for (const route of ['status', 'invoice', 'verify'] as const) {
      const req = fromTheBot(route, '900000061')
      expect(isPublic(req), route).toBe(true)
      expect(authenticate(req).via, route).toBe('public')
    }
  })

  it("the bot's request with the right key names the person", () => {
    for (const route of ['status', 'invoice', 'verify'] as const) {
      expect(clubIdentity(fromTheBot(route, '900000061')), route).toBe(
        '900000061'
      )
    }
  })

  it('without the key, with a wrong key or a prefix of it, the name is nobody', () => {
    for (const key of [
      null,
      '',
      'another-key-of-exactly-the-same-len!',
      SERVER_KEY.slice(0, 8),
      SERVER_KEY + 'x',
    ]) {
      expect(
        clubIdentity(fromTheBot('invoice', '900000061', key)),
        String(key)
      ).toBeNull()
    }
  })

  it('an unset server key on the render opens nothing, even to an empty header', () => {
    process.env.RENDER_API_KEY = ''
    expect(clubIdentity(fromTheBot('invoice', '900000061', ''))).toBeNull()
    expect(clubIdentity(fromTheBot('invoice', '900000061'))).toBeNull()
  })

  it("a person's own proof wins over a name the server key puts in the query", () => {
    process.env.AGENT_KEYS = 'agent-key-of-the-person:900000062'
    const req = incoming('/api/club/invoice?telegram_id=900000061', 'POST', {
      'X-Api-Key': SERVER_KEY,
      'X-Agent-Key': 'agent-key-of-the-person',
    })
    expect(clubIdentity(req)).toBe('900000062')
  })
})

describe("the bot's exact request through handleClub, with the server's identity", () => {
  let savedKey: string | undefined
  beforeEach(() => {
    savedKey = process.env.RENDER_API_KEY
    process.env.RENDER_API_KEY = SERVER_KEY
  })
  afterEach(() => {
    if (savedKey === undefined) delete process.env.RENDER_API_KEY
    else process.env.RENDER_API_KEY = savedKey
  })

  const served = (
    pool: ReturnType<typeof strictPool>,
    fetchImpl: typeof fetch
  ) => ({
    getPool: async () => pool,
    // What render-server.ts passes -- the function itself, not a copy of it.
    identity: (r: { url?: string; method?: string }) =>
      clubIdentity(r as IncomingMessage),
    botToken: 'cashier-token',
    credit: async () => ({ credited: true }),
    fetchImpl,
  })

  it('Join mints an invoice for the person the bot named', async () => {
    const pool = strictPool()
    const c = cashier()
    const out = await handleClub(
      fromTheBot('invoice', '900000061'),
      served(pool, c.fetchImpl)
    )
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ ok: true, stars: 10_000 })
    expect(c.minted.map(m => m.payload)).toEqual(['club:10000:900000061'])
  })

  it('status is about the named person, not the anonymous price', async () => {
    const out = await handleClub(
      fromTheBot('status', '900000061'),
      served(strictPool(), cashier().fetchImpl)
    )
    expect(out.status).toBe(200)
    expect(out.body.anonymous).toBeUndefined()
    expect(out.body).toMatchObject({ active: false, stars: 10_000 })
  })

  it('the same request without the key: no invoice, the anonymous price, no verify', async () => {
    const c = cashier()
    const invoice = await handleClub(
      fromTheBot('invoice', '900000061', null),
      served(strictPool(), c.fetchImpl)
    )
    expect(invoice.status).toBe(401)
    expect(c.minted).toEqual([])
    const status = await handleClub(
      fromTheBot('status', '900000061', null),
      served(strictPool(), c.fetchImpl)
    )
    expect(status.body).toMatchObject({ anonymous: true, active: false })
    const verify = await handleClub(
      fromTheBot('verify', '900000061', null),
      served(strictPool(), c.fetchImpl)
    )
    expect(verify.status).toBe(401)
  })
})

describe('the server wires it that way', () => {
  /*
   * render-server.ts cannot be imported by a test (it starts the server), so
   * whether it hands handleClub THIS function is only visible in its text.
   * What the function does is pinned above by running it; this only checks
   * the seam, and that no second decision about the key sits next to it.
   */
  it('hands the club routes clubIdentity and decides nothing about the key itself', () => {
    const src = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    const at = src.indexOf('if (isClubPath(')
    expect(at).toBeGreaterThan(0)
    // Code only: the comment beside the seam may explain the trap by name.
    const block = src
      .slice(at, src.indexOf('botToken:', at))
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n')
    expect(block).toMatch(/identity: r => clubIdentity\(r as any\),/)
    expect(block).not.toMatch(/authenticate\(|\.via\b|hasServerKey|clubCaller/)
  })
})
