import { describe, expect, it } from 'vitest'
import {
  buildRequest,
  executeTool,
  fetchOperations,
  pathParamToArg,
  readConfig,
  toolsFromOperations,
  type Fetcher,
  type Operation,
} from '../../inngest_app/mcp-rest-proxy'

/**
 * The self-hosted Inngest `/mcp` cannot authenticate its own REST v2 calls
 * (no Authorization forwarding upstream), so this proxy does it. These tests
 * pin the request shape to what upstream `apiv2mcp.Request` produces and the
 * fail-closed behaviour without a signing key.
 */

const catalog: Operation[] = [
  {
    id: 'GetApps',
    summary: 'List apps',
    http: { method: 'GET', path: '/apps' },
    mcp: {
      name: 'get_apps',
      inputSchema: {
        type: 'object',
        properties: {
          archived: { type: 'boolean' },
          limit: { type: 'integer' },
        },
        required: [],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
  },
  {
    id: 'GetFunctionRun',
    http: { method: 'GET', path: '/runs/{run_id}' },
    mcp: {
      name: 'get_run',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string' },
          includeOutput: { type: 'boolean' },
        },
        required: ['runId'],
      },
    },
  },
  {
    id: 'InvokeFunction',
    http: {
      method: 'POST',
      path: '/apps/{app_id}/functions/{function_id}/invoke',
    },
    mcp: {
      name: 'invoke_function',
      inputSchema: {
        type: 'object',
        properties: { appId: {}, functionId: {}, data: {}, idempotencyKey: {} },
        required: ['appId', 'functionId'],
      },
    },
  },
  { id: 'NoHttp', mcp: { name: 'ghost' } },
]

const BASE = 'https://inngest.example'

function fakeFetch(
  handler: (
    url: string,
    init?: Parameters<Fetcher>[1]
  ) => { status: number; body: string }
): Fetcher & { calls: Array<{ url: string; init?: Parameters<Fetcher>[1] }> } {
  const calls: Array<{ url: string; init?: Parameters<Fetcher>[1] }> = []
  const f = (async (url: string, init?: Parameters<Fetcher>[1]) => {
    calls.push({ url, init })
    const r = handler(url, init)
    return { status: r.status, text: async () => r.body }
  }) as Fetcher & { calls: typeof calls }
  f.calls = calls
  return f
}

describe('mcp-rest-proxy: catalog → tools', () => {
  it('keeps only operations with both http and mcp blocks', () => {
    const tools = toolsFromOperations(catalog)
    expect(tools.map(t => t.name)).toEqual([
      'get_apps',
      'get_run',
      'invoke_function',
    ])
    expect(tools[0].annotations).toEqual({ readOnlyHint: true })
    expect(tools[1].description).toBe('get_run')
  })

  it('reads the catalog from /api/v2/operations without a key', async () => {
    const fetcher = fakeFetch(() => ({
      status: 200,
      body: JSON.stringify({ data: { operations: catalog } }),
    }))
    const ops = await fetchOperations(BASE + '/', fetcher)
    expect(ops).toHaveLength(4)
    expect(fetcher.calls[0].url).toBe(`${BASE}/api/v2/operations`)
    expect(fetcher.calls[0].init?.headers).not.toHaveProperty('authorization')
  })
})

describe('mcp-rest-proxy: request shape mirrors upstream apiv2mcp.Request', () => {
  const tools = toolsFromOperations(catalog)
  const byName = Object.fromEntries(tools.map(t => [t.name, t]))

  it('snake_case path params come from camelCase args', () => {
    expect(pathParamToArg('run_id')).toBe('runId')
    expect(pathParamToArg('function_id')).toBe('functionId')
    const r = buildRequest(BASE, byName.get_run, {
      runId: 'r/1',
      includeOutput: true,
    })
    expect(r).toEqual({
      url: `${BASE}/api/v2/runs/r%2F1?includeOutput=true`,
      method: 'GET',
    })
  })

  it('a missing path param is named, not sent as a literal brace', () => {
    expect(() => buildRequest(BASE, byName.get_run, {})).toThrow(
      'runId is required'
    )
  })

  it('GET leftovers become the query string; POST leftovers become the JSON body', () => {
    const g = buildRequest(BASE, byName.get_apps, { archived: false, limit: 5 })
    expect(g.url).toBe(`${BASE}/api/v2/apps?archived=false&limit=5`)
    expect(g.body).toBeUndefined()

    const p = buildRequest(BASE, byName.invoke_function, {
      appId: 'telegram-bot-client',
      functionId: 'crm-proactive-sweep',
      data: { e2e_test: true },
    })
    expect(p.url).toBe(
      `${BASE}/api/v2/apps/telegram-bot-client/functions/crm-proactive-sweep/invoke`
    )
    expect(p.method).toBe('POST')
    expect(JSON.parse(p.body ?? '{}')).toEqual({ data: { e2e_test: true } })
  })
})

describe('mcp-rest-proxy: execution carries the signing key', () => {
  const tools = toolsFromOperations(catalog)
  const getApps = tools.find(t => t.name === 'get_apps')!

  it('sends Authorization: Bearer <signing key> and returns the body', async () => {
    const fetcher = fakeFetch((_u, init) =>
      init?.headers?.authorization === 'Bearer signkey-test-abc'
        ? { status: 200, body: '{"data":[{"id":"telegram-bot-client"}]}' }
        : { status: 401, body: 'Authentication failed' }
    )
    const ok = await executeTool(BASE, 'signkey-test-abc', getApps, {}, fetcher)
    expect(ok.status).toBe(200)
    expect(JSON.parse(ok.text).data[0].id).toBe('telegram-bot-client')

    const bad = await executeTool(BASE, 'wrong', getApps, {}, fetcher)
    expect(bad.status).toBe(401)
  })

  it('content-type is set only when there is a body', async () => {
    const fetcher = fakeFetch(() => ({ status: 200, body: '{}' }))
    await executeTool(BASE, 'k', getApps, {}, fetcher)
    expect(fetcher.calls[0].init?.headers).not.toHaveProperty('content-type')
    const invoke = tools.find(t => t.name === 'invoke_function')!
    await executeTool(
      BASE,
      'k',
      invoke,
      { appId: 'a', functionId: 'f', data: {} },
      fetcher
    )
    expect(fetcher.calls[1].init?.headers?.['content-type']).toBe(
      'application/json'
    )
  })
})

describe('mcp-rest-proxy: fail-closed config', () => {
  it('refuses to start without INNGEST_SIGNING_KEY', () => {
    expect(() => readConfig({})).toThrow(/INNGEST_SIGNING_KEY is not set/)
    expect(() => readConfig({ INNGEST_SIGNING_KEY: '   ' })).toThrow(/not set/)
  })

  it('defaults the base URL to the Railway Inngest service and trims overrides', () => {
    expect(readConfig({ INNGEST_SIGNING_KEY: 'k' }).baseUrl).toMatch(
      /^https:\/\/inngestinngest-production-c468\.up\.railway\.app$/
    )
    expect(
      readConfig({
        INNGEST_SIGNING_KEY: 'k',
        INNGEST_BASE_URL: ' http://127.0.0.1:8288 ',
      }).baseUrl
    ).toBe('http://127.0.0.1:8288')
  })
})
