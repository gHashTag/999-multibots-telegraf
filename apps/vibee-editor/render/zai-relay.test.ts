import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isZaiRelayPath,
  legalizeZaiMessages,
  handleZaiRelay,
  createZaiRelayGate,
  zaiRelayKey,
  ZAI_RELAY_UPSTREAM,
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

// Upstream resolution reads the environment when deps leave it open; keep the
// environment clean so tests cannot leak into each other through it.
const RELAY_ENV = [
  'ZAI_RELAY_UPSTREAM',
  'ZAI_RELAY_MAX_INFLIGHT',
  'ZAI_RELAY_MIN_GAP_MS',
]
beforeEach(() => {
  for (const name of RELAY_ENV) delete process.env[name]
})
afterEach(() => {
  for (const name of RELAY_ENV) delete process.env[name]
})

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
    // A gate of its own per helper call: the process-wide one would carry
    // the minimum gap from one test into the next.
    gate: createZaiRelayGate(),
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

  it('injects thinking:{type:"disabled"} when the caller sent none', async () => {
    // Measured 2026-09-13: zep hard-caps each LLM HTTP call at 20s
    // (OpenAIAPITimeout, pkg/llms/llm_openai.go). The coding endpoint's
    // models are hybrid reasoners that burn 27-57s on a summary prompt and
    // IGNORE thinking:disabled -- while the normal endpoint honors it and
    // answers in ~13s with zero reasoning. Zep itself never sends the
    // parameter, so the relay must, or every zep LLM call times out.
    let sent: Record<string, unknown> = {}
    const { d } = deps({
      readBody: async () =>
        JSON.stringify({
          messages: [{ role: 'system', content: 'Summarize.' }],
        }),
      fetchImpl: (async (_u: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body))
        return new Response('{}', { status: 200 })
      }) as typeof fetch,
    })
    await handleZaiRelay({ method: 'POST' }, d)
    expect(sent.thinking).toEqual({ type: 'disabled' })
  })

  it('never overrides a thinking flag the caller set on purpose', async () => {
    let sent: Record<string, unknown> = {}
    const { d } = deps({
      readBody: async () =>
        JSON.stringify({
          thinking: { type: 'enabled' },
          messages: [{ role: 'user', content: 'think hard' }],
        }),
      fetchImpl: (async (_u: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body))
        return new Response('{}', { status: 200 })
      }) as typeof fetch,
    })
    await handleZaiRelay({ method: 'POST' }, d)
    expect(sent.thinking).toEqual({ type: 'enabled' })
  })

  it('resolves the upstream: deps first, then env, then the coding default', async () => {
    // The coding endpoint stays the default so nothing changes for existing
    // deployments; ZAI_RELAY_UPSTREAM switches the relay to the normal
    // endpoint, whose models honor thinking:disabled and fit zep's 20s.
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'x' }] })
    const viaDeps = deps({
      upstream: 'https://dep.example/v1/chat',
      readBody: async () => body,
    })
    await handleZaiRelay({ method: 'POST' }, viaDeps.d)
    expect(viaDeps.seen[0].url).toBe('https://dep.example/v1/chat')

    process.env.ZAI_RELAY_UPSTREAM = 'https://env.example/v1/chat'
    const viaEnv = deps({ readBody: async () => body })
    await handleZaiRelay({ method: 'POST' }, viaEnv.d)
    expect(viaEnv.seen[0].url).toBe('https://env.example/v1/chat')

    delete process.env.ZAI_RELAY_UPSTREAM
    const viaDefault = deps({ readBody: async () => body })
    await handleZaiRelay({ method: 'POST' }, viaDefault.d)
    expect(viaDefault.seen[0].url).toBe(ZAI_RELAY_UPSTREAM)
    expect(ZAI_RELAY_UPSTREAM).toBe(
      'https://api.z.ai/api/coding/paas/v4/chat/completions'
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

/**
 * BACKGROUND YIELDS TO THE PERSON'S TURN (measured 2026-10-06, vibee-render
 * production 05:00-11:32 UTC): 630 relay calls in 6.5 h, in bursts of 15-30,
 * against ~45 agent turns on the same Z.AI key -- the agent got 429 33 times
 * and 15 of its 45 turns ended in an error. The relay now spends at most one
 * call at a time, 3 s apart, and says 429 itself instead of asking Z.AI.
 */
describe('handleZaiRelay yields to the agent', () => {
  const body = JSON.stringify({ messages: [{ role: 'user', content: 'x' }] })

  it('over the in-flight cap: 429 with Retry-After at once, upstream untouched', async () => {
    let release: () => void = () => {}
    let calls = 0
    const gate = createZaiRelayGate()
    let t = 0
    const fetchImpl = (async () => {
      calls++
      await new Promise<void>(r => (release = r))
      return new Response('{"ok":1}', { status: 200 })
    }) as typeof fetch
    const first = handleZaiRelay(
      { method: 'POST' },
      deps({ readBody: async () => body, fetchImpl, gate, now: () => t }).d
    )
    // Let the first call reach fetch and hold its slot.
    await new Promise(r => setTimeout(r, 0))
    expect(calls).toBe(1)
    expect(gate.inFlight).toBe(1)
    t = 60_000 // far past the gap: only the cap can refuse now
    const second = await handleZaiRelay(
      { method: 'POST' },
      deps({ readBody: async () => body, fetchImpl, gate, now: () => t }).d
    )
    expect(second.status).toBe(429)
    expect(Number(second.headers?.['Retry-After'])).toBeGreaterThanOrEqual(1)
    expect(JSON.parse(second.body).error.code).toBe('relay_busy')
    expect(calls).toBe(1)
    release()
    expect((await first).status).toBe(200)
    expect(gate.inFlight).toBe(0)
  })

  it('ZAI_RELAY_MAX_INFLIGHT raises the cap', async () => {
    process.env.ZAI_RELAY_MAX_INFLIGHT = '2'
    process.env.ZAI_RELAY_MIN_GAP_MS = '0'
    const gate = createZaiRelayGate()
    gate.inFlight = 1
    const { d, seen } = deps({ readBody: async () => body, gate })
    expect((await handleZaiRelay({ method: 'POST' }, d)).status).toBe(200)
    expect(seen).toHaveLength(1)
    gate.inFlight = 2
    const full = deps({ readBody: async () => body, gate })
    expect((await handleZaiRelay({ method: 'POST' }, full.d)).status).toBe(429)
    expect(full.seen).toHaveLength(0)
  })

  it('the slot is released after an upstream throw and after a failed body read', async () => {
    const gate = createZaiRelayGate()
    let t = 0
    const thrower = deps({
      readBody: async () => body,
      gate,
      now: () => t,
      fetchImpl: (async () => {
        throw new Error('connect ECONNREFUSED')
      }) as typeof fetch,
    })
    expect((await handleZaiRelay({ method: 'POST' }, thrower.d)).status).toBe(
      502
    )
    expect(gate.inFlight).toBe(0)

    t += 10_000
    const badBody = deps({
      readBody: async () => body,
      gate,
      now: () => t,
      fetchImpl: (async () =>
        ({
          status: 200,
          text: async () => {
            throw new Error('socket hang up')
          },
        }) as unknown as Response) as typeof fetch,
    })
    await expect(handleZaiRelay({ method: 'POST' }, badBody.d)).rejects.toThrow(
      'socket hang up'
    )
    expect(gate.inFlight).toBe(0)

    // And the next call, past the gap, goes through.
    t += 10_000
    const next = deps({ readBody: async () => body, gate, now: () => t })
    expect((await handleZaiRelay({ method: 'POST' }, next.d)).status).toBe(200)
    expect(next.seen).toHaveLength(1)
  })

  it('a call sooner than the minimum gap is 429 without upstream; after it, it goes', async () => {
    const gate = createZaiRelayGate()
    let t = 1_000_000
    const first = deps({ readBody: async () => body, gate, now: () => t })
    expect((await handleZaiRelay({ method: 'POST' }, first.d)).status).toBe(200)

    t += 2_999 // default gap is 3000 ms
    const early = deps({ readBody: async () => body, gate, now: () => t })
    const out = await handleZaiRelay({ method: 'POST' }, early.d)
    expect(out.status).toBe(429)
    expect(out.headers?.['Retry-After']).toBe('1')
    expect(early.seen).toHaveLength(0)

    t += 1 // exactly 3000 ms after the last start
    const onTime = deps({ readBody: async () => body, gate, now: () => t })
    expect((await handleZaiRelay({ method: 'POST' }, onTime.d)).status).toBe(
      200
    )
    expect(onTime.seen).toHaveLength(1)
  })

  it('ZAI_RELAY_MIN_GAP_MS sets the gap, and a refusal does not restart it', async () => {
    process.env.ZAI_RELAY_MIN_GAP_MS = '10000'
    const gate = createZaiRelayGate()
    let t = 0
    const run = async () => {
      const x = deps({ readBody: async () => body, gate, now: () => t })
      return {
        out: await handleZaiRelay({ method: 'POST' }, x.d),
        seen: x.seen,
      }
    }
    expect((await run()).out.status).toBe(200)
    t = 5_000
    const early = await run()
    expect(early.out.status).toBe(429)
    expect(early.out.headers?.['Retry-After']).toBe('5')
    t = 10_000 // measured from the last START, not from the refusal
    expect((await run()).out.status).toBe(200)
  })

  it('refusals before the gate (bad bearer, bad body) do not spend a slot or the gap', async () => {
    const gate = createZaiRelayGate()
    const t = 0
    const stranger = deps({ bearerOf: () => 'Bearer nope', gate, now: () => t })
    expect((await handleZaiRelay({ method: 'POST' }, stranger.d)).status).toBe(
      403
    )
    const junk = deps({ readBody: async () => '{oops', gate, now: () => t })
    expect((await handleZaiRelay({ method: 'POST' }, junk.d)).status).toBe(400)
    const real = deps({ readBody: async () => body, gate, now: () => t })
    expect((await handleZaiRelay({ method: 'POST' }, real.d)).status).toBe(200)
  })

  it('zaiRelayKey: ZAI_RELAY_API_KEY when set, else GLM_API_KEY; blank is unset', () => {
    expect(zaiRelayKey({ GLM_API_KEY: 'shared' })).toBe('shared')
    expect(
      zaiRelayKey({ GLM_API_KEY: 'shared', ZAI_RELAY_API_KEY: 'memory-own' })
    ).toBe('memory-own')
    expect(
      zaiRelayKey({ GLM_API_KEY: 'shared', ZAI_RELAY_API_KEY: '   ' })
    ).toBe('shared')
    expect(zaiRelayKey({})).toBeUndefined()
    expect(zaiRelayKey({ GLM_API_KEY: '' })).toBeUndefined()
  })

  it('the separate key is both forwarded and expected; the shared key no longer opens the door', async () => {
    const env = { GLM_API_KEY: KEY, ZAI_RELAY_API_KEY: 'memory-own-key' }
    const auth = (seen: Array<{ init: RequestInit }>) =>
      (seen[0].init.headers as Record<string, string>).Authorization

    const zep = deps({
      readBody: async () => body,
      apiKey: () => zaiRelayKey(env),
      bearerOf: () => 'Bearer memory-own-key',
    })
    expect((await handleZaiRelay({ method: 'POST' }, zep.d)).status).toBe(200)
    expect(auth(zep.seen)).toBe('Bearer memory-own-key')

    // A caller still on the shared key cannot spend the separate one.
    const stale = deps({
      readBody: async () => body,
      apiKey: () => zaiRelayKey(env),
      bearerOf: () => `Bearer ${KEY}`,
    })
    expect((await handleZaiRelay({ method: 'POST' }, stale.d)).status).toBe(403)
    expect(stale.seen).toHaveLength(0)
  })
})
