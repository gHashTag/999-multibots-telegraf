import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tools as t27Tools } from 't27-mcp'
import {
  A_MOUNT,
  A_REFUSE_COLLISION,
  CODER_TOOLS,
  H_T27,
  H_TRI_CLAW,
  S_EDITORIAL,
  S_GAME,
  S_OWNER,
  admit,
  homeOf,
} from 't27-mcp/service'
import { handleMcp } from './src/agent/routes'
import { TOOLS, TOOLS_BY_NAME, toOpenAITools } from './src/agent/tools'
import { SPEC_BANK_TOOLS } from './src/agent/spec-bank-tools'
import { T27_TURN_TOOLS, scopeOf, t27Hidden } from './src/agent/t27-tools'
import { marketplaceAgentPrompt } from './src/agent/chat'

/**
 * TRI CLAW AND THE t27 MCP ARE ONE SERVICE (specs/t27mcp/service.t27,
 * gHashTag/t27#10484). The t27 tools are mounted into this registry through
 * the spec's admit(); a name the t27 module owns is refused on this side.
 * Expected names below are written out, not read back from the implementation.
 */
const t27Names = t27Tools.map(t => t.name)

describe('the t27 tools are mounted into the one registry', () => {
  it('mounts every tool the t27 module serves, and the module serves some', () => {
    expect(t27Names.length).toBeGreaterThan(10)
    for (const n of ['t27_check', 't27_find', 't27_spec', 't27_examples', 't27_specs', 't27f_view'])
      expect(t27Names).toContain(n)
    for (const n of t27Names) expect(TOOLS_BY_NAME.has(n)).toBe(true)
  })

  it('no tg_* tool comes from the t27 module: Telegram stays TRI CLAW\'s own', () => {
    expect(t27Names.filter(n => n.startsWith('tg_'))).toEqual([])
    expect(homeOf('tg_dialogs')).toBe(H_TRI_CLAW)
  })

  it('the CRM and the board are untouched', () => {
    for (const n of ['crm_clients', 'hive_board', 'feed_list', 'whoami'])
      expect(TOOLS_BY_NAME.has(n)).toBe(true)
  })

  it('the spec bank t27_specs is refused as a collision and the mounted one answers', () => {
    expect(SPEC_BANK_TOOLS.map(t => t.name)).toContain('t27_specs')
    expect(admit('t27_specs', H_TRI_CLAW)).toBe(A_REFUSE_COLLISION)
    // The mounted t27_specs filters the manifest; the bank's took an action.
    const props = (TOOLS_BY_NAME.get('t27_specs')!.parameters as any).properties
    expect(props).toHaveProperty('limit')
    expect(props).not.toHaveProperty('action')
  })

  it('every other TRI CLAW tool is admitted, so the filter dropped only the collision', () => {
    const own = TOOLS.filter(t => homeOf(t.name) !== H_T27)
    expect(own.length).toBeGreaterThan(100)
    expect(own.filter(t => admit(t.name, H_TRI_CLAW) !== A_MOUNT)).toEqual([])
    expect(TOOLS.length).toBe(TOOLS_BY_NAME.size)
  })

  it('a mounted tool answers through the module: t27_check on a module', async () => {
    const r: any = await TOOLS_BY_NAME.get('t27_check')!.handler(
      { source: 'module M;\npub const A : u32 = 1;\n' },
      {} as any
    )
    expect(r.ok).toBe(true)
  })
})

describe('a model turn sees the coder tools from the t27 home, not all of them', () => {
  const offered = toOpenAITools().map(t => t.function.name)
  it('offers CODER_TOOLS and t27_specs', () => {
    expect([...CODER_TOOLS].sort()).toEqual(['t27_check', 't27_examples', 't27_find', 't27_spec'])
    for (const n of [...CODER_TOOLS, 't27_specs']) expect(offered).toContain(n)
  })
  it('does not offer the rest of the t27 home', () => {
    const fromT27 = offered.filter(n => homeOf(n) === H_T27).sort()
    expect(fromT27).toEqual([...T27_TURN_TOOLS].sort())
    expect(offered).not.toContain('t27f_view')
  })
  it('the coder is told to find, read and check before it calls a .t27 ready', () => {
    const prompt = marketplaceAgentPrompt('coder')
    for (const n of CODER_TOOLS) expect(prompt).toContain(n)
  })
})

const KEY = 'one-service-editorial-credential'
const FULL = 'one-service-full-credential'

function request(body: unknown, key: string) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body))])
  return Object.assign(stream, {
    method: 'POST',
    url: '/mcp',
    headers: { 'x-agent-key': key },
  }) as IncomingMessage
}

async function rpc(method: string, params: unknown, key: string) {
  let body: any
  const res = {
    writeHead() {},
    end(value: string) {
      body = JSON.parse(value)
    },
  } as unknown as ServerResponse
  await handleMcp(request({ jsonrpc: '2.0', id: 1, method, params }, key), res, vi.fn())
  return body
}

describe('who sees the t27 tools on /mcp', () => {
  beforeEach(() => {
    vi.stubEnv('LEELA_EDITORIAL_AGENT_KEYS', `${KEY}:123456789`)
    vi.stubEnv('AGENT_KEYS', `${FULL}:987654321`)
    vi.stubEnv('RENDER_API_KEY', 'one-service-server-credential')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('the spec: owner scope sees them, editorial and game do not', () => {
    expect(scopeOf('full', false)).toBe(S_OWNER)
    expect(scopeOf('leela-editorial', false)).toBe(S_EDITORIAL)
    expect(scopeOf('full', true)).toBe(S_GAME)
    expect(t27Hidden('t27_check', S_OWNER)).toBe(false)
    expect(t27Hidden('t27_check', S_EDITORIAL)).toBe(true)
    expect(t27Hidden('t27_check', S_GAME)).toBe(true)
    // A TRI CLAW tool is not the t27 rule's to hide.
    expect(t27Hidden('whoami', S_GAME)).toBe(false)
  })

  it('a full identity lists the t27 tools and the CRM in one tools/list', async () => {
    const names = (await rpc('tools/list', {}, FULL)).result.tools.map((t: any) => t.name)
    expect(names).toContain('t27_check')
    expect(names).toContain('crm_clients')
    expect(names).toContain('hive_board')
  })

  it('an editorial identity lists no t27 tool and cannot call one', async () => {
    const names = (await rpc('tools/list', {}, KEY)).result.tools.map((t: any) => t.name)
    expect(names.filter((n: string) => homeOf(n) === H_T27)).toEqual([])
    const call = await rpc('tools/call', { name: 't27_check', arguments: { source: 'module M;' } }, KEY)
    expect(call.error.code).toBe(-32003)
  })
})
