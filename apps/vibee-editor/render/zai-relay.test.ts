import { describe, it, expect } from 'vitest'
import {
  isZaiRelayPath,
  legalizeZaiMessages,
  handleZaiRelay,
} from './src/zai-relay'

/**
 * WHY THIS ROUTE EXISTS (measured 2026-09-13 against api.z.ai).
 *
 * Zep CE v0.27.2 calls its LLM with ONE message and it is a system message
 * (pkg/llms/llm_openai.go: `[]schema.ChatMessage{schema.SystemChatMessage{...}}`).
 * Z.AI rejects any messages array that holds no user turn at all:
 *
 *   [{"role":"system","content":"..."}]            -> 400 code 1214
 *   [{"role":"system"},{"role":"assistant"}]       -> 400 code 1214
 *   [{"role":"system"},{"role":"user"},...]        -> 200
 *   [{"role":"system"},{"role":"assistant"},{"role":"user"}] -> 200
 *
 * The rule is presence, not order. So the relay appends one user turn
 * {"role":"user","content":"Proceed."} when -- and only when -- the caller
 * sent none. Everything else passes through untouched: same status, same
 * body, the upstream key comes from OUR env, never from the caller.
 *
 * The caller is authenticated by knowing the same key we forward (zep holds
 * Z.AI's key as ZEP_OPENAI_API_KEY and sends it as a bearer). A stranger
 * without the key gets 403 and no proxy.
 */

const KEY = 'test-zai-key'

function deps(over: Partial<Parameters<typeof handleZaiRelay>[1]> = {}) {
  const seen: Array<{
    url: string
    init: RequestInit
  }> = []
  const d = {
    readBody: async () => '{}',
    bearerOf: () => `Bearer ${KEY}`,
    apiKey: () => KEY,
    fetchImpl: (async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response('{"choices":[]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch,
    ...over,
  }
  return { d, seen }
}

describe('isZaiRelayPath', () => {
  it('accepts exactly what langchaingo builds from ZEP_LLM_OPENAI_ENDPOINT', () => {
    // zep vendors langchaingo e16b777: base + "/chat/completions", base
    // slashes trimmed. A trailing slash still matches -- the cost of missing
    // a call over a dashboard typo is a confusing 404 from OUR server.
    expect(isZaiRelayPath('/api/zai/relay/chat/completions')).toBe(true)
    expect(isZaiRelayPath('/api/zai/relay/chat/completions/')).toBe(true)
  })

  it('rejects everything else, including the bare relay base', () => {
    // The base without the suffix is not a call this server can answer:
    // langchaingo never sends it, and answering it would invite probes.
    expect(isZaiRelayPath('/api/zai/relay')).toBe(false)
    expect(isZaiRelayPath('/api/zai/relay/other')).toBe(false)
    expect(isZaiRelayPath('/api/hive/note')).toBe(false)
    expect(isZaiRelayPath('')).toBe(false)
  })
})

describe('legalizeZaiMessages', () => {
  it('appends one user turn to a system-only array (the zep v0.27.2 shape)', () => {
    const out = legalizeZaiMessages([{ role: 'system', content: 'prompt' }])
    expect(out.messages).toEqual([
      { role: 'system', content: 'prompt' },
      { role: 'user', content: 'Proceed.' },
    ])
  })

  it('leaves an array that already has a user turn untouched, by reference', () => {
    // Presence is the rule, order is not: system-assistant-user is legal on
    // Z.AI. The pass-through must not copy, reorder, or normalize anything.
    const original = [
      { role: 'system', content: 's' },
      { role: 'assistant', content: 'prev' },
      { role: 'user', content: 'go' },
    ]
    const out = legalizeZaiMessages(original)
    expect(out.messages).toBe(original)
  })

  it('refuses what is not a non-empty array of messages', () => {
    // Garbage in, refusal out: relaying a malformed body upstream would turn
    // Z.AI's diagnostic into our 502 and hide the real problem.
    for (const bad of [undefined, null, 'x', 7, [], [{}]]) {
      expect(legalizeZaiMessages(bad).error).toBeTruthy()
    }
  })
})

describe('handleZaiRelay', () => {
  it('only POST goes through; anything else is 405 before any secret check', async () => {
    const { d } = deps()
    const out = await handleZaiRelay({ method: 'GET' }, d)
    expect(out.status).toBe(405)
  })

  it('no GLM_API_KEY in the environment: 503, and the proxy stays closed', async () => {
    const { d, seen } = deps({ apiKey: () => undefined })
    const out = await handleZaiRelay({ method: 'POST' }, d)
    expect(out.status).toBe(503)
    expect(seen).toHaveLength(0)
  })

  it('a wrong bearer is refused with 403 and no upstream call', async () => {
    // The relay must not become an open LLM proxy for whoever finds the URL.
    const { d, seen } = deps({ bearerOf: () => 'Bearer nope' })
    const out = await handleZaiRelay({ method: 'POST' }, d)
    expect(out.status).toBe(403)
    expect(seen).toHaveLength(0)
    const absent = await deps({ bearerOf: () => undefined })
    const out2 = await handleZaiRelay({ method: 'POST' }, absent.d)
    expect(out2.status).toBe(403)
  })

  it('relays with OUR key, to the pinned upstream, and appends the user turn', async () => {
    let sentBody = ''
    const { d } = deps({
      readBody: async () =>
        JSON.stringify({
          model: 'glm-5.3-flash',
          messages: [{ role: 'system', content: 'Summarize the dialog.' }],
          max_tokens: 1024,
        }),
      fetchImpl: (async (_url: string, init: RequestInit) => {
        sentBody = String(init.body)
        return new Response('{"ok":1}', { status: 200 })
      }) as typeof fetch,
    })
    const out = await handleZaiRelay({ method: 'POST' }, d)
    expect(out.status).toBe(200)
    expect(out.body).toBe('{"ok":1}')
    // THE point of the route, asserted on the wire: a user turn exists.
    expect(JSON.parse(sentBody).messages.at(-1)).toEqual({
      role: 'user',
      content: 'Proceed.',
    })
  })

  it('a body with a user turn already in it crosses unchanged', async () => {
    let sentBody = ''
    const { d } = deps({
      readBody: async () =>
        JSON.stringify({
          model: 'glm-5.3-flash',
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi' },
          ],
        }),
      fetchImpl: (async (_u: string, init: RequestInit) => {
        sentBody = String(init.body)
        return new Response('{}', { status: 200 })
      }) as typeof fetch,
    })
    await handleZaiRelay({ method: 'POST' }, d)
    expect(JSON.parse(sentBody).messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])
  })

  it('the upstream status and body pass through verbatim, 429 included', async () => {
    const { d } = deps({
      readBody: async () =>
        JSON.stringify({
          messages: [{ role: 'user', content: 'x' }],
        }),
      fetchImpl: (async () =>
        new Response('{"error":{"code":"1113"}}', {
          status: 429,
        })) as typeof fetch,
    })
    const out = await handleZaiRelay({ method: 'POST' }, d)
    expect(out.status).toBe(429)
    expect(out.body).toBe('{"error":{"code":"1113"}}')
  })

  it('streaming is refused rather than half-broken', async () => {
    // The relay buffers one JSON body; a stream:true call would hang the
    // caller until its timeout. Loud 400 beats a silent hour of that.
    const { d, seen } = deps({
      readBody: async () =>
        JSON.stringify({
          stream: true,
          messages: [{ role: 'user', content: 'x' }],
        }),
    })
    const out = await handleZaiRelay({ method: 'POST' }, d)
    expect(out.status).toBe(400)
    expect(seen).toHaveLength(0)
  })

  it('bad json and a body without messages are 400, not an upstream error', async () => {
    const bad = deps({ readBody: async () => '{oops' })
    expect((await handleZaiRelay({ method: 'POST' }, bad.d)).status).toBe(400)
    const noMsgs = deps({ readBody: async () => '{"model":"glm-5.3-flash"}' })
    expect((await handleZaiRelay({ method: 'POST' }, noMsgs.d)).status).toBe(
      400
    )
  })

  it('an upstream network failure surfaces as 502 with the cause named', async () => {
    const { d } = deps({
      readBody: async () =>
        JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
      fetchImpl: (async () => {
        throw new Error('connect ECONNREFUSED')
      }) as typeof fetch,
    })
    const out = await handleZaiRelay({ method: 'POST' }, d)
    expect(out.status).toBe(502)
    expect(out.body).toContain('ECONNREFUSED')
  })
})
