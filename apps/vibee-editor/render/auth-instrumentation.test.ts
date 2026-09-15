import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

/**
 * THE SIGN-IN FUNNEL LEAVES EVIDENCE, AND NO SECRETS.
 *
 * Measured 2026-09-15 over 14 h of live logs: POST /api/auth/game-token minted
 * and refused with nine codes and wrote nothing but '📥 POST'; /api/auth/widget
 * wrote nothing on success, 401, 409 or 429; the journal kind 'sign-in-refused'
 * had no writer; per-bot initData counts lived only in memory and died with
 * each deploy, while the owner's decision on which bots may reach privileged
 * paths needs a week of them.
 *
 *   game-token  exactly one line per outcome:
 *               '[game-token] outcome=<code|minted> parent=<web|initdata|none> aud=<aud|none|invalid>'
 *               with no telegram_id and no token material;
 *   widget      'sign-in' (subject) and 'sign-in-refused' (reason class, no
 *               subject) in the journal and on the console;
 *   bot counts  per day, bot id and path class, written to Postgres through the
 *               revocation poll; privileged path classes counted per bot.
 */

const BOT_A = '4440021'
const BOT_B = '4440022'
const TOKEN_A = `${BOT_A}:FakeBotTokenForInstrumentationTestsA`
const TOKEN_B = `${BOT_B}:FakeBotTokenForInstrumentationTestsB`
const WIDGET_TOKEN = '4440023:FakeWidgetTokenForInstrumentationTests'
const KEY = 'instrumentation-test-signing-key-long-enough-0123456789'
const GAME = 'https://t27.ai'
const PLAYER = 'https://app.t27.ai'
/** Digits that appear nowhere else, so a leak into a log line is unambiguous. */
const ALICE = '7301001'
const OWNER = '7401001'
const KEEPER = '7401002'

const nowSeconds = () => Math.floor(Date.now() / 1000)

function signInitData(fields: Record<string, string>, token: string): string {
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest()
  const p = new URLSearchParams(fields)
  p.set(
    'hash',
    crypto.createHmac('sha256', secret).update(checkString).digest('hex')
  )
  return p.toString()
}

const launch = (id: string, token = TOKEN_A, salt = '') =>
  signInitData(
    {
      user: JSON.stringify({ id: Number(id), first_name: 'Test' }),
      auth_date: String(nowSeconds()),
      ...(salt ? { query_id: salt } : {}),
    },
    token
  )

function widgetPayload(
  id: string,
  authDate = nowSeconds(),
  token = WIDGET_TOKEN
): Record<string, string> {
  const fields = { id, first_name: 'Test', auth_date: String(authDate) }
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto.createHash('sha256').update(token).digest()
  return {
    ...fields,
    hash: crypto.createHmac('sha256', secret).update(checkString).digest('hex'),
  }
}

let source = 0
function request(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  from?: string
) {
  const r = Readable.from([
    Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  ]) as any
  r.url = url
  r.method = 'POST'
  r.headers = headers
  r.socket = {
    remoteAddress:
      from ?? `10.13.${Math.floor(++source / 250)}.${source % 250}`,
  }
  return r
}

function response() {
  const o: any = { status: 0, body: null }
  o.headersSent = false
  o.setHeader = () => undefined
  o.writeHead = (code: number) => {
    o.status = code
    o.headersSent = true
    return o
  }
  o.end = (s: string) => {
    o.body = s ? JSON.parse(s) : null
  }
  o.destroy = () => undefined
  return o
}

/**
 * A pool for the sign-in routes: session rows by id with their kind, one-time
 * widget assertions, the profile insert that must return a row, and the
 * journal. Everything else answers no rows.
 */
function routesDb(opts: { failKindLookup?: boolean } = {}) {
  const kinds = new Map<string, string>()
  const assertions = new Set<string>()
  const events: unknown[][] = []
  const client = {
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (s.startsWith('INSERT INTO hive_events')) {
        events.push(params)
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO app_sessions')) {
        kinds.set(String(params[0]), String(params[5]))
        return { rows: [] }
      }
      if (s.startsWith('SELECT kind FROM app_sessions WHERE id = $1')) {
        if (opts.failKindLookup) throw new Error('database went away')
        const kind = kinds.get(String(params[0]))
        return { rows: kind ? [{ kind }] : [] }
      }
      if (s.startsWith('INSERT INTO app_widget_assertions')) {
        const h = String(params[0])
        if (assertions.has(h)) return { rows: [] }
        assertions.add(h)
        return { rows: [{ assertion_hash: h }] }
      }
      if (s.startsWith('INSERT INTO profiles'))
        return { rows: [{ telegram_id: params[0] }] }
      return { rows: [] as any[] }
    },
    release() {},
  }
  return { kinds, events, pool: { ...client, connect: async () => client } }
}

const settle = () => new Promise(r => setTimeout(r, 15))

const ENV = [
  'TELEGRAM_BOT_TOKEN',
  'BOT_TOKEN_1',
  'BOT_TOKEN_12',
  'SESSION_SIGNING_KEY',
  'LAUNCH_BOT_IDS',
  'OWNER_TELEGRAM_ID',
  'HIVE_KEEPERS',
  'RENDER_AUTH_MODE',
] as const
const saved: Record<string, string | undefined> = {}

let lines: string[]
let session: typeof import('./session')
let routes: typeof import('./session-routes')

beforeEach(async () => {
  for (const k of ENV) saved[k] = process.env[k]
  process.env.TELEGRAM_BOT_TOKEN = TOKEN_A
  process.env.BOT_TOKEN_1 = TOKEN_B
  process.env.BOT_TOKEN_12 = WIDGET_TOKEN
  process.env.SESSION_SIGNING_KEY = KEY
  process.env.OWNER_TELEGRAM_ID = OWNER
  process.env.HIVE_KEEPERS = `${OWNER},${KEEPER}`
  process.env.RENDER_AUTH_MODE = 'enforce'
  delete process.env.LAUNCH_BOT_IDS
  lines = []
  for (const level of ['log', 'warn', 'error', 'info'] as const)
    vi.spyOn(console, level).mockImplementation((...a: unknown[]) => {
      lines.push(a.map(String).join(' '))
    })
  vi.resetModules()
  session = await import('./session')
  routes = await import('./session-routes')
  session.setRevokedSessions([])
})

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.restoreAllMocks()
})

describe('[game-token]: exactly one line per outcome, no identity, no token', () => {
  const gameLines = () => lines.filter(l => l.includes('[game-token]'))

  const bearer = (db: ReturnType<typeof routesDb>, kind: string) => {
    const sid = `s-${kind}-${++source}`
    db.kinds.set(sid, kind)
    return `Bearer ${session.signAccessToken({
      telegramId: ALICE,
      sessionId: sid,
      deviceKeyThumbprint: '',
    })}`
  }

  async function ask(
    db: ReturnType<typeof routesDb>,
    headers: Record<string, string>,
    body: unknown = { aud: GAME }
  ) {
    const res = response()
    await routes.handleAuthRouteSafely(
      request('/api/auth/game-token', headers, body),
      res,
      () => db.pool as any
    )
    return res
  }

  it('names the outcome, the parent class and the audience for every code and for a mint', async () => {
    const seen = new Set<string>()
    const cases: Array<{
      code: string
      parent: string
      aud: string
      status: number
      run: (db: ReturnType<typeof routesDb>) => Promise<any>
    }> = [
      {
        code: 'game_token_origin_refused',
        parent: 'web',
        aud: 'none',
        status: 403,
        run: db => ask(db, { authorization: bearer(db, 'web') }),
      },
      {
        code: 'game_token_bad_request',
        parent: 'web',
        aud: 'none',
        status: 400,
        run: db =>
          ask(db, { origin: PLAYER, authorization: bearer(db, 'web') }, 'no'),
      },
      {
        code: 'game_token_audience_refused',
        parent: 'web',
        aud: 'invalid',
        status: 400,
        run: db =>
          ask(
            db,
            { origin: PLAYER, authorization: bearer(db, 'web') },
            { aud: 'https://evil.example/\n[game-token] outcome=minted' }
          ),
      },
      {
        code: 'game_token_credential_required',
        parent: 'none',
        aud: GAME,
        status: 401,
        run: db => ask(db, { origin: PLAYER }),
      },
      {
        code: 'game_token_credential_rejected',
        parent: 'web',
        aud: GAME,
        status: 401,
        run: db => ask(db, { origin: PLAYER, authorization: 'Bearer x.y.z' }),
      },
      {
        code: 'game_token_parent_not_web',
        parent: 'web',
        aud: GAME,
        status: 403,
        run: db =>
          ask(db, { origin: PLAYER, authorization: bearer(db, 'launch') }),
      },
      {
        code: 'game_token_launch_bots_unset',
        parent: 'initdata',
        aud: GAME,
        status: 403,
        run: db =>
          ask(db, { origin: PLAYER, 'x-telegram-init-data': launch(ALICE) }),
      },
      {
        code: 'game_token_bot_not_allowed',
        parent: 'initdata',
        aud: GAME,
        status: 403,
        run: async db => {
          process.env.LAUNCH_BOT_IDS = BOT_B
          try {
            return await ask(db, {
              origin: PLAYER,
              'x-telegram-init-data': launch(ALICE, TOKEN_A),
            })
          } finally {
            delete process.env.LAUNCH_BOT_IDS
          }
        },
      },
      {
        code: 'minted',
        parent: 'web',
        aud: GAME,
        status: 200,
        run: db =>
          ask(db, { origin: PLAYER, authorization: bearer(db, 'web') }),
      },
      {
        code: 'minted',
        parent: 'initdata',
        aud: GAME,
        status: 200,
        run: async db => {
          process.env.LAUNCH_BOT_IDS = BOT_A
          try {
            return await ask(db, {
              origin: PLAYER,
              'x-telegram-init-data': launch(ALICE, TOKEN_A),
            })
          } finally {
            delete process.env.LAUNCH_BOT_IDS
          }
        },
      },
      {
        code: 'error',
        parent: 'web',
        aud: GAME,
        status: 503,
        run: async () => {
          const broken = routesDb({ failKindLookup: true })
          return ask(broken, {
            origin: PLAYER,
            authorization: bearer(broken, 'web'),
          })
        },
      },
    ]

    for (const c of cases) {
      lines.length = 0
      const db = routesDb()
      const res = await c.run(db)
      const where = `${c.code} parent=${c.parent}`
      expect(res.status, `${where} ${JSON.stringify(res.body)}`).toBe(c.status)
      if (c.code !== 'minted' && c.code !== 'error')
        expect(res.body.error, where).toBe(c.code)
      expect(gameLines(), where).toEqual([
        `[game-token] outcome=${c.code} parent=${c.parent} aud=${c.aud}`,
      ])
      const all = lines.join('\n')
      expect(all, `${where}: telegram_id in a log line`).not.toContain(ALICE)
      if (res.body?.game_token)
        expect(all, `${where}: token in a log line`).not.toContain(
          String(res.body.game_token).split('.')[2]
        )
      seen.add(c.code)
    }

    /*
     * Every refusal code the route can send is covered above: a new code added
     * to the route without a line fails here by name.
     */
    const src = fs
      .readFileSync(path.join(__dirname, 'session-routes.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const codes = new Set(
      src.match(/'game_token_[a-z_]+'/g)!.map(q => q.slice(1, -1))
    )
    codes.delete('game_token_rate_limited') // its own test below
    expect([...codes].sort()).toEqual(
      [...seen].filter(c => c.startsWith('game_token_')).sort()
    )
  })

  it('a rate-limited mint is one line too, after ten minted ones', async () => {
    const db = routesDb()
    const auth = bearer(db, 'web')
    for (let i = 0; i < 11; i++)
      await ask(db, { origin: PLAYER, authorization: auth })
    expect(gameLines()).toEqual([
      ...Array(10).fill(`[game-token] outcome=minted parent=web aud=${GAME}`),
      `[game-token] outcome=game_token_rate_limited parent=web aud=${GAME}`,
    ])
    expect(lines.join('\n')).not.toContain(ALICE)
  })
})

describe('/api/auth/widget writes sign-in and sign-in-refused', () => {
  const widgetLines = () => lines.filter(l => l.includes('[widget]'))

  /**
   * `from` is the client as the proxy names it: the entry throttle keys its
   * per-client limit on X-Forwarded-For (src/entry-throttle.ts), so a request
   * without it meets only the wide channel ceiling.
   */
  async function widget(
    db: ReturnType<typeof routesDb>,
    body: unknown,
    from?: string
  ) {
    const res = response()
    await routes.handleAuthRoute(
      request(
        '/api/auth/widget',
        from ? { 'x-forwarded-for': from } : {},
        body,
        from
      ),
      res,
      () => db.pool as any
    )
    await settle()
    return res
  }

  /** Journal rows as [kind, who, what, severity]. */
  const journal = (db: ReturnType<typeof routesDb>) =>
    db.events.map(e => [e[0], e[1], e[4], e[5]])

  it('a sign-in records its subject; the console line names no one', async () => {
    const db = routesDb()
    const res = await widget(db, {
      ...widgetPayload(ALICE),
      device_name: 'Laptop',
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(journal(db)).toEqual([
      ['sign-in', ALICE, 'widget; Laptop', 'normal'],
    ])
    expect(widgetLines()).toEqual(['[widget] outcome=sign-in'])
    expect(widgetLines().join('\n')).not.toContain(ALICE)
  })

  it('each refusal records its reason class with no subject', async () => {
    const cases: Array<[string, unknown, number]> = [
      ['signature', { ...widgetPayload(ALICE), hash: 'a'.repeat(64) }, 401],
      ['expired', widgetPayload(ALICE, nowSeconds() - 2 * 86_400), 401],
      ['malformed', 'not json', 400],
      ['malformed', { ...widgetPayload(ALICE), id: 'nope' }, 401],
    ]
    for (const [reason, body, status] of cases) {
      lines.length = 0
      const db = routesDb()
      const res = await widget(db, body)
      expect(res.status, `${reason} ${JSON.stringify(res.body)}`).toBe(status)
      expect(journal(db), reason).toEqual([
        [
          'sign-in-refused',
          null,
          `widget: ${reason}`,
          reason === 'signature' ? 'attention' : 'normal',
        ],
      ])
      expect(widgetLines(), reason).toEqual([
        `[widget] outcome=refused reason=${reason}`,
      ])
    }

    // A replayed assertion: the first use signs in, the second is refused.
    lines.length = 0
    const db = routesDb()
    const payload = widgetPayload(ALICE)
    expect((await widget(db, payload)).status).toBe(200)
    expect((await widget(db, payload)).status).toBe(409)
    expect(journal(db)).toEqual([
      ['sign-in', ALICE, 'widget; без имени', 'normal'],
      ['sign-in-refused', null, 'widget: replay', 'normal'],
    ])
  })

  it('rate refusals reach the journal at most once a minute', async () => {
    const db = routesDb()
    const from = '10.99.0.1'
    const forged = { ...widgetPayload(ALICE), hash: 'b'.repeat(64) }
    const statuses: number[] = []
    for (let i = 0; i < 13; i++)
      statuses.push((await widget(db, forged, from)).status)
    expect(statuses.filter(s => s === 429)).toHaveLength(3)
    const rate = journal(db).filter(r => r[2] === 'widget: rate')
    expect(rate).toEqual([['sign-in-refused', null, 'widget: rate', 'normal']])
    expect(widgetLines().filter(l => l.includes('reason=rate'))).toHaveLength(1)
  })
})

describe('per-bot initData counts are persisted daily', () => {
  const day = () => new Date(Date.now()).toISOString().slice(0, 10)

  /** app_initdata_bot_daily with its upsert; the poll's other reads return nothing. */
  function countsDb(opts: { failWrites?: number } = {}) {
    const table = new Map<string, number>()
    let failures = opts.failWrites ?? 0
    let writes = 0
    const pool = {
      async query(sql: string, params: unknown[] = []) {
        const s = sql.replace(/\s+/g, ' ').trim()
        if (s.startsWith('INSERT INTO app_initdata_bot_daily')) {
          if (failures > 0) {
            failures -= 1
            throw new Error('write failed')
          }
          expect(s).toContain('ON CONFLICT (day, bot_id, path) DO UPDATE')
          writes += 1
          const [days, bots, paths, ns] = params as [
            string[],
            string[],
            string[],
            number[],
          ]
          days.forEach((d, i) => {
            const k = `${d}|${bots[i]}|${paths[i]}`
            table.set(k, (table.get(k) ?? 0) + Number(ns[i]))
          })
          return { rows: [] }
        }
        return { rows: [] as any[] }
      },
    }
    return { table, pool, writes: () => writes }
  }

  it('the revocation poll writes them, digits only, and a new process keeps what was written', async () => {
    const counts = await import('./src/auth/initdata-bot-counts')
    const store = await import('./session-store')
    counts.countInitDataBot(BOT_A)
    counts.countInitDataBot(BOT_A)
    counts.countInitDataBot(BOT_B, 'pair_start')
    counts.countInitDataBot(`4440024SecretPartWithoutColon`, 'owner_tool')

    const db = countsDb()
    await store.pollRevocations(db.pool)
    expect(Object.fromEntries(db.table)).toEqual({
      [`${day()}|${BOT_A}|request`]: 2,
      [`${day()}|${BOT_B}|pair_start`]: 1,
      [`${day()}|unknown|owner_tool`]: 1,
    })

    // Nothing new, nothing written.
    await store.pollRevocations(db.pool)
    expect(db.writes()).toBe(1)

    // A restart empties memory; the rows stay where the owner reads them.
    vi.resetModules()
    const fresh = await import('./src/auth/initdata-bot-counts')
    expect(fresh.takeInitDataBotCounts()).toEqual([])
    expect(db.table.size).toBe(3)
  })

  it('a failed write neither fails the poll nor loses the counts, and writes wait a minute', async () => {
    const counts = await import('./src/auth/initdata-bot-counts')
    const store = await import('./session-store')
    let clock = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    counts.countInitDataBot(BOT_A, 'auth_telegram')

    const db = countsDb({ failWrites: 1 })
    await expect(store.pollRevocations(db.pool)).resolves.toBe(0)
    // The poll still synced: an access token verifies.
    const t = session.signAccessToken({
      telegramId: ALICE,
      sessionId: 's-after-failed-write',
      deviceKeyThumbprint: '',
    })
    expect(() => session.verifyAppSession(t)).not.toThrow()

    counts.countInitDataBot(BOT_A, 'auth_telegram')
    clock += 5_000
    await store.pollRevocations(db.pool)
    expect(db.writes(), 'wrote again within a minute').toBe(0)

    clock += 60_000
    await store.pollRevocations(db.pool)
    expect(Object.fromEntries(db.table)).toEqual({
      [`${day()}|${BOT_A}|auth_telegram`]: 2,
    })
  })
})

describe('privileged path classes are counted per bot', () => {
  const privileged = async () => {
    const counts = await import('./src/auth/initdata-bot-counts')
    return counts
      .takeInitDataBotCounts()
      .filter(r => r.path !== 'request')
      .map(r => `${r.bot}:${r.path}:${r.n}`)
      .sort()
  }

  it('/api/auth/telegram and pair/start count the bot that signed', async () => {
    const db = routesDb()
    const res = response()
    await routes.handleAuthRoute(
      request(
        '/api/auth/telegram',
        {},
        { init_data: launch(ALICE, TOKEN_B, 'x') }
      ),
      res,
      () => db.pool as any
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const code = response()
    await routes.handleAuthRoute(
      request(
        '/api/auth/pair/start',
        {
          'x-telegram-init-data': launch(ALICE, TOKEN_A, 'y'),
        },
        {}
      ),
      code,
      () => db.pool as any
    )
    expect(code.status, JSON.stringify(code.body)).toBe(200)
    expect(await privileged()).toEqual([
      `${BOT_A}:pair_start:1`,
      `${BOT_B}:auth_telegram:1`,
    ])
  })

  it('/mcp counts tg_* and owner or keeper tool calls made with initData, and nothing for other credentials', async () => {
    const agent = await import('./src/agent/routes')
    const tools = await import('./src/agent/tools')
    for (const name of ['tg_dialogs', 'whoami'])
      vi.spyOn(tools.TOOLS_BY_NAME.get(name)!, 'handler').mockResolvedValue({})
    const call = async (headers: Record<string, string>, name: string) => {
      const res = response()
      await agent.handleMcp(
        request('/mcp', headers, {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name },
        }),
        res,
        () => routesDb().pool
      )
      expect(res.body?.error, JSON.stringify(res.body)).toBeUndefined()
    }

    await call({ 'x-telegram-init-data': launch(OWNER, TOKEN_A) }, 'tg_dialogs')
    await call({ 'x-telegram-init-data': launch(KEEPER, TOKEN_B) }, 'whoami')
    await call({ 'x-telegram-init-data': launch(ALICE, TOKEN_B) }, 'tg_dialogs')
    await call({ 'x-telegram-init-data': launch(ALICE, TOKEN_A) }, 'whoami')
    expect(await privileged()).toEqual([
      `${BOT_A}:owner_tool:1`,
      `${BOT_A}:tg_tool:1`,
      `${BOT_B}:keeper_tool:1`,
      `${BOT_B}:tg_tool:1`,
    ])

    // The same calls with an app session count nothing.
    const app = session.signAccessToken({
      telegramId: OWNER,
      sessionId: 's-owner-app',
      deviceKeyThumbprint: '',
    })
    await call({ authorization: `Bearer ${app}` }, 'tg_dialogs')
    expect(await privileged()).toEqual([])
  })

  it('initDataBotOf names the bot only when that initData proved this very person, digits only', async () => {
    const auth = await import('./auth')
    const req = (initData: string) =>
      ({ headers: { 'x-telegram-init-data': initData } }) as any
    expect(auth.initDataBotOf(req(launch(ALICE, TOKEN_B)), ALICE)).toBe(BOT_B)
    // Another identity won on this request: the initData proved nobody here.
    expect(auth.initDataBotOf(req(launch(ALICE, TOKEN_B)), OWNER)).toBeNull()
    expect(
      auth.initDataBotOf(req(launch(ALICE, `${BOT_A}:NotTheConfigured`)), ALICE)
    ).toBeNull()
    expect(auth.initDataBotOf({ headers: {} } as any, ALICE)).toBeNull()

    // A token stored without its colon: its "id" is the whole secret.
    const colonless = '4440025ColonlessSecretPartNeverInAContext'
    const before = process.env.BOT_TOKEN_2
    process.env.BOT_TOKEN_2 = colonless
    try {
      expect(auth.initDataBotOf(req(launch(ALICE, colonless)), ALICE)).toBe(
        'unknown'
      )
    } finally {
      if (before === undefined) delete process.env.BOT_TOKEN_2
      else process.env.BOT_TOKEN_2 = before
    }
  })

  it('the agent chat and proposal confirm count through the same helpers', () => {
    const read = (p: string) =>
      fs
        .readFileSync(path.join(__dirname, p), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
    const chat = read('src/agent/chat.ts')
    const count = chat.indexOf('countInitDataToolCall(ctx, имя)')
    expect(count, 'chat.ts does not count tool calls').toBeGreaterThan(-1)
    expect(count).toBeLessThan(chat.indexOf('await tool.handler(', count))

    const agent = read('src/agent/routes.ts')
    const chatRoute = agent.slice(
      agent.indexOf('export async function handleAgentChat(')
    )
    expect(chatRoute.slice(0, chatRoute.indexOf('runAgent(') + 400)).toMatch(
      /initDataBot: initDataBotOf\(req, telegramId\)/
    )

    const server = read('render-server.ts')
    const confirm = server.slice(
      server.indexOf("route === '/api/tg/proposal/confirm'"),
      server.indexOf("route === '/api/tg/proposal/cancel'")
    )
    expect(confirm).toMatch(
      /const bot = initDataBotOf\(req, who\)\s*if \(bot\) countInitDataBot\(bot, 'proposal_confirm'\)/
    )
  })
})
