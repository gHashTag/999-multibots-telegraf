import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * /mcp SPEAKS TO AN MCP CLIENT OVER HTTP, NOT ONLY TO curl.
 *
 * Owner, 2026-09-27: "set up MCP for remote setup" -- a Claude Code session
 * connects to the render as an MCP server (.mcp.json, "vibee-render"). Its
 * client (the MCP SDK's streamable HTTP transport) does two things curl never
 * did:
 *
 *   - right after initialize it POSTs the notification
 *     notifications/initialized (no id) and expects 202 with no body; we used
 *     to answer "no such method" with id null;
 *   - then it GETs /mcp with Accept: text/event-stream to open a server
 *     stream, and expects either a stream or 405; we answered with the JSON
 *     card, which it would read as an empty stream.
 *
 * The card stays for a person or an agent that GETs the bare address.
 */
const KEY = 'mcp-http-client-test-credential'
const OWNER = '900000001'

function post(body: unknown, headers: Record<string, string>) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body))])
  return Object.assign(stream, {
    method: 'POST',
    url: '/mcp',
    headers,
  }) as IncomingMessage
}

function response() {
  const out = {
    status: 0,
    headers: {} as Record<string, unknown>,
    body: undefined as string | undefined,
  }
  const res = {
    writeHead(code: number, headers?: Record<string, unknown>) {
      out.status = code
      out.headers = headers ?? {}
    },
    end(value?: string) {
      out.body = value
    },
  } as unknown as ServerResponse
  return { res, out }
}

const saved: Record<string, string | undefined> = {}
let routes: typeof import('./src/agent/routes')

beforeEach(async () => {
  for (const k of ['AGENT_KEYS', 'RENDER_AUTH_MODE']) saved[k] = process.env[k]
  process.env.AGENT_KEYS = `${KEY}:${OWNER}`
  process.env.RENDER_AUTH_MODE = 'enforce'
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.resetModules()
  routes = await import('./src/agent/routes')
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.restoreAllMocks()
})

async function mcp(body: unknown, key = KEY) {
  const { res, out } = response()
  await routes.handleMcp(
    post(body, {
      'x-agent-key': key,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    }),
    res,
    () => ({ query: async () => ({ rows: [] }) })
  )
  return out
}

describe('the handshake an MCP HTTP client makes', () => {
  it('initialize answers with the protocol, the tools capability and the server', async () => {
    const out = await mcp({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'claude-code', version: '0' },
      },
    })
    expect(out.status).toBe(200)
    const j = JSON.parse(out.body!)
    expect(j.id).toBe(0)
    expect(j.result.protocolVersion).toBe('2024-11-05')
    expect(j.result.capabilities).toEqual({ tools: {} })
    expect(j.result.serverInfo.name).toBeTruthy()
  })

  it('notifications/initialized is accepted with 202 and no body', async () => {
    const out = await mcp({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })
    expect(out.status).toBe(202)
    expect(out.body ?? '').toBe('')
  })

  it('any notification gets no answer, but a request still does', async () => {
    const note = await mcp({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 3 },
    })
    expect(note.status).toBe(202)
    const asked = await mcp({ jsonrpc: '2.0', id: 4, method: 'nope' })
    expect(asked.status).toBe(200)
    expect(JSON.parse(asked.body!).error.code).toBe(-32601)
    // A request that omits its id is still answered (id null), as before.
    const bare = await mcp({ jsonrpc: '2.0', method: 'tools/list' })
    expect(bare.status).toBe(200)
    expect(JSON.parse(bare.body!).id).toBe(null)
  })

  it('a notification without a key is refused like anything else', async () => {
    const out = await mcp(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      'wrong-key'
    )
    expect(out.status).toBe(401)
  })

  it('tools/list works under the same key after the handshake', async () => {
    const out = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const tools = JSON.parse(out.body!).result.tools as Array<{ name: string }>
    expect(tools.some(t => t.name === 'crm_story_reel')).toBe(true)
  })
})

describe('GET /mcp: a stream for a client, the card for a reader', () => {
  it('a client asking for an event stream gets 405 and Allow: POST', () => {
    const { res, out } = response()
    routes.handleMcpCard(res, 'text/event-stream')
    expect(out.status).toBe(405)
    expect(out.headers.Allow).toBe('POST')
  })

  it('a reader gets the card, whatever else it accepts', () => {
    for (const accept of [
      '',
      '*/*',
      'application/json',
      'application/json, text/event-stream',
    ]) {
      const { res, out } = response()
      routes.handleMcpCard(res, accept)
      expect(out.status).toBe(200)
      expect(JSON.parse(out.body!).методы).toContain('tools/call') // cyrillic-ok: the card's own key
    }
  })

  it('the render server passes the Accept header to the card', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')
    expect(src).toMatch(
      /handleMcpCard\(res, String\(req\.headers\.accept \?\? ''\)\)/
    )
  })
})

describe('.mcp.json: a Claude Code session reaches the render', () => {
  it('names the render /mcp with the agent key from the environment, never a literal key', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const cfg = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', '.mcp.json'), 'utf8')
    )
    const s = cfg.mcpServers['vibee-render']
    expect(s.type).toBe('http')
    expect(s.url).toBe('https://vibee-render-production.up.railway.app/mcp')
    // ${VAR:-} so a checkout without the variable still parses the file.
    expect(s.headers['X-Agent-Key']).toBe('${VIBEE_AGENT_KEY:-}')
  })
})
