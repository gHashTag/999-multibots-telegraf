import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { authenticate } from './auth'
import { handleMcp, handleAgentChat } from './src/agent/routes'
import { handleA2A } from './src/agent/a2a'
import { TOOLS_BY_NAME, toMcpTools } from './src/agent/tools'

const KEY = 'editorial-dispatch-test-credential'
const OWNER = '123456789'
// Independent contract, not imported from the implementation's allowlist.
const ALLOWED = [
  'whoami',
  'skills_list',
  'skills_create',
  'plan_list',
  'plan_goal_create',
  'plan_item_add',
]

function request(
  body: unknown,
  url = '/mcp',
  headers: Record<string, string> = { 'x-agent-key': KEY }
) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body))])
  return Object.assign(stream, {
    method: 'POST',
    url,
    headers,
  }) as IncomingMessage
}

function response() {
  let status = 0
  let body: any
  const res = {
    writeHead(code: number) {
      status = code
    },
    end(value: string) {
      body = JSON.parse(value)
    },
  } as unknown as ServerResponse
  return {
    res,
    get status() {
      return status
    },
    get body() {
      return body
    },
  }
}

async function rpc(
  method: string,
  params: unknown = {},
  pool: () => any = vi.fn(),
  headers?: Record<string, string>
) {
  const out = response()
  await handleMcp(
    request({ jsonrpc: '2.0', id: 7, method, params }, '/mcp', headers),
    out.res,
    pool
  )
  return out
}

/**
 * Tiny SQL interpreter, not a second implementation of the scope rules.
 * Ownership/namespace/private filters apply only if the actual SQL asks for
 * them. Unknown query shapes throw. Mutating a predicate must expose extra rows.
 */
function draftPool() {
  const tables: Record<string, Array<Record<string, any>>> = {
    user_skills: [
      {
        id: 1,
        telegram_id: OWNER,
        name: 'Leela: private',
        content: 'one',
        is_public: false,
      },
      {
        id: 2,
        telegram_id: OWNER,
        name: 'Other private',
        content: 'two',
        is_public: false,
      },
      {
        id: 3,
        telegram_id: '987654321',
        name: 'Leela: foreign',
        content: 'three',
        is_public: false,
      },
      {
        id: 4,
        telegram_id: OWNER,
        name: 'Leela: public',
        content: 'four',
        is_public: true,
      },
    ],
    content_plan_goals: [
      { id: 1, telegram_id: OWNER, title: 'Leela: approved' },
      { id: 2, telegram_id: OWNER, title: 'Other business' },
      { id: 3, telegram_id: '987654321', title: 'Leela: foreign' },
    ],
    content_plan_items: [
      {
        id: 1,
        telegram_id: OWNER,
        goal_id: 1,
        title: 'Leela: Day 01',
        status: 'idea',
      },
      {
        id: 2,
        telegram_id: OWNER,
        goal_id: 2,
        title: 'Other card',
        status: 'idea',
      },
      {
        id: 3,
        telegram_id: '987654321',
        goal_id: 3,
        title: 'Leela: foreign',
        status: 'idea',
      },
      {
        id: 4,
        telegram_id: OWNER,
        goal_id: 1,
        title: 'Other namespace in Leela goal',
        status: 'idea',
      },
    ],
  }
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    if (
      /^(CREATE TABLE IF NOT EXISTS (user_skills|content_plan_goals|content_plan_items)\b|ALTER TABLE user_skills ADD COLUMN IF NOT EXISTS is_public\b|CREATE INDEX IF NOT EXISTS content_plan_items_owner\b)/.test(
        normalized
      )
    )
      return { rows: [] }
    const select = normalized.match(
      /^SELECT .+ FROM (user_skills|content_plan_goals|content_plan_items)\b/
    )
    if (select) {
      let rows = [...tables[select[1]]]
      const where = normalized.split(' WHERE ')[1] || ''
      for (const match of where.matchAll(
        /\b(telegram_id|id|goal_id|name|title)\s*=\s*\$(\d+)/g
      )) {
        rows = rows.filter(
          row => String(row[match[1]]) === String(params[Number(match[2]) - 1])
        )
      }
      for (const match of where.matchAll(/\b(name|title) LIKE '([^']*)%'/g)) {
        rows = rows.filter(row => String(row[match[1]]).startsWith(match[2]))
      }
      if (/is_public = FALSE/.test(where))
        rows = rows.filter(row => row.is_public === false)
      const any = where.match(/goal_id = ANY\(\$(\d+)::int\[\]\)/)
      if (any)
        rows = rows.filter(row =>
          (params[Number(any[1]) - 1] as number[]).includes(row.goal_id)
        )
      if (/^SELECT count\(\*\)::int AS n/.test(normalized))
        return { rows: [{ n: rows.length }] }
      return { rows }
    }
    const insert = normalized.match(
      /^INSERT INTO (user_skills|content_plan_goals|content_plan_items) \(([^)]+)\)/
    )
    if (insert) {
      const rows = tables[insert[1]]
      const row: Record<string, any> = {
        id: Math.max(...rows.map(r => r.id)) + 1,
        status: 'idea',
        is_public: false,
      }
      insert[2].split(',').forEach((column, i) => {
        row[column.trim()] = params[i]
      })
      rows.push(row)
      return { rows: [row] }
    }
    throw new Error(`Unsupported test SQL: ${normalized}`)
  })
  return { query, tables }
}

beforeEach(() => {
  vi.stubEnv('LEELA_EDITORIAL_AGENT_KEYS', `${KEY}:${OWNER}`)
  vi.stubEnv('AGENT_KEYS', 'full-dispatch-test-credential:987654321')
  vi.stubEnv('RENDER_API_KEY', 'server-dispatch-test-credential')
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('No network in editorial tests')
    })
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('real MCP dispatcher, catalog and alternate entry points', () => {
  it.each([
    null,
    [],
    [null],
    true,
    1,
    'initialize',
    {},
    { jsonrpc: '1.0', method: 'initialize' },
    { method: 'initialize' },
    { jsonrpc: '2.0' },
    { jsonrpc: '2.0', method: null },
    { jsonrpc: '2.0', method: 1 },
    { jsonrpc: '2.0', method: '' },
    { jsonrpc: '2.0', method: ' ' },
    { jsonrpc: '2.0', method: 'initialize', params: null },
    { jsonrpc: '2.0', method: 'initialize', params: [] },
    { jsonrpc: '2.0', method: 'initialize', params: 'invalid' },
    { jsonrpc: '2.0', method: 'initialize', params: 1 },
    { jsonrpc: '2.0', method: 'initialize', id: {} },
    { jsonrpc: '2.0', method: 'initialize', id: [] },
    { jsonrpc: '2.0', method: 'initialize', id: true },
  ])(
    'rejects invalid JSON-RPC envelope %j without throwing or dispatching',
    async body => {
      for (const key of [KEY, 'full-dispatch-test-credential']) {
        const out = response()
        const pool = vi.fn()
        await expect(
          handleMcp(
            request(body, '/mcp', { 'x-agent-key': key }),
            out.res,
            pool
          )
        ).resolves.toBeUndefined()
        expect(out.status).toBe(400)
        expect(out.body).toEqual({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid JSON-RPC request' },
        })
        expect(pool).not.toHaveBeenCalled()
        expect(fetch).not.toHaveBeenCalled()
      }
    }
  )

  it.each([undefined, null, 'request-1', 0, 42])(
    'keeps valid envelopes with omitted params and id %j',
    async id => {
      const out = response()
      await handleMcp(
        request({ jsonrpc: '2.0', method: 'initialize', id }),
        out.res,
        vi.fn()
      )
      expect(out.status).toBe(200)
      expect(out.body.id).toBe(id ?? null)
      expect(out.body.result._meta).toEqual({
        'leela.editorial.scope': 'draft-only-v1',
      })
    }
  )

  it('advertises the marker only for scoped credentials and exactly six schemas', async () => {
    const init = await rpc('initialize')
    expect(init.status).toBe(200)
    expect(init.body.result._meta).toEqual({
      'leela.editorial.scope': 'draft-only-v1',
    })
    const list = await rpc('tools/list')
    expect(list.body.result.tools).toEqual(
      toMcpTools().filter(t => ALLOWED.includes(t.name))
    )
    expect(
      list.body.result.tools.map((t: { name: string }) => t.name).sort()
    ).toEqual([...ALLOWED].sort())
    const full = { 'x-agent-key': 'full-dispatch-test-credential' }
    expect(
      (await rpc('initialize', {}, vi.fn(), full)).body.result._meta
    ).toBeUndefined()
    expect(
      (await rpc('tools/list', {}, vi.fn(), full)).body.result.tools
    ).toEqual(toMcpTools())
  })

  const forbidden = [...TOOLS_BY_NAME.keys()].filter(
    name => !ALLOWED.includes(name)
  )
  it('has a nonempty forbidden registry, not a vacuous matrix', () => {
    expect(forbidden.length).toBeGreaterThan(20)
  })
  it.each([...forbidden, 'unknown_tool'])(
    'never dispatches forbidden tool %s',
    async name => {
      const tool = TOOLS_BY_NAME.get(name)
      const handler = tool ? vi.spyOn(tool, 'handler') : vi.fn()
      const pool = vi.fn()
      const out = await rpc(
        'tools/call',
        { name, arguments: { telegram_id: '987654321', scope: 'full' } },
        pool
      )
      expect(out.status).toBe(200)
      expect(out.body.error).toEqual({
        code: -32003,
        message: 'Tool forbidden by editorial scope',
      })
      expect(pool).not.toHaveBeenCalled()
      expect(handler).not.toHaveBeenCalled()
    }
  )

  it('does not grant authority from arguments and whoami discloses only bound identity', async () => {
    const pool = draftPool()
    const out = await rpc(
      'tools/call',
      {
        name: 'whoami',
        arguments: { telegram_id: '987654321', scope: 'full' },
      },
      () => pool
    )
    expect(out.body.result.structuredContent).toEqual({ telegram_id: OWNER })
    expect(pool.query).not.toHaveBeenCalled()
  })

  it.each(['/api/agent/chat', '/a2a'])(
    'denies direct %s dispatch even without the outer guard',
    async path => {
      const req = request(
        {
          method: 'message/send',
          messages: [{ role: 'user', content: 'publish' }],
        },
        path
      )
      expect(authenticate(req).allowed).toBe(false)
      const out = response()
      const pool = vi.fn()
      if (path === '/a2a') await handleA2A(req, out.res, pool)
      else await handleAgentChat(req, out.res, OWNER, pool)
      expect([401, 403]).toContain(out.status)
      expect(pool).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    }
  )

  it.each(['x-api-key', 'authorization'])(
    'rejects direct MCP alternative credential %s despite valid full key',
    async header => {
      const out = await rpc('tools/list', {}, vi.fn(), {
        'x-agent-key': 'full-dispatch-test-credential',
        [header]: KEY,
      })
      expect(out.status).toBe(403)
    }
  )
})

describe('real six-tool private draft scope', () => {
  it('lists only private Leela skills for the bound person', async () => {
    const pool = draftPool()
    const out = await rpc('tools/call', { name: 'skills_list' }, () => pool)
    expect(out.body.result.structuredContent['всего']).toBe(1)
    expect(
      out.body.result.structuredContent['скиллы'].map(
        (r: { id: number }) => r.id
      )
    ).toEqual([1])
  })

  it('lists only Leela goals and Leela items for the bound person', async () => {
    const pool = draftPool()
    const out = await rpc('tools/call', { name: 'plan_list' }, () => pool)
    const data = out.body.result.structuredContent
    expect(data['целей']).toBe(1)
    expect(data['цели'].map((r: { id: number }) => r.id)).toEqual([1])
    expect(
      data['цели'][0]['карточки'].map((r: { id: number }) => r.id)
    ).toEqual([1])
  })

  it.each([
    [
      'skills_create',
      { name: 'Leela: safety', content: 'Apply only to Leela.' },
      'user_skills',
      'создано',
    ],
    [
      'plan_goal_create',
      { title: 'Leela: September', intent: 'Private drafts' },
      'content_plan_goals',
      'создано',
    ],
    [
      'plan_item_add',
      {
        goal_id: 1,
        title: 'Leela: Day 02',
        note: 'Not approved for publication',
      },
      'content_plan_items',
      'добавлено',
    ],
  ] as const)(
    'creates bound private drafts via %s',
    async (name, args, table, flag) => {
      const pool = draftPool()
      const before = pool.tables[table].length
      const out = await rpc(
        'tools/call',
        {
          name,
          arguments: {
            ...args,
            telegram_id: '987654321',
            scope: 'full',
            status: 'done',
            is_public: true,
          },
        },
        () => pool
      )
      expect(out.body.result.structuredContent[flag]).toBe(true)
      expect(pool.tables[table]).toHaveLength(before + 1)
      const row = pool.tables[table].at(-1)!
      expect(row.telegram_id).toBe(OWNER)
      expect(row.is_public).toBe(false)
      expect(row.status).toBe('idea')
    }
  )

  it.each([
    ['skills_create', { name: 'Other project', content: 'No' }, 'создано'],
    ['plan_goal_create', { title: 'Other project' }, 'создано'],
    ['plan_item_add', { goal_id: 1, title: 'Other project' }, 'добавлено'],
  ] as const)(
    'rejects non-Leela names in %s before SQL',
    async (name, args, flag) => {
      const pool = draftPool()
      const out = await rpc('tools/call', { name, arguments: args }, () => pool)
      expect(out.body.result.structuredContent[flag]).toBe(false)
      expect(pool.query).not.toHaveBeenCalled()
    }
  )

  it.each([2, 3, 999])(
    'cannot add a card to non-Leela, foreign, or missing goal %i',
    async goal_id => {
      const pool = draftPool()
      const out = await rpc(
        'tools/call',
        {
          name: 'plan_item_add',
          arguments: { goal_id, title: 'Leela: attempted overwrite' },
        },
        () => pool
      )
      expect(out.body.result.structuredContent['добавлено']).toBe(false)
      expect(pool.tables.content_plan_items).toHaveLength(4)
    }
  )

  it('keeps full-key dispatch and non-Leela drafting unchanged', async () => {
    const pool = draftPool()
    const out = await rpc(
      'tools/call',
      { name: 'plan_goal_create', arguments: { title: 'Other project' } },
      () => pool,
      { 'x-agent-key': 'full-dispatch-test-credential' }
    )
    expect(out.body.result.structuredContent['создано']).toBe(true)
    expect(pool.tables.content_plan_goals.at(-1)?.telegram_id).toBe('987654321')
  })
})
