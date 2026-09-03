import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  executeSafeAgentTool,
  listOwnerActivity,
  redactActivityDetails,
} from './access'
import { runAgent } from './chat'
import {
  agentKeyOwner,
  chatIdentity,
  CODEX_AGENT_KEY_STATUS,
  handleMcp,
  handleMcpCard,
  resolveAgentIdentity,
} from './routes'
import {
  TOOLS,
  TOOLS_BY_NAME,
  toMcpTools,
  toOpenAITools,
  type ToolContext,
} from './tools'

const SAFE_NAMES = ['whoami', 'feed_stats', 'content_plan_prepare']
const AUTH_TOKEN = '111111:safe-beta-auth-token'

function signedInitData(owner = '42'): string {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: Number(owner), first_name: 'Owner' }),
  }
  const check = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(AUTH_TOKEN)
    .digest()
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

function signedRequest(owner = '42'): any {
  vi.stubEnv('TELEGRAM_AUTH_ENV', 'production')
  vi.stubEnv('BOT_TOKEN_12', AUTH_TOKEN)
  const req = new EventEmitter() as any
  req.url = '/mcp'
  req.headers = { 'x-telegram-init-data': signedInitData(owner) }
  return req
}

function context(query: ToolContext['pool']['query']): ToolContext {
  return { telegramId: 'owner-42', pool: { query } }
}

describe('SAFE BETA server tools', () => {
  afterEach(() => {
    delete process.env.AGENT_KEYS
    delete process.env.AGENT_SAFE_BETA
    delete process.env.AGENT_PAID_QUOTA
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('exposes the exact same safe subset to MCP and OpenAI', () => {
    expect(TOOLS.map(tool => tool.name)).toEqual(SAFE_NAMES)
    expect([...TOOLS_BY_NAME.keys()]).toEqual(SAFE_NAMES)
    expect(toMcpTools().map(tool => tool.name)).toEqual(SAFE_NAMES)
    expect(toOpenAITools().map(tool => tool.function.name)).toEqual(SAFE_NAMES)
    expect(
      toMcpTools().map(tool => ({
        name: tool.name,
        meta: tool._meta,
        annotations: tool.annotations,
      }))
    ).toEqual([
      {
        name: 'whoami',
        meta: {
          scope: 'owner',
          effect: 'read',
          requiresOwnerApproval: false,
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      {
        name: 'feed_stats',
        meta: {
          scope: 'owner',
          effect: 'read',
          requiresOwnerApproval: false,
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      {
        name: 'content_plan_prepare',
        meta: {
          scope: 'owner',
          effect: 'draft',
          requiresOwnerApproval: false,
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
    ])
  })

  it('fails closed for plaintext legacy AGENT_KEYS identities', () => {
    process.env.AGENT_KEYS = 'legacy-key:owner-42'
    const req = {
      headers: { 'x-agent-key': 'legacy-key' },
    } as any

    expect(agentKeyOwner('legacy-key')).toBeNull()
    expect(chatIdentity(req, null)).toBeNull()
    expect(resolveAgentIdentity(req, null)).toBeNull()
    expect(resolveAgentIdentity(req, 'owner-42')).toBe('owner-42')
    expect(CODEX_AGENT_KEY_STATUS).toBe('release-blocked')
  })

  it('rejects X-Agent-Key and client ownership before body or DB access', async () => {
    process.env.AGENT_KEYS = 'legacy-key:owner-42'
    const req = new EventEmitter() as any
    req.url = '/mcp'
    req.headers = { 'x-agent-key': 'legacy-key' }
    const response = { status: 0, body: '' }
    const res = {
      writeHead(code: number) {
        response.status = code
      },
      end(body = '') {
        response.body += String(body)
      },
    } as any
    const getPool = vi.fn(async () => ({ query: vi.fn() }))

    // Deliberately do not emit body/end: identity denial must resolve first.
    await handleMcp(req, res, getPool)

    expect(response.status).toBe(401)
    expect(response.body).toContain('release-blocked')
    expect(response.body).not.toContain('legacy-key')
    expect(response.body).not.toContain('owner-42')
    expect(getPool).not.toHaveBeenCalled()
  })

  it('advertises the Codex key path as blocked without issuance material', () => {
    const response = { body: '' }
    const res = {
      writeHead() {},
      end(body = '') {
        response.body += String(body)
      },
    } as any

    handleMcpCard(res)

    const card = JSON.parse(response.body)
    expect(card.codex_key_path.статус).toBe('release-blocked')
    expect(response.body).not.toContain('AGENT_KEYS')
    expect(response.body).not.toContain('curl')
    expect(response.body).not.toContain('telegramId')
  })

  it('denies a direct forbidden execution before its handler in every env', async () => {
    process.env.AGENT_SAFE_BETA = 'false'
    process.env.AGENT_PAID_QUOTA = '999'
    const handler = vi.fn(async () => ({ published: true }))
    const query = vi.fn(async () => ({ rows: [] }))

    const result = await executeSafeAgentTool(
      'feed_publish',
      { confirmed: true },
      context(query),
      () => ({
        name: 'feed_publish',
        effect: 'publish',
        scope: 'owner',
        description: 'forbidden',
        parameters: {},
        handler,
      })
    )

    expect(result).toMatchObject({ ok: false, code: 'tool_not_allowed' })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'unknown',
      name: 'missing',
      descriptor: null,
    },
    {
      label: 'paid',
      name: 'whoami',
      descriptor: {
        name: 'whoami',
        effect: 'read',
        scope: 'owner',
        paid: true,
      },
    },
    {
      label: 'publish',
      name: 'whoami',
      descriptor: { name: 'whoami', effect: 'publish', scope: 'owner' },
    },
    {
      label: 'access',
      name: 'whoami',
      descriptor: { name: 'whoami', effect: 'access', scope: 'owner' },
    },
    {
      label: 'approval',
      name: 'whoami',
      descriptor: {
        name: 'whoami',
        effect: 'read',
        scope: 'owner',
        approvalGroup: 'owners',
      },
    },
  ])(
    'denies $label before a candidate handler',
    async ({ name, descriptor }) => {
      const handler = vi.fn(async () => ({ unsafe: true }))
      const query = vi.fn(async () => ({ rows: [] }))
      const candidate = descriptor
        ? {
            ...descriptor,
            description: 'candidate',
            parameters: {},
            handler,
          }
        : null

      const result = await executeSafeAgentTool(
        name,
        { confirmed: true },
        context(query),
        () => candidate as any
      )

      expect(result.ok).toBe(false)
      expect(handler).not.toHaveBeenCalled()
    }
  )

  it('redacts key-shaped values before an owner activity row is written', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const credentialInTopic =
      'launch sk-' + 'proj-sentinelCredential1234567890 safely'

    await executeSafeAgentTool(
      'whoami',
      {
        apiKey: 'raw-key-must-' + 'not-be-logged',
        topic: credentialInTopic,
        title: 'ordinary content plan',
      },
      context(query),
      () => ({
        name: 'whoami',
        effect: 'read',
        scope: 'owner',
        description: 'safe',
        parameters: {},
        handler: async () => ({ ok: true }),
      })
    )

    const calls = query.mock.calls as unknown as [string, unknown[]][]
    const insert = calls.find(call =>
      call[0].includes('INSERT INTO agent_activity')
    )
    expect(insert?.[1][0]).toBe('owner-42')
    expect(String(insert?.[1][4])).not.toContain('raw-key-must-not-be-logged')
    expect(String(insert?.[1][4])).not.toContain(credentialInTopic)
    expect(String(insert?.[1][4])).toContain('[REDACTED]')
    expect(String(insert?.[1][4])).toContain('ordinary content plan')
  })

  it.each([
    '123456' + '789:AAExampleTelegramBotToken_1234567890',
    'sk-' + 'proj-abcdefghijklmnopqrstuvwx',
    'xai-abcdefghijklmnopqrstuvwx',
    '0123456789abcdef' + '0123456789abcdef.abcdefghijklmnopqrstuvwx',
    'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature1234567890',
    'query_id=q&auth_date=1756000000&hash=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ])('redacts credential-shaped values under a benign field (%s)', value => {
    expect(
      redactActivityDetails({ topic: value, note: 'normal topic' })
    ).toEqual({
      topic: '[REDACTED]',
      note: 'normal topic',
    })
  })

  it('owner-isolates feed statistics with a bound $1 parameter', async () => {
    const query = vi.fn(async () => ({ rows: [{ роликов: 2 }] }))
    const tool = TOOLS_BY_NAME.get('feed_stats')!

    await tool.handler({}, context(query))

    expect(query).toHaveBeenCalledTimes(1)
    const calls = query.mock.calls as unknown as [string, unknown[]][]
    expect(calls[0][0]).toContain('telegram_id = $1')
    expect(calls[0][1]).toEqual(['owner-42'])
  })

  it('persists content plans as drafts owned by the authenticated caller', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            topic: 'Weekly clips',
            status: 'draft',
            created_at: '2026-08-24T00:00:00Z',
          },
        ],
      })
    const tool = TOOLS_BY_NAME.get('content_plan_prepare')!

    const result = await tool.handler(
      { topic: 'Weekly clips', goal: 'teach', audience: 'new users', days: 7 },
      context(query)
    )

    const insert = query.mock.calls[1]
    expect(insert[0]).toContain('telegram_id')
    expect(insert[0]).toContain('status')
    expect(insert[1][0]).toBe('owner-42')
    expect(insert[1]).toContain('draft')
    expect(result).toMatchObject({ status: 'draft', owner: 'owner-42' })
  })

  it('owner-isolates activity and redacts secret-shaped values on read', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 9,
            tool_name: 'whoami',
            effect: 'read',
            outcome: 'ok',
            details: {
              apiKey: 'raw-key',
              nested: { authorization: 'Bearer raw', topic: 'safe' },
            },
          },
        ],
      })
    const result = await listOwnerActivity(context(query), 10)

    const select = query.mock.calls[1]
    expect(select[0]).toContain('WHERE telegram_id = $1')
    expect(select[1]).toEqual(['owner-42', 10])
    expect(result[0].details).toEqual({
      apiKey: '[REDACTED]',
      nested: { authorization: '[REDACTED]', topic: 'safe' },
    })
    expect(redactActivityDetails({ token: 'raw', value: 'ok' })).toEqual({
      token: '[REDACTED]',
      value: 'ok',
    })
  })

  it('rejects a forbidden MCP call before pool or handler resolution', async () => {
    process.env.AGENT_SAFE_BETA = 'false'
    const getPool = vi.fn(async () => ({ query: vi.fn() }))

    const req = signedRequest('42')
    const response = { status: 0, body: '' }
    const res = {
      writeHead(code: number) {
        response.status = code
      },
      end(body = '') {
        response.body += String(body)
      },
    } as any

    const pending = handleMcp(req, res, getPool)
    req.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'feed_publish', arguments: { confirmed: true } },
        })
      )
    )
    req.emit('end')
    await pending

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body).error.code).toBe(-32003)
    expect(getPool).not.toHaveBeenCalled()
  })

  it('never reflects a thrown secret through the MCP error boundary', async () => {
    const sentinel = 'sentinel-secret-must-never-leave-server'
    const tool = TOOLS_BY_NAME.get('whoami')!
    const original = tool.handler
    const query = vi.fn(async () => ({ rows: [] }))
    tool.handler = async () => {
      throw new Error(sentinel)
    }

    const req = signedRequest('42')
    const response = { body: '' }
    const res = {
      writeHead() {},
      end(body = '') {
        response.body += String(body)
      },
    } as any

    try {
      const pending = handleMcp(req, res, async () => ({ query }))
      req.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'whoami', arguments: {} },
          })
        )
      )
      req.emit('end')
      await pending
    } finally {
      tool.handler = original
    }

    expect(response.body).toContain('SAFE_BETA_TOOL_FAILED')
    expect(response.body).not.toContain(sentinel)
    expect(response.body).not.toContain(AUTH_TOKEN)
    expect(JSON.stringify(query.mock.calls)).not.toContain(sentinel)
  })

  it('never reflects a provider exception through the chat stream', async () => {
    const sentinel = 'sentinel-provider-secret'
    vi.stubEnv('GLM_API_KEY', 'configured-test-key')
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(sentinel)
      })
    )
    const query = vi.fn(async () => ({ rows: [] }))
    const events: unknown[] = []

    for await (const event of runAgent(
      [{ role: 'user', content: 'hello' }],
      context(query)
    )) {
      events.push(event)
    }

    const output = JSON.stringify(events)
    expect(output).toContain('SAFE_BETA_MODEL_UNAVAILABLE')
    expect(output).not.toContain(sentinel)
    expect(output).not.toContain('configured-test-key')
  })
})
