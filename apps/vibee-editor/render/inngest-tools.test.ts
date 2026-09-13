import { describe, it, expect, beforeEach } from 'vitest'
import {
  makeInngestTools,
  filterCatalogue,
  isGuarded,
  listFunctions,
  type FetchLike,
  type InngestApp,
} from './src/agent/inngest-tools'

/**
 * The Inngest catalogue as agent tools. No network: a fake fetch replays the
 * shapes measured on 2026-09-13 against the self-hosted server
 * (`/v0/gql` for the public catalogue, `/api/v2/*` behind the signing key).
 */

const GQL_APPS = {
  data: {
    apps: [
      {
        id: 'b936f367',
        name: 't27-queen',
        url: 'https://trios-agent-server-production.up.railway.app/api/inngest',
        functions: [
          {
            id: 'u1',
            name: 'skill trinity/status',
            slug: 't27-queen-skill-trinity-status',
            triggers: [{ type: 'EVENT', value: 'skill/trinity/status.run' }],
          },
          {
            id: 'u2',
            name: 'cron github-actions/999-multibots-telegraf/ci',
            slug: 't27-queen-cron-github-actions-999-multibots-telegraf-ci',
            triggers: [
              { type: 'CRON', value: '0 2 * * *' },
              {
                type: 'EVENT',
                value: 'cron/github-actions/999-multibots-telegraf/ci.tick',
              },
            ],
          },
        ],
      },
      {
        id: 'c1',
        name: 'telegram-bot-client',
        functions: [
          {
            id: 'u3',
            name: 'Broadcast Message',
            slug: 'telegram-bot-client-broadcast-message',
            triggers: [{ type: 'EVENT', value: 'broadcast/message.send' }],
          },
          {
            id: 'u4',
            name: 'Broadcast Message (failure)',
            slug: 'telegram-bot-client-broadcast-message-failure',
            triggers: [{ type: 'EVENT', value: 'inngest/function.failed' }],
          },
          {
            id: 'u5',
            name: 'Render Workflow',
            slug: 'telegram-bot-client-render-workflow',
            triggers: [{ type: 'EVENT', value: 'render/job.run' }],
          },
        ],
      },
    ],
  },
}

type Call = { url: string; method: string; auth?: string; body?: string }

function fakeServer(opts: { key?: string }) {
  const calls: Call[] = []
  const fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET'
    const auth = init?.headers?.Authorization
    calls.push({ url, method, auth, body: init?.body })
    const reply = (status: number, body: unknown) => ({
      ok: status < 400,
      status,
      text: async () =>
        typeof body === 'string' ? body : JSON.stringify(body),
    })
    if (url.endsWith('/v0/gql')) return reply(200, GQL_APPS)
    if (!url.includes('/api/v2/')) return reply(404, 'no')
    if (!opts.key || auth !== `Bearer ${opts.key}`) {
      return reply(401, 'Authentication failed')
    }
    const path = url.split('/api/v2')[1]
    if (path.startsWith('/apps?')) {
      return reply(200, {
        data: [
          { id: 't27-queen', name: 't27-queen' },
          { id: 'telegram-bot-client', name: 'telegram-bot-client' },
        ],
        page: { has_more: false },
      })
    }
    if (/^\/apps\/[^/]+\/functions\/[^/]+\/runs\?/.test(path)) {
      return reply(200, { data: [{ id: 'r2', status: 'FAILED' }], page: {} })
    }
    if (/\/functions\/[^/]+\/invoke$/.test(path) && method === 'POST') {
      return reply(200, { data: { run_id: '01RUN' } })
    }
    if (path.startsWith('/apps/t27-queen/functions')) {
      // Two pages, to prove the cursor is followed.
      if (!path.includes('cursor=')) {
        return reply(200, {
          data: [
            {
              id: 'skill-trinity-status',
              name: 'skill trinity/status',
              slug: 'skill-trinity-status',
              triggers: [{ type: 'EVENT', value: 'skill/trinity/status.run' }],
            },
          ],
          page: { has_more: true, cursor: 'c2', limit: 100 },
        })
      }
      return reply(200, {
        data: [
          {
            id: 'cron-github-actions-999-multibots-telegraf-ci',
            name: 'cron github-actions/999-multibots-telegraf/ci',
            triggers: [{ type: 'CRON', value: '0 2 * * *' }],
          },
        ],
        page: { hasMore: false },
      })
    }
    if (path.startsWith('/apps/telegram-bot-client/functions')) {
      return reply(200, {
        data: [
          {
            id: 'broadcast-message',
            name: 'Broadcast Message',
            triggers: [{ type: 'EVENT', value: 'broadcast/message.send' }],
          },
          {
            id: 'render-workflow',
            name: 'Render Workflow',
            triggers: [{ type: 'EVENT', value: 'render/job.run' }],
          },
        ],
        page: { has_more: false },
      })
    }
    if (path.startsWith('/runs?')) {
      return reply(200, {
        data: [{ id: 'r1', status: 'COMPLETED' }],
        page: { has_more: false },
      })
    }
    if (path.startsWith('/runs/r1?'))
      return reply(200, { data: { id: 'r1', output: 1 } })
    if (path.startsWith('/runs/r1/trace'))
      return reply(200, { data: { steps: [] } })
    if (path.startsWith('/runs/r1/cancel')) return reply(200, { data: {} })
    return reply(404, path)
  }
  return { fetch, calls }
}

const KEEPER = '144022504'
const keeperCtx = {
  telegramId: KEEPER,
  pool: { query: async () => ({ rows: [] }) },
} as any
const strangerCtx = {
  telegramId: '555',
  pool: { query: async () => ({ rows: [] }) },
} as any

beforeEach(() => {
  process.env.HIVE_KEEPERS = KEEPER
  delete process.env.OWNER_TELEGRAM_ID
  process.env.SUPABASE_URL = ''
  process.env.SUPABASE_SERVICE_KEY = ''
})

describe('inngest tools: catalogue', () => {
  it('lists every function of both apps through REST when the key is set, following the cursor', async () => {
    const srv = fakeServer({ key: 'sk' })
    const res = await listFunctions({
      fetch: srv.fetch,
      env: { INNGEST_SIGNING_KEY: 'sk', INNGEST_BASE_URL: 'https://x.test/' },
    })
    expect(res.source).toBe('rest')
    expect(res.apps.map(a => a.functions.length)).toEqual([2, 2])
    expect(
      srv.calls.every(c => c.url.startsWith('https://x.test/api/v2'))
    ).toBe(true)
    expect(
      srv.calls.filter(c => c.url.includes('/apps/t27-queen/functions'))
    ).toHaveLength(2)
    // The key travels as a Bearer header, never in the URL.
    expect(srv.calls.every(c => !c.url.includes('sk'))).toBe(true)
  })

  it('falls back to the dev GraphQL without a key and says so; a WRONG key does not fall back', async () => {
    const srv = fakeServer({ key: 'sk' })
    const none = await listFunctions({ fetch: srv.fetch, env: {} })
    expect(none.source).toBe('gql')
    expect(none.apps.map(a => a.functions.length)).toEqual([2, 3])
    expect(
      none.apps[1].functions.find(f => f.id === 'u4')?.is_failure_handler
    ).toBe(true)

    await expect(
      listFunctions({ fetch: srv.fetch, env: { INNGEST_SIGNING_KEY: 'wrong' } })
    ).rejects.toThrow(/401/)
  })

  it('hides failure handlers by default and filters by app and substring', () => {
    const apps: InngestApp[] = [
      {
        id: 'a',
        name: 'a',
        functions: [
          {
            id: '1',
            name: 'X (failure)',
            triggers: [],
            is_failure_handler: true,
          },
          {
            id: '2',
            name: 'skill trinity/wave',
            triggers: [{ type: 'EVENT', value: 'skill/trinity/wave.run' }],
            is_failure_handler: false,
          },
          {
            id: '3',
            name: 'cron ci',
            triggers: [{ type: 'CRON', value: '0 2 * * *' }],
            is_failure_handler: false,
          },
        ],
      },
      {
        id: 'b',
        name: 'b',
        functions: [
          {
            id: '4',
            name: 'skill other',
            triggers: [],
            is_failure_handler: false,
          },
        ],
      },
    ]
    expect(
      filterCatalogue(apps, {})
        .flatMap(a => a.functions)
        .map(f => f.id)
    ).toEqual(['2', '3', '4'])
    expect(
      filterCatalogue(apps, { include_failure_handlers: true }).flatMap(
        a => a.functions
      )
    ).toHaveLength(4)
    expect(
      filterCatalogue(apps, { match: 'skill/' })
        .flatMap(a => a.functions)
        .map(f => f.id)
    ).toEqual(['2'])
    expect(filterCatalogue(apps, { app: 'b' }).map(a => a.id)).toEqual(['b'])
  })

  it('marks broadcast, payment and training functions as guarded', () => {
    expect(isGuarded({ name: 'Broadcast Message', triggers: [] })).toBe(true)
    expect(
      isGuarded({
        name: 'x',
        triggers: [{ type: 'EVENT', value: 'payment/ai-server.process' }],
      })
    ).toBe(true)
    expect(
      isGuarded({
        name: 'x',
        triggers: [{ type: 'EVENT', value: 'training/model.start' }],
      })
    ).toBe(true)
    expect(
      isGuarded({
        name: 'x',
        triggers: [{ type: 'EVENT', value: 'model/training.v2.requested' }],
      })
    ).toBe(true)
    expect(
      isGuarded({
        name: 'skill trinity/status',
        triggers: [{ type: 'EVENT', value: 'skill/trinity/status.run' }],
      })
    ).toBe(false)
    expect(
      isGuarded({
        name: 'Render Workflow',
        triggers: [{ type: 'EVENT', value: 'render/job.run' }],
      })
    ).toBe(false)
  })
})

describe('inngest tools: handlers', () => {
  const names = [
    'inngest_functions',
    'inngest_runs',
    'inngest_run',
    'inngest_invoke',
    'inngest_cancel',
  ]

  it('registers exactly five tools, each with a JSON schema', () => {
    const tools = makeInngestTools({ fetch: fakeServer({}).fetch, env: {} })
    expect(tools.map(t => t.name)).toEqual(names)
    for (const t of tools)
      expect(t.parameters).toMatchObject({ type: 'object' })
  })

  it('refuses everybody but the keeper, naming the role', async () => {
    const tools = makeInngestTools({
      fetch: fakeServer({ key: 'sk' }).fetch,
      env: { INNGEST_SIGNING_KEY: 'sk' },
    })
    for (const t of tools) {
      await expect(
        t.handler({ app: 'a', function: 'b', run_id: 'r1' }, strangerCtx)
      ).rejects.toThrow(/смотрител/) // cyrillic-ok
      await expect(
        t.handler({ app: 'a', function: 'b', run_id: 'r1' }, undefined)
      ).rejects.toThrow(/личност/) // cyrillic-ok
    }
  })

  it('inngest_functions returns the whole catalogue with guarded marks and the source', async () => {
    const srv = fakeServer({ key: 'sk' })
    const [fns] = makeInngestTools({
      fetch: srv.fetch,
      env: { INNGEST_SIGNING_KEY: 'sk' },
    })
    const out = (await fns.handler({}, keeperCtx)) as any
    expect(out.source).toBe('rest')
    expect(out.total_functions).toBe(4)
    expect(out.shown).toBe(4)
    const bc = out.apps[1].functions.find(
      (f: any) => f.id === 'broadcast-message'
    )
    expect(bc.guarded).toBe(true)
    expect(bc.triggers).toEqual(['EVENT:broadcast/message.send'])
  })

  it('inngest_runs upper-cases statuses and scopes to a function when asked', async () => {
    const srv = fakeServer({ key: 'sk' })
    const runs = makeInngestTools({
      fetch: srv.fetch,
      env: { INNGEST_SIGNING_KEY: 'sk' },
    })[1]
    const all = (await runs.handler(
      { status: 'failed, running', limit: 5 },
      keeperCtx
    )) as any
    expect(all.runs[0].id).toBe('r1')
    const q = new URL(srv.calls.at(-1)!.url).searchParams
    expect(q.getAll('status')).toEqual(['FAILED', 'RUNNING'])
    expect(q.get('limit')).toBe('5')

    const one = (await runs.handler(
      { app: 't27-queen', function: 'skill/trinity/status.run' },
      keeperCtx
    )) as any
    expect(one.runs[0].id).toBe('r2')
    expect(srv.calls.at(-1)!.url).toContain(
      '/apps/t27-queen/functions/skill-trinity-status/runs?'
    )
  })

  it('inngest_run reads the run and, on request, its trace', async () => {
    const srv = fakeServer({ key: 'sk' })
    const run = makeInngestTools({
      fetch: srv.fetch,
      env: { INNGEST_SIGNING_KEY: 'sk' },
    })[2]
    const out = (await run.handler(
      { run_id: 'r1', trace: true },
      keeperCtx
    )) as any
    expect(out.run.data.id).toBe('r1')
    expect(out.trace.data.steps).toEqual([])
  })

  it('inngest_invoke posts the data and returns the run id; guarded functions are refused without a request', async () => {
    const srv = fakeServer({ key: 'sk' })
    const invoke = makeInngestTools({
      fetch: srv.fetch,
      env: { INNGEST_SIGNING_KEY: 'sk' },
    })[3]
    const ok = (await invoke.handler(
      {
        app: 't27-queen',
        function: 'skill trinity/status',
        data: { repo: 'gHashTag/trios' },
      },
      keeperCtx
    )) as any
    expect(ok.invoked).toBe(true)
    expect(ok.run_id).toBe('01RUN')
    const post = srv.calls.at(-1)!
    expect(post.method).toBe('POST')
    expect(post.url).toMatch(
      /\/apps\/t27-queen\/functions\/skill-trinity-status\/invoke$/
    )
    expect(JSON.parse(post.body!)).toEqual({ data: { repo: 'gHashTag/trios' } })

    const before = srv.calls.length
    const no = (await invoke.handler(
      { app: 'telegram-bot-client', function: 'broadcast-message' },
      keeperCtx
    )) as any
    expect(no.invoked).toBe(false)
    expect(no.dashboard).toMatch(/\/functions$/)
    expect(srv.calls.slice(before).some(c => c.method === 'POST')).toBe(false)
  })

  it('without the key the invoke tool says what is missing instead of failing silently', async () => {
    const srv = fakeServer({ key: 'sk' })
    const invoke = makeInngestTools({ fetch: srv.fetch, env: {} })[3]
    await expect(
      invoke.handler(
        { app: 't27-queen', function: 'skill trinity/status' },
        keeperCtx
      )
    ).rejects.toThrow(/INNGEST_SIGNING_KEY/)
  })

  it('inngest_cancel posts to /cancel', async () => {
    const srv = fakeServer({ key: 'sk' })
    const cancel = makeInngestTools({
      fetch: srv.fetch,
      env: { INNGEST_SIGNING_KEY: 'sk' },
    })[4]
    const out = (await cancel.handler({ run_id: 'r1' }, keeperCtx)) as any
    expect(out.cancelled).toBe(true)
    expect(srv.calls.at(-1)).toMatchObject({ method: 'POST' })
    expect(srv.calls.at(-1)!.url).toMatch(/\/runs\/r1\/cancel$/)
  })
})
