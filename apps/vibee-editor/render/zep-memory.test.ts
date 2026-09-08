import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  zepConfigured,
  zepEnsureUser,
  zepEnsureThread,
  zepAddMessages,
  zepContext,
  zepGraphAdd,
  ZEP_BATCH,
} from './src/agent/zep-memory'

/** A mirror that never throws: what it sends, and what it does when Zep is not there. */
const OWNER = '144022504'
const LEAD = '555'
function fakeFetch(
  reply: (
    url: string,
    init: any
  ) => { status: number; body?: unknown } = () => ({ status: 200, body: {} })
) {
  const calls: Array<{
    url: string
    method: string
    headers: Record<string, string>
    body: any
  }> = []
  const f = async (url: string, init: any) => {
    calls.push({
      url,
      method: init?.method,
      headers: init?.headers ?? {},
      body: init?.body ? JSON.parse(init.body) : null,
    })
    const r = reply(url, init)
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body ?? {}),
    } as unknown as Response
  }
  return { calls, f }
}
const msg = (i: number, out = false) => ({
  msgId: i,
  at: new Date(Date.UTC(2026, 8, 1, 0, i)),
  out,
  text: `m${i}`,
})

const prev = { k: process.env.ZEP_API_KEY, u: process.env.ZEP_API_URL }
beforeEach(() => {
  process.env.ZEP_API_KEY = 'z-key' // secret-guard-ok: invented for this test
  delete process.env.ZEP_API_URL
})
afterEach(() => {
  process.env.ZEP_API_KEY = prev.k
  process.env.ZEP_API_URL = prev.u
})

describe('when Zep is not configured', () => {
  it('nothing is called and every answer is the empty one', async () => {
    delete process.env.ZEP_API_KEY
    const { calls, f } = fakeFetch()
    expect(zepConfigured()).toBe(false)
    expect(await zepEnsureUser(LEAD, 'Оля', f)).toBe(false)
    expect(await zepAddMessages(OWNER, LEAD, [msg(1)], f)).toBe(0)
    expect(await zepContext(OWNER, LEAD, f)).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('what is sent', () => {
  it('a user, with the API key in the header and the telegram id in the metadata', async () => {
    const { calls, f } = fakeFetch()
    expect(await zepEnsureUser(LEAD, 'Оля', f)).toBe(true)
    expect(calls[0].url).toBe('https://api.getzep.com/api/v2/users')
    expect(calls[0].headers.Authorization).toBe('Api-Key z-key')
    expect(calls[0].body.user_id).toBe('tg-555')
    expect(calls[0].body.metadata.telegram_id).toBe('555')
  })

  it('"already exists" is success, for the user and the thread', async () => {
    const { f } = fakeFetch(() => ({ status: 409 }))
    expect(await zepEnsureUser(LEAD, null, f)).toBe(true)
    expect(await zepEnsureThread(OWNER, LEAD, f)).toBe(true)
  })

  it('messages go oldest first, in slices, the owner as the assistant side', async () => {
    const { calls, f } = fakeFetch()
    const many = Array.from({ length: ZEP_BATCH * 2 + 1 }, (_, i) =>
      msg(i + 1, i % 2 === 0)
    ).reverse()
    expect(await zepAddMessages(OWNER, LEAD, many, f)).toBe(ZEP_BATCH * 2 + 1)
    expect(calls.length).toBe(3)
    expect(calls[0].url).toContain('/api/v2/threads/tg-144022504-555/messages')
    expect(calls[0].body.messages[0].content).toBe('m1')
    expect(calls[0].body.messages[0].role).toBe('assistant')
    expect(calls[0].body.messages[1].role).toBe('user')
    expect(calls[2].body.messages.length).toBe(1)
  })

  it('a slice that fails stops the mirror and reports what went through', async () => {
    let n = 0
    const { f } = fakeFetch(() => ({ status: ++n === 2 ? 500 : 200 }))
    const many = Array.from({ length: ZEP_BATCH * 3 }, (_, i) => msg(i + 1))
    expect(await zepAddMessages(OWNER, LEAD, many, f)).toBe(ZEP_BATCH)
  })

  it('the context block comes back as text, or null', async () => {
    const { calls, f } = fakeFetch(() => ({
      status: 200,
      body: { context: 'FACTS: likes reels' },
    }))
    expect(await zepContext(OWNER, LEAD, f)).toBe('FACTS: likes reels')
    expect(calls[0].method).toBe('GET')
    expect(calls[0].url).toContain('/context?mode=basic')
    const { f: down } = fakeFetch(() => ({ status: 503 }))
    expect(await zepContext(OWNER, LEAD, down)).toBeNull()
  })

  it('a self-hosted base URL is honoured, trailing slash and all', async () => {
    process.env.ZEP_API_URL = 'http://zep.railway.internal:8000/'
    const { calls, f } = fakeFetch()
    await zepGraphAdd(LEAD, { bought: 'photo' }, f)
    expect(calls[0].url).toBe('http://zep.railway.internal:8000/api/v2/graph')
    expect(JSON.parse(calls[0].body.data)).toEqual({ bought: 'photo' })
  })

  it('a network failure is a false, logged once, never a throw', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const f = async () => {
        throw new Error('ECONNREFUSED')
      }
      expect(await zepEnsureUser(LEAD, null, f as never)).toBe(false)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
