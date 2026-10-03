/**
 * POST /api/agent/chat WITH A `lane`: REFUSED BEFORE THE STREAM, OR HANDED ON.
 *
 * A lane of the wrong shape is 400 and a lane past the browser's cap is 409 --
 * both real statuses, before the 200 stream opens. A good lane reaches the
 * agent's tools as ctx.lane; no lane, or "main", reaches them as before: no
 * `lane` key at all.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Readable } from 'node:stream'

const WHO = '900000051'

let seenCtx: Record<string, unknown> | null = null
let runs = 0
vi.mock('./src/agent/chat', () => ({
  runAgent: async function* (_h: unknown, ctx: Record<string, unknown>) {
    seenCtx = ctx
    runs++
    yield { ['тип']: 'текст', ['текст']: 'ok' } // cyrillic-ok: pre-existing event envelope
  },
}))

import { handleAgentChat } from './src/agent/routes'
import { claimLane, lanesOf, resetLanesForTests } from './src/browser/lanes'

function req(body: unknown) {
  const s = Readable.from([JSON.stringify(body)]) as any
  s.headers = { 'content-type': 'application/json' }
  s.method = 'POST'
  s.url = '/api/agent/chat'
  return s
}

function res() {
  const out: { code?: number; body?: any; streamed: boolean } = {
    streamed: false,
  }
  return {
    out,
    on() {
      return this
    },
    writeHead(code: number) {
      out.code = code
      if (code === 200) out.streamed = true
      return this
    },
    write() {
      return true
    },
    end(text?: string) {
      if (text)
        try {
          out.body = JSON.parse(text)
        } catch {
          out.body = text
        }
    },
    setHeader() {},
  } as any
}

const pool = { query: async () => ({ rows: [] }) }
const getPool = () => pool
const say = (extra: Record<string, unknown> = {}) => ({
  messages: [{ role: 'user', content: 'hi' }],
  ...extra,
})

beforeEach(() => {
  resetLanesForTests()
  seenCtx = null
  runs = 0
})

describe('the lane a chat names', () => {
  it('a lane of the wrong shape is 400 before anything runs', async () => {
    for (const lane of [null, '', 'Main', 'a_b', 'a'.repeat(25), 7, ['a']]) {
      const r = res()
      await handleAgentChat(req(say({ lane })), r, WHO, getPool)
      expect(r.out.code, JSON.stringify(lane)).toBe(400)
      expect(r.out.body.code).toBe('bad_request')
      expect(r.out.body.error).toContain('^[a-z0-9][a-z0-9-]{0,23}$')
      expect(r.out.streamed).toBe(false)
    }
    expect(runs).toBe(0)
    expect(lanesOf(WHO)).toEqual([])
  })

  it('no lane, or "main", reaches the tools exactly as before: no lane key', async () => {
    for (const extra of [{}, { lane: 'main' }]) {
      seenCtx = null
      const r = res()
      await handleAgentChat(req(say(extra)), r, WHO, getPool)
      expect(r.out.code).toBe(200)
      expect(seenCtx).not.toBeNull()
      expect(Object.keys(seenCtx!)).not.toContain('lane')
    }
    expect(lanesOf(WHO)).toEqual([])
  })

  it('a good lane is taken and handed to the tools', async () => {
    const r = res()
    await handleAgentChat(req(say({ lane: 'research' })), r, WHO, getPool)
    expect(r.out.code).toBe(200)
    expect(seenCtx).toMatchObject({ telegramId: WHO, lane: 'research' })
    expect(lanesOf(WHO)).toEqual(['research'])
  })

  it('a lane past the cap is 409 lane_limit before the stream, naming the lanes', async () => {
    claimLane(WHO, 'a')
    claimLane(WHO, 'b')
    const r = res()
    await handleAgentChat(req(say({ lane: 'c' })), r, WHO, getPool)
    expect(r.out.code).toBe(409)
    expect(r.out.body.code).toBe('lane_limit')
    expect(r.out.body.error).toContain('(main, a, b)')
    expect(r.out.streamed).toBe(false)
    expect(runs).toBe(0)
    /* The lanes that hold the windows, and main, still run. */
    for (const lane of ['a', undefined]) {
      const ok = res()
      await handleAgentChat(req(say({ lane })), ok, WHO, getPool)
      expect(ok.out.code).toBe(200)
    }
  })
})
