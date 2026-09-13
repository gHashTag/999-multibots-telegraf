/**
 * Read-only functions status: GraphQL client query shapes, run summary,
 * payload shape, 30 s cache, and the public endpoint handler (CORS + 503).
 * All network is mocked — nothing here talks to Inngest.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  InngestGraphqlClient,
  InngestGraphqlError,
  GQL_APPS_QUERY,
  GQL_RUNS_QUERY,
  RUNS_PAGE_SIZE,
  GQL_RUN_QUERY,
  resolveInngestGqlUrl,
  type InngestApp,
  type InngestRunNode,
} from '@/inngest_app/status/inngestGraphql'
import {
  buildFunctionsStatus,
  summarizeRuns,
  fetchFunctionsStatus,
  fetchFunctionsStatusSafe,
  clearFunctionsStatusCache,
  renderRunsSummaryText,
  probeAsExpected,
  probeExpectOf,
  STATUS_CACHE_TTL_MS,
} from '@/inngest_app/status/functionsStatus'
import { getRegisteredManifestFunctions } from '@/inngest_app/manifest'
import {
  handleFunctionsStatus,
  handleFunctionsStatusOptions,
  isAllowedOrigin,
  INNGEST_STATUS_PATH,
} from '@/api_server/routes/inngest-status.routes'

const NOW = new Date('2026-09-09T12:00:00Z')
const H = 60 * 60 * 1000

function app(overrides: Partial<InngestApp> = {}): InngestApp {
  return {
    id: 'app-uuid',
    name: 'telegram-bot-client',
    url: 'https://example.railway.app/api/inngest',
    connected: true,
    sdkVersion: 'js:v3.54.2',
    functions: [
      {
        id: 'fn-render',
        slug: 'telegram-bot-client-render-job-run',
        name: 'Render Workflow',
        triggers: [{ type: 'EVENT', value: 'render/job.run' }],
      },
      {
        id: 'fn-render-failure',
        slug: 'telegram-bot-client-render-job-run-failure',
        name: 'Render Workflow (failure)',
        triggers: [{ type: 'EVENT', value: 'inngest/function.failed' }],
      },
      {
        id: 'fn-unknown',
        slug: 'telegram-bot-client-something-not-in-manifest',
        name: 'Ghost',
        triggers: [],
      },
    ],
    ...overrides,
  }
}

function run(
  p: Partial<InngestRunNode> & { hoursAgo: number }
): InngestRunNode {
  const t = new Date(NOW.getTime() - p.hoursAgo * H).toISOString()
  return {
    id: p.id ?? `run-${p.hoursAgo}`,
    status: p.status ?? 'COMPLETED',
    queuedAt: p.queuedAt ?? t,
    endedAt: p.endedAt === undefined ? t : p.endedAt,
    eventName: p.eventName ?? 'render/job.run',
    function: p.function ?? { slug: 'telegram-bot-client-render-job-run' },
  }
}

function gqlFetch(handlers: {
  apps?: () => unknown
  runs?: (vars: any) => unknown
  /** Full connection shape, for the pagination test. */
  runsPage?: (vars: any) => {
    edges: Array<{ node: InngestRunNode }>
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
  run?: (vars: any) => unknown
  status?: number
}) {
  const calls: Array<{ query: string; variables: any; headers: any }> = []
  const fetchImpl = vi.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body)
    calls.push({
      query: body.query,
      variables: body.variables,
      headers: init.headers,
    })
    let data: unknown
    if (body.query.includes('apps')) data = { apps: handlers.apps?.() ?? [] }
    else if (body.query.includes('run(runID'))
      data = { run: handlers.run?.(body.variables) }
    else if (handlers.runsPage)
      data = { runs: handlers.runsPage(body.variables) }
    else
      data = {
        runs: {
          edges: ((handlers.runs?.(body.variables) as any[]) ?? []).map(n => ({
            node: n,
          })),
        },
      }
    const status = handlers.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () =>
        JSON.stringify(status < 300 ? { data } : { error: 'nope' }),
    }
  })
  return { fetchImpl: fetchImpl as any, calls }
}

beforeEach(() => {
  clearFunctionsStatusCache()
})

describe('resolveInngestGqlUrl', () => {
  it('INNGEST_GQL_URL wins; otherwise ${INNGEST_BASE_URL}/v0/gql', () => {
    expect(
      resolveInngestGqlUrl({ INNGEST_GQL_URL: 'http://x/v0/gql' } as any)
    ).toBe('http://x/v0/gql')
    expect(
      resolveInngestGqlUrl({
        INNGEST_BASE_URL: 'http://inngest.railway.internal:8288/',
      } as any)
    ).toBe('http://inngest.railway.internal:8288/v0/gql')
    expect(resolveInngestGqlUrl({} as any)).toBe('http://127.0.0.1:8288/v0/gql')
  })
})

describe('InngestGraphqlClient', () => {
  it('uses the agreed query shapes (read-only: no mutation keyword)', () => {
    expect(GQL_RUNS_QUERY).toContain(
      'orderBy: [{ field: QUEUED_AT, direction: DESC }]'
    )
    expect(GQL_RUNS_QUERY).toContain(
      'filter: { from: $from, functionIDs: $functionIDs }'
    )
    expect(GQL_RUNS_QUERY).toContain('pageInfo { hasNextPage endCursor }')
    expect(GQL_RUNS_QUERY).toContain(
      'edges { node { id status queuedAt endedAt eventName function { slug } } }'
    )
    expect(GQL_APPS_QUERY).toContain(
      'apps { id name url connected sdkVersion functions { id slug name triggers { type value } } }'
    )
    expect(GQL_RUN_QUERY).toContain('run(runID: $runID) { id status output }')
    for (const q of [GQL_RUNS_QUERY, GQL_APPS_QUERY, GQL_RUN_QUERY]) {
      expect(q).not.toMatch(/mutation/i)
    }
  })

  it('posts JSON, passes variables and the optional bearer token', async () => {
    const { fetchImpl, calls } = gqlFetch({ apps: () => [app()] })
    const c = new InngestGraphqlClient({
      url: 'http://gql',
      fetchImpl,
      authToken: 'sk',
    })
    const apps = await c.apps()
    expect(apps[0].name).toBe('telegram-bot-client')
    expect(calls[0].headers.Authorization).toBe('Bearer sk')
    await c.runs({ from: NOW, functionIDs: ['fn-render'], first: 10 })
    expect(calls[1].variables).toEqual({
      first: 10,
      from: NOW.toISOString(),
      functionIDs: ['fn-render'],
    })
  })

  it('walks every page of runs; a page never asks for more than RUNS_PAGE_SIZE', async () => {
    /*
     * Production 2026-09-10: `first: 500` was silently answered with the
     * default 40 rows (the server honours up to ~300), so "24 h" was really
     * "the newest 40 runs" -- 40 seen of 208. Pages of 200, cursor-chained.
     */
    const total = 450
    const { fetchImpl, calls } = gqlFetch({
      runsPage: vars => {
        const start = vars.after ? Number(vars.after) : 0
        const end = Math.min(total, start + vars.first)
        return {
          edges: Array.from({ length: end - start }, (_, i) => ({
            node: run({ id: `r${start + i}`, hoursAgo: 1 }),
          })),
          pageInfo: {
            hasNextPage: end < total,
            endCursor: end < total ? String(end) : null,
          },
        }
      },
    })
    const c = new InngestGraphqlClient({ url: 'http://gql', fetchImpl })
    const all = await c.runs({ from: NOW, functionIDs: ['fn-render'] })
    expect(all).toHaveLength(total)
    expect(new Set(all.map(r => r.id)).size).toBe(total)
    expect(calls.map(x => x.variables.first)).toEqual([
      RUNS_PAGE_SIZE,
      RUNS_PAGE_SIZE,
      RUNS_PAGE_SIZE,
    ])
    expect(calls.map(x => x.variables.after)).toEqual([undefined, '200', '400'])
    // and the total cap holds across pages
    const capped = await c.runs({ from: NOW, first: 250 })
    expect(capped).toHaveLength(250)
  })

  it('wraps HTTP failures into InngestGraphqlError with url and status', async () => {
    const { fetchImpl } = gqlFetch({ status: 502 })
    const c = new InngestGraphqlClient({ url: 'http://gql', fetchImpl })
    await expect(c.apps()).rejects.toBeInstanceOf(InngestGraphqlError)
    await expect(c.apps()).rejects.toMatchObject({
      url: 'http://gql',
      httpStatus: 502,
    })
  })
})

describe('summarizeRuns / buildFunctionsStatus', () => {
  it('an invoked run (probe suite, dashboard, MCP) is counted apart and is never a failure', () => {
    // 2026-09-09 22:11: /inngest_probe made the 24h report say "10 failed, 41.7%"
    const runs = [
      run({
        hoursAgo: 1,
        status: 'FAILED',
        id: 'probe',
        eventName: 'inngest/function.invoked.01M23S9H',
      }),
      run({
        hoursAgo: 2,
        status: 'COMPLETED',
        id: 'probe-ok',
        eventName: 'inngest/function.invoked.01M23S9K',
      }),
      run({ hoursAgo: 3, status: 'FAILED', id: 'real-fail' }),
      run({ hoursAgo: 4, status: 'COMPLETED', id: 'real-ok' }),
    ]
    const s = summarizeRuns(runs, NOW).perFunction.get(
      'telegram-bot-client-render-job-run'
    )!
    expect(s.runs24h).toEqual({
      completed: 1,
      failed: 1,
      running: 0,
      cancelled: 0,
      invoked: 2,
      total: 4,
    })
    // the newest run of any kind is the probe, but lastRun is organic traffic
    // only (specs/automation/inngest-functions-status.t27 VERSION 2): after
    // /inngest_probe the FUNCTIONS tab showed 20 red "last run FAILED" dots
    // for functions that had done nothing wrong (production read 2026-09-12)
    expect(s.lastRun?.id).toBe('real-fail')
    expect(s.lastInvoked?.id).toBe('probe')
    expect(s.lastError?.runId).toBe('real-fail')
  })

  it('a function with only probe runs has lastRun null and lastProbe judged against probe_expect', () => {
    const payload = buildFunctionsStatus({
      app: app(),
      runs: [
        run({
          hoursAgo: 1,
          status: 'FAILED',
          id: 'probe-guard',
          eventName: 'inngest/function.invoked.01M24N7B',
        }),
      ],
      appId: 'telegram-bot-client',
      gqlUrl: 'http://gql',
      now: NOW,
    })
    const render = payload.functions.find(f => f.id === 'render-job-run')!
    expect(render.lastRun).toBeNull()
    expect(render.runs24h.failed).toBe(0)
    expect(render.runs24h.invoked).toBe(1)
    expect(render.probeExpect).toBe('FAILED-at-guard')
    expect(render.lastProbe).toEqual({
      id: 'probe-guard',
      status: 'FAILED',
      queuedAt: expect.any(String),
      endedAt: expect.any(String),
      expect: 'FAILED-at-guard',
      asExpected: true,
    })
  })

  it('probeAsExpected is a status-level check and null for skip / non-terminal', () => {
    expect(probeAsExpected('FAILED-at-guard', 'FAILED')).toBe(true)
    expect(probeAsExpected('FAILED-at-guard', 'COMPLETED')).toBe(false)
    expect(probeAsExpected('COMPLETED', 'COMPLETED')).toBe(true)
    expect(probeAsExpected('COMPLETED', 'FAILED')).toBe(false)
    expect(probeAsExpected('skip', 'FAILED')).toBeNull()
    expect(probeAsExpected('FAILED-at-guard', 'RUNNING')).toBeNull()
    expect(probeExpectOf({ probe_expect: 'COMPLETED' })).toBe('COMPLETED')
    expect(probeExpectOf({ probe_expect: 'nonsense' })).toBe('skip')
    expect(probeExpectOf({})).toBe('skip')
  })

  it('splits 24h vs 7d counters and keeps newest run + last error', () => {
    const runs = [
      run({ hoursAgo: 1, status: 'RUNNING', endedAt: null, id: 'r-new' }),
      run({ hoursAgo: 2, status: 'FAILED', id: 'r-fail' }),
      run({ hoursAgo: 20, status: 'COMPLETED' }),
      run({ hoursAgo: 48, status: 'COMPLETED' }),
      run({ hoursAgo: 100, status: 'FAILED' }),
    ]
    const s = summarizeRuns(runs, NOW).perFunction.get(
      'telegram-bot-client-render-job-run'
    )!
    expect(s.runs24h).toMatchObject({
      completed: 1,
      failed: 1,
      running: 1,
      total: 3,
    })
    expect(s.runs7d).toMatchObject({
      completed: 2,
      failed: 2,
      running: 1,
      total: 5,
    })
    expect(s.lastRun?.id).toBe('r-new')
    expect(s.lastError?.runId).toBe('r-fail')
  })

  it('payload has the documented shape, filters -failure twins, flags drift', () => {
    const payload = buildFunctionsStatus({
      app: app(),
      runs: [run({ hoursAgo: 1 })],
      appId: 'telegram-bot-client',
      gqlUrl: 'http://gql',
      now: NOW,
    })
    expect(payload.generatedAt).toBe(NOW.toISOString())
    expect(payload.app).toEqual({
      name: 'telegram-bot-client',
      sdk: 'js:v3.54.2',
      url: 'https://example.railway.app/api/inngest',
      connected: true,
    })
    expect(payload.functions.length).toBe(
      getRegisteredManifestFunctions().length
    )
    const render = payload.functions.find(f => f.id === 'render-job-run')!
    expect(render).toMatchObject({
      slug: 'telegram-bot-client-render-job-run',
      deployed: true,
      triggers: [
        { type: 'event', value: 'render/job.run' },
        { type: 'event', value: 'render' },
      ],
    })
    expect(render.runs24h.completed).toBe(1)
    expect(render.lastRun?.status).toBe('COMPLETED')
    expect(render.lastError).toBeNull()
    for (const f of payload.functions) {
      expect(f).toHaveProperty('runs24h')
      expect(f).toHaveProperty('runs7d')
      expect(f).toHaveProperty('lastRun')
      expect(f).toHaveProperty('lastProbe')
      expect(f).toHaveProperty('probeExpect')
      expect(f).toHaveProperty('lastError')
    }
    // not-yet-deployed manifest functions are reported, not hidden
    expect(
      payload.functions.find(f => f.id === 'reels-ai-generate')?.deployed
    ).toBe(false)
    // `-failure` twins are not functions of their own; ghosts are drift
    expect(payload.unknownInApp).toEqual([
      'telegram-bot-client-something-not-in-manifest',
    ])
  })

  it('renderRunsSummaryText mentions app connectivity and failures', () => {
    const payload = buildFunctionsStatus({
      app: app(),
      runs: [run({ hoursAgo: 1, status: 'FAILED' })],
      appId: 'telegram-bot-client',
      gqlUrl: 'http://gql',
      now: NOW,
    })
    const text = renderRunsSummaryText(payload)
    expect(text).toContain('render-job-run')
    expect(text).toMatch(/failed/i)
  })
})

describe('fetchFunctionsStatus cache', () => {
  it('serves from cache for 30 s and refetches afterwards', async () => {
    const { fetchImpl } = gqlFetch({
      apps: () => [app()],
      runs: () => [run({ hoursAgo: 1 })],
    })
    const opts = { url: 'http://gql', fetchImpl }
    const p1 = await fetchFunctionsStatus({ ...opts, now: NOW })
    expect(p1.source.cached).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(2) // apps + runs
    const p2 = await fetchFunctionsStatus({
      ...opts,
      now: new Date(NOW.getTime() + STATUS_CACHE_TTL_MS - 1),
    })
    expect(p2.source.cached).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await fetchFunctionsStatus({
      ...opts,
      now: new Date(NOW.getTime() + STATUS_CACHE_TTL_MS + 1),
    })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('fetchFunctionsStatusSafe never throws', async () => {
    const { fetchImpl } = gqlFetch({ status: 500 })
    const r = await fetchFunctionsStatusSafe({
      url: 'http://gql',
      fetchImpl,
      now: NOW,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.gqlUrl).toBe('http://gql')
  })
})

describe('GET /api/inngest/functions/status handler', () => {
  function res() {
    const headers: Record<string, string> = {}
    const r: any = {
      headers,
      statusCode: 0,
      body: undefined as unknown,
      setHeader: (k: string, v: string) => {
        headers[k] = v
      },
      status(code: number) {
        r.statusCode = code
        return r
      },
      json(b: unknown) {
        r.body = b
        return r
      },
      end() {
        return r
      },
    }
    return r
  }

  it('path is fixed and CORS allow-list is t27.ai + localhost:*', () => {
    expect(INNGEST_STATUS_PATH).toBe('/api/inngest/functions/status')
    expect(isAllowedOrigin('https://t27.ai')).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedOrigin('http://localhost')).toBe(true)
    expect(isAllowedOrigin('https://evil.t27.ai')).toBe(false)
    expect(isAllowedOrigin('http://t27.ai')).toBe(false)
    expect(isAllowedOrigin(undefined)).toBe(false)
  })

  it('returns 503 with an error payload when Inngest is unreachable, still no throw', async () => {
    process.env.INNGEST_GQL_URL = 'http://127.0.0.1:9/v0/gql'
    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    try {
      const r = res()
      await handleFunctionsStatus({ headers: { origin: 'https://t27.ai' } }, r)
      expect(r.statusCode).toBe(503)
      expect(r.body).toMatchObject({
        error: 'inngest-unreachable',
        gqlUrl: 'http://127.0.0.1:9/v0/gql',
      })
      expect(r.headers['Access-Control-Allow-Origin']).toBe('https://t27.ai')
      expect(r.headers['Cache-Control']).toBe('public, max-age=30')
    } finally {
      ;(globalThis as any).fetch = originalFetch
      delete process.env.INNGEST_GQL_URL
    }
  })

  it('OPTIONS answers 204 and does not echo unknown origins', () => {
    const r = res()
    handleFunctionsStatusOptions(
      { headers: { origin: 'https://attacker.example' } },
      r
    )
    expect(r.statusCode).toBe(204)
    expect(r.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })
})
