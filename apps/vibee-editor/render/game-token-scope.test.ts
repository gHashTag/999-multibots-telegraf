import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

/**
 * WHERE A GAME TOKEN WORKS: /mcp, FOR IDENTITY TOOLS ONLY. NOWHERE ELSE.
 *
 * A game token (v:2, session.ts signGameToken) lives in the game origin, which
 * runs code this service does not review. So the token must be worth identity
 * and nothing more: on /mcp it may call whoami and hive_pulse, tools/list shows
 * only those, and its audience must equal the request Origin.
 *
 * Every other place that reads a Bearer must refuse it. The second half of this
 * file ENUMERATES those readers from the source, so a new one fails here by
 * name until someone decides what it does with a game token, and then proves
 * each known reader refuses one.
 */

const KEY = 'game-scope-test-signing-key-long-enough-0123456789'
const AGENT_KEY = 'agent-key-for-game-scope-tests'
const GAME = 'https://t27.ai'
const ALICE = '1001'

let source = 0
function request(
  url: string,
  headers: Record<string, string>,
  body: unknown = {}
) {
  const r = Readable.from([Buffer.from(JSON.stringify(body))]) as any
  r.url = url
  r.method = 'POST'
  r.headers = headers
  r.socket = { remoteAddress: `10.5.0.${++source}` }
  return r
}

function response() {
  const o: any = { status: 0, body: null }
  o.setHeader = () => undefined
  o.writeHead = (code: number) => {
    o.status = code
    return o
  }
  o.end = (s: string) => {
    o.body = s ? JSON.parse(s) : null
  }
  return o
}

const emptyPool = () => {
  const client = {
    async query() {
      return { rows: [] as any[] }
    },
    release() {},
  }
  return { ...client, connect: async () => client }
}

const ENV = ['SESSION_SIGNING_KEY', 'AGENT_KEYS', 'RENDER_AUTH_MODE'] as const
const saved: Record<string, string | undefined> = {}

let session: typeof import('./session')
let routes: typeof import('./src/agent/routes')
let tools: typeof import('./src/agent/tools')

beforeEach(async () => {
  for (const k of ENV) saved[k] = process.env[k]
  process.env.SESSION_SIGNING_KEY = KEY
  process.env.AGENT_KEYS = `${AGENT_KEY}:${ALICE}`
  process.env.RENDER_AUTH_MODE = 'enforce'
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.resetModules()
  session = await import('./session')
  routes = await import('./src/agent/routes')
  tools = await import('./src/agent/tools')
  session.setRevokedSessions([])
})

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.restoreAllMocks()
})

const gameToken = (now?: number) =>
  session.signGameToken({ telegramId: ALICE, audience: GAME, now })

async function mcp(headers: Record<string, string>, rpc: unknown) {
  const res = response()
  await routes.handleMcp(request('/mcp', headers, rpc), res, () => emptyPool())
  return res
}

const spyTool = (name: string) => {
  const tool = tools.TOOLS_BY_NAME.get(name)
  if (!tool) throw new Error(`no tool ${name}`)
  return vi.spyOn(tool, 'handler').mockResolvedValue({ spied: name })
}

describe('/mcp with a game token', () => {
  it('names only existing tools as game tools', () => {
    expect([...routes.GAME_TOKEN_TOOLS].sort()).toEqual([
      'hive_pulse',
      'whoami',
    ])
    for (const name of routes.GAME_TOKEN_TOOLS)
      expect(tools.TOOLS_BY_NAME.has(name), name).toBe(true)
  })

  it('tools/list shows only the game tools; an app session still sees all', async () => {
    const game = await mcp(
      { origin: GAME, authorization: `Bearer ${gameToken()}` },
      { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    )
    expect(game.status, JSON.stringify(game.body)).toBe(200)
    const names = game.body.result.tools.map((t: { name: string }) => t.name)
    expect(names.sort()).toEqual(['hive_pulse', 'whoami'])

    const app = session.signAccessToken({
      telegramId: ALICE,
      sessionId: 's-app',
      deviceKeyThumbprint: '',
    })
    const full = await mcp(
      { authorization: `Bearer ${app}` },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    )
    expect(full.body.result.tools.length).toBe(tools.toMcpTools().length)
    expect(full.body.result.tools.length).toBeGreaterThan(2)
  })

  it('calls whoami and hive_pulse as the token subject', async () => {
    for (const name of ['whoami', 'hive_pulse']) {
      const spy = spyTool(name)
      const res = await mcp(
        { origin: GAME, authorization: `Bearer ${gameToken()}` },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name } }
      )
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      expect(res.body.error, JSON.stringify(res.body)).toBeUndefined()
      expect(res.body.result.structuredContent).toEqual({ spied: name })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][1]).toMatchObject({ telegramId: ALICE })
    }
  })

  it('refuses any other tool, existing or not, without running it or listing others', async () => {
    const spy = spyTool('feed_stats')
    for (const name of ['feed_stats', 'no_such_tool']) {
      const res = await mcp(
        { origin: GAME, authorization: `Bearer ${gameToken()}` },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name } }
      )
      expect(res.body.id).toBe(4)
      expect(res.body.error?.code, JSON.stringify(res.body)).toBe(-32001)
      expect(res.body.error.message).not.toContain('feed_list')
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses a game token whose audience is not the request Origin', async () => {
    const spy = spyTool('whoami')
    for (const origin of [
      undefined,
      'https://app.t27.ai',
      'https://evil.example',
    ]) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${gameToken()}`,
      }
      if (origin) headers.origin = origin
      const res = await mcp(headers, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'whoami' },
      })
      expect(res.status, `origin ${origin}`).toBe(401)
      expect(res.body.error.code).toBe(-32001)
      expect(res.body.error.message).toMatch(/wrong_audience/)
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('an invalid game token does not fall back to another credential', async () => {
    const spy = spyTool('feed_stats')
    const expired = gameToken(Math.floor(Date.now() / 1000) - 3600)
    const res = await mcp(
      {
        origin: GAME,
        authorization: `Bearer ${expired}`,
        'x-agent-key': AGENT_KEY,
      },
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'feed_stats' },
      }
    )
    expect(res.status).toBe(401)
    expect(res.body.error.message).toMatch(/expired/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('a valid game token stays narrow even when an agent key rides along', async () => {
    const res = await mcp(
      {
        origin: GAME,
        authorization: `Bearer ${gameToken()}`,
        'x-agent-key': AGENT_KEY,
      },
      { jsonrpc: '2.0', id: 7, method: 'tools/list' }
    )
    const names = res.body.result.tools.map((t: { name: string }) => t.name)
    expect(names.sort()).toEqual(['hive_pulse', 'whoami'])
  })
})

describe('every other Bearer reader refuses a game token', () => {
  /*
   * Every production file that reads the Authorization header of an incoming
   * request, and what it does with it. A new reader fails the enumeration below
   * by file name until it is listed here with a decision -- and, if it verifies
   * sessions, added to the behaviour test after it.
   */
  const READERS: Record<string, string> = {
    'auth.ts': 'authenticate: verifyAppSession, v:1 only',
    'project-routes.ts': 'projectOwner: verifyAppSession',
    'session-routes.ts':
      'logout, logout-all, game-token parent: verifyAppSession',
    'src/agent/routes.ts':
      'chatIdentity: verifyAppSession; handleMcp: verifyGameToken for GAME_TOKEN_TOOLS',
    'render-server.ts':
      'Z.AI relay: compared with GLM_API_KEY, never a session',
  }
  const SESSION_VERIFIERS = [
    'auth.ts',
    'project-routes.ts',
    'session-routes.ts',
    'src/agent/routes.ts',
  ]

  const RENDER = __dirname
  const sources = (): string[] => {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        if (
          ['node_modules', 'dist', 'e2e'].includes(name) ||
          name.startsWith('.')
        )
          continue
        const full = path.join(dir, name)
        if (fs.statSync(full).isDirectory()) walk(full)
        else if (name.endsWith('.ts') && !name.endsWith('.test.ts'))
          out.push(path.relative(RENDER, full))
      }
    }
    walk(RENDER)
    return out
  }
  const code = (file: string) =>
    fs
      .readFileSync(path.join(RENDER, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('the readers of an incoming Authorization header are exactly the listed ones', () => {
    const reads =
      /headers(?:\?\.|\.)?(?:authorization\b|\[\s*['"]authorization['"]\s*\])/i
    const found = sources()
      .filter(f => reads.test(code(f)))
      .sort()
    expect(found).toEqual(Object.keys(READERS).sort())
  })

  it('the files that call verifyAppSession are exactly the session verifiers', () => {
    const found = sources()
      .filter(f => f !== 'session.ts' && /verifyAppSession\(/.test(code(f)))
      .sort()
    expect(found).toEqual([...SESSION_VERIFIERS].sort())
  })

  it('each reader refuses a game token', async () => {
    const token = gameToken()
    const headers = { origin: GAME, authorization: `Bearer ${token}` }
    const bare = { url: '/render', method: 'POST', headers } as any

    // The shared verifier.
    expect(() => session.verifyAppSession(token)).toThrow()

    // auth.ts: the global guard, on a guarded path.
    const { authenticate } = await import('./auth')
    expect(authenticate(bare).allowed).toBe(false)

    // src/agent/routes.ts: chatIdentity, and resolveIdentity above it -- the
    // identity of every chatIdentity/resolveIdentity route in render-server.ts.
    expect(routes.chatIdentity(bare, null)).toBeNull()
    expect(await routes.resolveIdentity(bare, () => emptyPool())).toBeNull()

    // project-routes.ts.
    const { projectOwner } = await import('./project-routes')
    expect(projectOwner(bare)).toBeNull()

    // session-routes.ts: logout, logout-all, and game-token itself -- which the
    // player origin asks, naming the game audience in the body.
    const { handleAuthRoute } = await import('./session-routes')
    for (const [url, origin] of [
      ['/api/auth/logout', GAME],
      ['/api/auth/logout-all', GAME],
      ['/api/auth/game-token', 'https://app.t27.ai'],
    ]) {
      const res = response()
      await handleAuthRoute(
        request(url, { ...headers, origin }, { aud: GAME }),
        res,
        () => emptyPool() as any
      )
      expect(res.status, `${url} ${JSON.stringify(res.body)}`).toBe(401)
    }

    // render-server.ts: the Z.AI relay compares the bearer with its own key.
    const { handleZaiRelay } = await import('./src/zai-relay')
    const upstream = vi.fn()
    const relay = await handleZaiRelay(bare, {
      readBody: async () => '{}',
      bearerOf: r => (r as any).headers?.authorization,
      apiKey: () => 'relay-key-for-game-scope-tests',
      fetchImpl: upstream as any,
    })
    expect(relay.status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })
})
