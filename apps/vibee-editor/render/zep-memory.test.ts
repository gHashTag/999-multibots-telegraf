import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  zepConfigured,
  zepEnsureUser,
  zepEnsureThread,
  zepAddMessages,
  zepContext,
  zepGraphAdd,
  ZEP_BATCH,
  zepFlavor,
  mintZepToken,
} from './src/agent/zep-memory'
import { createHmac } from 'node:crypto'

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

const prev = {
  k: process.env.ZEP_API_KEY,
  u: process.env.ZEP_API_URL,
  s: process.env.ZEP_AUTH_SECRET,
  f: process.env.ZEP_FLAVOR,
}
beforeEach(() => {
  process.env.ZEP_API_KEY = 'z-key' // secret-guard-ok: invented for this test
  delete process.env.ZEP_API_URL
  delete process.env.ZEP_AUTH_SECRET
  delete process.env.ZEP_FLAVOR
})
afterEach(() => {
  process.env.ZEP_API_KEY = prev.k
  process.env.ZEP_API_URL = prev.u
  process.env.ZEP_AUTH_SECRET = prev.s
  process.env.ZEP_FLAVOR = prev.f
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
    const { f: said } = fakeFetch(() => ({
      status: 400,
      body: { message: 'user already exists' },
    }))
    expect(await zepEnsureUser(LEAD, null, said)).toBe(true)
  })

  it('a plain 400 is our mistake, not "exists", and a refusal is logged once', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { f } = fakeFetch(() => ({
        status: 400,
        body: { message: 'invalid body' },
      }))
      expect(await zepEnsureUser(LEAD, null, f)).toBe(false)
      const { f: denied } = fakeFetch(() => ({
        status: 401,
        body: { message: 'bad key' },
      }))
      expect(await zepEnsureThread(OWNER, LEAD, denied)).toBe(false)
      expect(await zepEnsureThread(OWNER, LEAD, denied)).toBe(false)
      const lines = spy.mock.calls.map(c => c.map(String).join(' '))
      expect(
        lines.some(l => l.includes('/api/v2/threads') && l.includes('401'))
      ).toBe(true)
      expect(
        lines.filter(l => l.includes('POST /api/v2/threads ')).length
      ).toBe(1)
    } finally {
      spy.mockRestore()
    }
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
    // The graph is a cloud feature; this case is about the address only.
    process.env.ZEP_FLAVOR = 'cloud'
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

describe('the self-hosted dialect (Zep community server)', () => {
  const selfHosted = () => {
    delete process.env.ZEP_API_KEY
    process.env.ZEP_API_URL = 'http://zep.railway.internal:8000'
    process.env.ZEP_AUTH_SECRET = 's3cret-for-tests' // secret-guard-ok: invented for this test
  }

  it('is chosen by the address, and can be forced either way', () => {
    selfHosted()
    expect(zepFlavor()).toBe('ce')
    expect(zepConfigured()).toBe(true)
    process.env.ZEP_FLAVOR = 'cloud'
    expect(zepFlavor()).toBe('cloud')
    delete process.env.ZEP_FLAVOR
    process.env.ZEP_API_URL = 'https://api.getzep.com'
    expect(zepFlavor()).toBe('cloud')
  })

  it('signs its own bearer token with the secret: three parts, HS256, verifiable', async () => {
    selfHosted()
    const { calls, f } = fakeFetch()
    expect(await zepEnsureUser(LEAD, 'Оля', f)).toBe(true)
    expect(calls[0].url).toBe('http://zep.railway.internal:8000/api/v1/user')
    const auth = calls[0].headers.Authorization
    expect(auth.startsWith('Bearer ')).toBe(true)
    const [h, b, sig] = auth.slice(7).split('.')
    expect(sig).toBe(
      createHmac('sha256', 's3cret-for-tests')
        .update(`${h}.${b}`)
        .digest('base64url')
    )
    expect(JSON.parse(Buffer.from(h, 'base64url').toString()).alg).toBe('HS256')
    expect(mintZepToken('s3cret-for-tests')).toBe(auth.slice(7))
  })

  it('a ready JWT in ZEP_API_KEY is used as it is', async () => {
    selfHosted()
    process.env.ZEP_API_KEY = 'aaa.bbb.ccc' // secret-guard-ok: invented for this test
    const { calls, f } = fakeFetch()
    await zepEnsureThread(OWNER, LEAD, f)
    expect(calls[0].headers.Authorization).toBe('Bearer aaa.bbb.ccc')
    expect(calls[0].url).toBe(
      'http://zep.railway.internal:8000/api/v1/sessions'
    )
    expect(calls[0].body.session_id).toBe('tg-144022504-555')
    expect(calls[0].body.user_id).toBe('tg-555')
  })

  it('messages go to the session memory with role_type for the side, role for the name', async () => {
    selfHosted()
    const { calls, f } = fakeFetch()
    expect(await zepAddMessages(OWNER, LEAD, [msg(2, true), msg(1)], f)).toBe(2)
    expect(calls[0].url).toBe(
      'http://zep.railway.internal:8000/api/v1/sessions/tg-144022504-555/memory'
    )
    expect(calls[0].body.messages[0]).toMatchObject({
      role: 'person',
      role_type: 'user',
      content: 'm1',
    })
    expect(calls[0].body.messages[1]).toMatchObject({
      role: 'owner',
      role_type: 'assistant',
      content: 'm2',
    })
  })

  it('the context is the summary and the facts, or nothing', async () => {
    selfHosted()
    const { calls, f } = fakeFetch(() => ({
      status: 200,
      body: {
        summary: { content: 'wants a reel' },
        facts: ['asked the price', ''],
      },
    }))
    const ctx = await zepContext(OWNER, LEAD, f)
    expect(calls[0].url).toContain(
      '/api/v1/sessions/tg-144022504-555/memory?lastn=1'
    )
    expect(ctx).toBe('FACTS:\n- asked the price\n\nSUMMARY:\nwants a reel')
    const { f: empty } = fakeFetch(() => ({
      status: 200,
      body: { messages: [] },
    }))
    expect(await zepContext(OWNER, LEAD, empty)).toBeNull()
  })

  it('has no graph: a business fact stays in Postgres, nothing is called', async () => {
    selfHosted()
    const { calls, f } = fakeFetch()
    expect(await zepGraphAdd(LEAD, { bought: 'photo' }, f)).toBe(false)
    expect(calls).toEqual([])
  })
})
