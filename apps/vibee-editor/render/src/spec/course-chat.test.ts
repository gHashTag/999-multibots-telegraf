import crypto from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as CHAT from './course-chat.gen'
import {
  CHAT_ORIGIN,
  FREE_MODELS,
  chatCorsHeaders,
  clientAddress,
  forgetChatWindowsForTests,
  freeChain,
  globalCap,
  handleChat,
  isProxyPeer,
  systemPrompt,
  REASON_NAMES,
  type ChatDeps,
  type ChatRequest,
} from '../agent/course-chat'
import { courseKeySecret, mintKey } from '../agent/course-access'

// The page's contract of record, copied from trinity at this commit
// (Trinity-S-AI-DNA/trinity#1894, course-chat.gen.ts at 565867b0ddf3cc15c80df7f6d41f4be69c51c7d5).
const TRINITY_COMMIT = '565867b0ddf3cc15c80df7f6d41f4be69c51c7d5'
const GEN_SHA256 =
  '2967e297411b692d28bd80fa22dd55a359e19c1607ad2d30011a66e5b5376666'

const NOW = new Date('2026-11-14T10:00:00Z')
const SIGNING = 'x'.repeat(40)

/** A request that came through Caddy: the peer is loopback, XFF ends with the real address. */
function viaProxy(real: string, forged?: string, method = 'POST'): ChatRequest {
  return {
    method,
    url: CHAT.CHAT_ROUTE,
    headers: {
      'x-forwarded-for': forged ? `${forged}, ${real}` : real,
    },
    socket: { remoteAddress: '127.0.0.1' },
  }
}

function deps(body: unknown, extra: Partial<ChatDeps> = {}): ChatDeps {
  return {
    readBody: async () =>
      typeof body === 'string' ? body : JSON.stringify(body),
    now: () => NOW,
    log: () => {},
    ...extra,
  }
}

function good(over: Record<string, unknown> = {}) {
  return {
    course: 'vibecoding',
    lesson: 'l1',
    title: 'First lesson',
    message: 'What is a prompt?',
    ...over,
  }
}

function modelOk(text = 'A prompt is an instruction.') {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: text } }] }),
        { status: 200 }
      )
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

beforeEach(() => {
  forgetChatWindowsForTests()
  vi.stubEnv('SESSION_SIGNING_KEY', SIGNING)
  vi.stubEnv('GLM_API_KEY', 'glm-test-key')
  // Unset: the spec's own CHAT_GLOBAL_DAY applies. The env var may only lower it.
  vi.stubEnv('CHAT_GLOBAL_DAY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('the contract file', () => {
  it('is byte-identical to the trinity copy and names its commit', () => {
    const file = fileURLToPath(new URL('./course-chat.gen.ts', import.meta.url))
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(file))
      .digest('hex')
    // Drift fails here: regenerate from trinity at a new commit, then change
    // both TRINITY_COMMIT and GEN_SHA256 in this test, on purpose.
    expect(TRINITY_COMMIT).toMatch(/^[0-9a-f]{40}$/)
    expect(sha).toBe(GEN_SHA256)
  })

  it('keeps the numbers of the brief', () => {
    expect(CHAT.CHAT_PER_IP_HOUR).toBe(50)
    expect(CHAT.CHAT_PER_KEY_DAY).toBe(60)
    expect(CHAT.CHAT_MSG_MAX).toBe(600)
    expect(CHAT.CHAT_TITLE_MAX).toBe(120)
    expect(CHAT.CHAT_ANSWER_MAX).toBe(1200)
    expect(CHAT.CHAT_GLOBAL_DAY).toBe(500)
    expect(CHAT.CHAT_TURNS_MAX).toBe(8)
    expect(CHAT.CHAT_PAID_FALLBACK).toBe(0)
    expect([...CHAT.CHAT_COURSES]).toEqual(['vibecoding'])
  })

  it('names every reason the spec defines, busy included, the way the page reads it', () => {
    const reasons = Object.entries(CHAT).filter(([k]) =>
      k.startsWith('REASON_')
    )
    expect(reasons.length).toBe(9)
    for (const [k, v] of reasons)
      expect(REASON_NAMES[v as number]).toBe(k.slice(7).toLowerCase())
    expect(REASON_NAMES[CHAT.REASON_BUSY]).toBe('busy')
  })
})

describe('free models only', () => {
  it('the chain holds zai and zai-lite, pinned, even with paid keys and AGENT_MODEL in the env', () => {
    vi.stubEnv('KIE_AI_API_KEY', 'kie-paid-key')
    vi.stubEnv('NVIDIA_API_KEY', 'nv-key')
    vi.stubEnv('RESERVE_API_KEY', 'reserve-key')
    vi.stubEnv('RESERVE_BASE_URL', 'https://reserve.invalid/v1')
    vi.stubEnv('RESERVE_MODEL', 'paid-model')
    vi.stubEnv('AGENT_PROVIDER', 'kie')
    vi.stubEnv('AGENT_MODEL', 'glm-5.3')
    const chain = freeChain()
    expect(chain.map(p => p.id)).toEqual(['zai', 'zai-lite'])
    expect(chain.map(p => p.model)).toEqual([
      FREE_MODELS.zai,
      FREE_MODELS['zai-lite'],
    ])
    expect(Object.keys(FREE_MODELS).sort()).toEqual(['zai', 'zai-lite'])
  })

  it('a call with paid keys present never reaches a paid host or sends a paid key', async () => {
    vi.stubEnv('KIE_AI_API_KEY', 'kie-paid-key')
    vi.stubEnv('RESERVE_API_KEY', 'reserve-key')
    vi.stubEnv('RESERVE_BASE_URL', 'https://reserve.invalid/v1')
    vi.stubEnv('RESERVE_MODEL', 'paid-model')
    vi.stubEnv('AGENT_PROVIDER', 'kie')
    const seen: { url: string; auth: string; model: string }[] = []
    // Every free route fails, so a leak to a paid one would show up as a call.
    const f = vi.fn(async (url: any, init: any) => {
      seen.push({
        url: String(url),
        auth: init.headers.Authorization,
        model: JSON.parse(init.body).model,
      })
      return new Response('{"error":"down"}', { status: 500 })
    }) as unknown as typeof fetch
    const out = await handleChat(
      viaProxy('203.0.113.1'),
      deps(good(), { fetch: f })
    )
    expect(out.status).toBe(502)
    expect(seen.length).toBeGreaterThan(0)
    for (const s of seen) {
      expect(s.url).toContain('api.z.ai')
      expect(s.auth).toBe('Bearer glm-test-key')
      expect(['glm-4.7-flash', 'glm-4.5-flash']).toContain(s.model)
    }
  })

  it('without the free key the route answers 503 no_key and calls nothing, paid key or not', async () => {
    vi.stubEnv('GLM_API_KEY', '')
    vi.stubEnv('KIE_AI_API_KEY', 'kie-paid-key')
    const f = modelOk()
    const out = await handleChat(
      viaProxy('203.0.113.2'),
      deps(good(), { fetch: f })
    )
    expect(out.status).toBe(503)
    expect(out.body).toMatchObject({ ok: false, offline: true, reason: 'off' })
    expect(out.body.detail).toBe('no_key')
    expect(f).not.toHaveBeenCalled()
  })

  it('falls to the second free model when the first is refused', async () => {
    const models: string[] = []
    const f = vi.fn(async (_u: any, init: any) => {
      models.push(JSON.parse(init.body).model)
      return models.length === 1
        ? new Response('{"error":{"code":"1305"}}', { status: 429 })
        : new Response(
            JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
            { status: 200 }
          )
    }) as unknown as typeof fetch
    const out = await handleChat(
      viaProxy('203.0.113.3'),
      deps(good(), { fetch: f })
    )
    expect(out).toEqual({ status: 200, body: { ok: true, answer: 'ok' } })
    expect(models).toEqual(['glm-4.7-flash', 'glm-4.5-flash'])
  })
})

describe('who is asking', () => {
  it('takes the hop the proxy appended, not what the reader sent', () => {
    expect(clientAddress(viaProxy('203.0.113.5', '9.9.9.9'))).toBe(
      '203.0.113.5'
    )
    expect(
      clientAddress({
        headers: { 'x-forwarded-for': ['1.1.1.1', '2.2.2.2, 198.51.100.7'] },
        socket: { remoteAddress: '::ffff:172.18.0.1' },
      })
    ).toBe('198.51.100.7')
  })

  it('counts a direct public peer by the peer, ignoring any header', () => {
    expect(
      clientAddress({
        headers: { 'x-forwarded-for': '10.0.0.1' },
        socket: { remoteAddress: '198.51.100.20' },
      })
    ).toBe('198.51.100.20')
  })

  it('falls back to the peer when the last hop is not an address', () => {
    expect(
      clientAddress({
        headers: { 'x-forwarded-for': 'not-an-address' },
        socket: { remoteAddress: '127.0.0.1' },
      })
    ).toBe('127.0.0.1')
  })

  it('knows the proxy side of the wire', () => {
    for (const a of [
      '127.0.0.1',
      '::1',
      '10.1.2.3',
      '172.18.0.1',
      '192.168.1.1',
      '::ffff:172.17.0.1',
    ])
      expect(isProxyPeer(a)).toBe(true)
    for (const a of ['203.0.113.9', '172.32.0.1', '8.8.8.8', '', undefined])
      expect(isProxyPeer(a)).toBe(false)
  })

  it('a forged X-Forwarded-For cannot reset the hourly window', async () => {
    const f = modelOk()
    for (let i = 0; i < CHAT.CHAT_PER_IP_HOUR; i++) {
      const out = await handleChat(
        viaProxy('203.0.113.50', `10.0.0.${i}`),
        deps(good(), { fetch: f })
      )
      expect(out.status).toBe(200)
    }
    const over = await handleChat(
      viaProxy('203.0.113.50', '10.9.9.9'),
      deps(good(), { fetch: f })
    )
    expect(over.status).toBe(429)
    expect(over.body).toMatchObject({
      ok: false,
      offline: true,
      reason: 'limit',
    })
    expect(f).toHaveBeenCalledTimes(CHAT.CHAT_PER_IP_HOUR)
  })

  it('another real address has its own window, and the hour rolls', async () => {
    const f = modelOk()
    let t = NOW.getTime()
    const at = () => new Date(t)
    for (let i = 0; i < CHAT.CHAT_PER_IP_HOUR; i++)
      await handleChat(
        viaProxy('203.0.113.60'),
        deps(good(), { fetch: f, now: at })
      )
    expect(
      (
        await handleChat(
          viaProxy('203.0.113.60'),
          deps(good(), { fetch: f, now: at })
        )
      ).status
    ).toBe(429)
    expect(
      (
        await handleChat(
          viaProxy('203.0.113.61'),
          deps(good(), { fetch: f, now: at })
        )
      ).status
    ).toBe(200)
    t += 60 * 60 * 1000 + 1
    expect(
      (
        await handleChat(
          viaProxy('203.0.113.60'),
          deps(good(), { fetch: f, now: at })
        )
      ).status
    ).toBe(200)
  })
})

describe('the key window', () => {
  const key = (learner = 'learner-1') =>
    mintKey(1, learner, 30, NOW, courseKeySecret()!)

  it('60 calls a day per key, from any addresses; the 61st is refused with no model call', async () => {
    const f = modelOk()
    const k = key()
    for (let i = 0; i < CHAT.CHAT_PER_KEY_DAY; i++) {
      const out = await handleChat(
        viaProxy(`198.51.100.${(i % 200) + 1}`, undefined),
        deps(good({ key: k }), { fetch: f })
      )
      expect(out.status).toBe(200)
    }
    const over = await handleChat(
      viaProxy('192.0.2.1'),
      deps(good({ key: k }), { fetch: f })
    )
    expect(over.status).toBe(429)
    expect(f).toHaveBeenCalledTimes(CHAT.CHAT_PER_KEY_DAY)
    // Another reader's key is a different window.
    const other = await handleChat(
      viaProxy('192.0.2.2'),
      deps(good({ key: key('learner-2') }), { fetch: f })
    )
    expect(other.status).toBe(200)
  })

  it('a made-up key gets no window of its own: the address window still binds', async () => {
    const f = modelOk()
    for (let i = 0; i < CHAT.CHAT_PER_IP_HOUR; i++)
      await handleChat(
        viaProxy('203.0.113.70'),
        deps(good({ key: `garbage-${i}` }), { fetch: f })
      )
    const over = await handleChat(
      viaProxy('203.0.113.70'),
      deps(good({ key: 'garbage-new' }), { fetch: f })
    )
    expect(over.status).toBe(429)
    expect(f).toHaveBeenCalledTimes(CHAT.CHAT_PER_IP_HOUR)
  })
})

describe('the global daily cap', () => {
  it('the default is the spec constant: unset, junk or larger env values leave it alone', () => {
    for (const v of ['', '0', '-3', 'abc', '1.5', '500', '501', '100000']) {
      vi.stubEnv('CHAT_GLOBAL_DAY', v)
      expect(globalCap()).toBe(CHAT.CHAT_GLOBAL_DAY)
    }
    // The env var may only LOWER the ceiling.
    for (const v of ['1', '3', '499']) {
      vi.stubEnv('CHAT_GLOBAL_DAY', v)
      expect(globalCap()).toBe(Number(v))
    }
  })

  it('without any env the route answers up to the spec cap, then 503 busy with no model call', async () => {
    const f = modelOk()
    const from = (i: number) =>
      viaProxy(`198.51.${Math.floor(i / 200)}.${(i % 200) + 1}`)
    for (let i = 0; i < CHAT.CHAT_GLOBAL_DAY; i++)
      expect(
        (await handleChat(from(i), deps(good(), { fetch: f }))).status
      ).toBe(200)
    expect(f).toHaveBeenCalledTimes(CHAT.CHAT_GLOBAL_DAY)
    const over = await handleChat(
      from(CHAT.CHAT_GLOBAL_DAY),
      deps(good(), { fetch: f })
    )
    expect(over.status).toBe(503)
    expect(over.body).toEqual({
      ok: false,
      offline: true,
      reason: 'busy',
      detail: 'global',
    })
    expect(f).toHaveBeenCalledTimes(CHAT.CHAT_GLOBAL_DAY)
  })

  it('refuses past a lowered cap for every reader together with 503 busy, and resets on the next UTC day', async () => {
    vi.stubEnv('CHAT_GLOBAL_DAY', '3')
    const f = modelOk()
    let t = NOW.getTime()
    const at = () => new Date(t)
    for (let i = 1; i <= 3; i++)
      expect(
        (
          await handleChat(
            viaProxy(`203.0.113.${90 + i}`),
            deps(good(), { fetch: f, now: at })
          )
        ).status
      ).toBe(200)
    const over = await handleChat(
      viaProxy('203.0.113.99'),
      deps(good(), { fetch: f, now: at })
    )
    expect(over.status).toBe(503)
    expect(over.body).toMatchObject({ reason: 'busy', detail: 'global' })
    expect(f).toHaveBeenCalledTimes(3)
    t += 24 * 60 * 60 * 1000
    expect(
      (
        await handleChat(
          viaProxy('203.0.113.99'),
          deps(good(), { fetch: f, now: at })
        )
      ).status
    ).toBe(200)
  })
})

describe('the probe', () => {
  const probe = (over: Record<string, unknown> = {}) => ({
    course: 'vibecoding',
    probe: true,
    ...over,
  })

  it('answers 200 {ok, probe} with no model call and logs no text', async () => {
    const f = modelOk()
    const lines: string[] = []
    const out = await handleChat(
      viaProxy('203.0.113.120'),
      deps(probe(), { fetch: f, log: l => lines.push(l) })
    )
    expect(out).toEqual({ status: 200, body: { ok: true, probe: true } })
    expect(f).not.toHaveBeenCalled()
    expect(lines).toEqual(['[course-chat] status=200 probe'])
  })

  it('touches no window: a hundred probes leave the address its whole hour', async () => {
    const f = modelOk()
    for (let i = 0; i < 100; i++)
      await handleChat(viaProxy('203.0.113.121'), deps(probe(), { fetch: f }))
    for (let i = 0; i < CHAT.CHAT_PER_IP_HOUR; i++)
      expect(
        (
          await handleChat(
            viaProxy('203.0.113.121'),
            deps(good(), { fetch: f })
          )
        ).status
      ).toBe(200)
    expect(
      (await handleChat(viaProxy('203.0.113.121'), deps(good(), { fetch: f })))
        .status
    ).toBe(429)
    expect(f).toHaveBeenCalledTimes(CHAT.CHAT_PER_IP_HOUR)
  })

  it('counts nothing against the day: probes do not eat the shared cap', async () => {
    vi.stubEnv('CHAT_GLOBAL_DAY', '3')
    const f = modelOk()
    for (let i = 0; i < 10; i++)
      await handleChat(
        viaProxy(`203.0.113.${130 + i}`),
        deps(probe(), { fetch: f })
      )
    for (let i = 0; i < 3; i++)
      expect(
        (
          await handleChat(
            viaProxy(`203.0.113.${150 + i}`),
            deps(good(), { fetch: f })
          )
        ).status
      ).toBe(200)
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('a course outside the list is 404 even for a probe, with no model call', async () => {
    const f = modelOk()
    const out = await handleChat(
      viaProxy('203.0.113.122'),
      deps(probe({ course: 'other' }), { fetch: f })
    )
    expect(out.status).toBe(404)
    expect(out.body).toMatchObject({ ok: false, offline: true, reason: 'off' })
    expect(f).not.toHaveBeenCalled()
  })

  it('without the free key a probe is 503 no_key, so the panel stays honest', async () => {
    vi.stubEnv('GLM_API_KEY', '')
    vi.stubEnv('KIE_AI_API_KEY', 'kie-paid-key')
    const f = modelOk()
    const out = await handleChat(
      viaProxy('203.0.113.123'),
      deps(probe(), { fetch: f })
    )
    expect(out.status).toBe(503)
    expect(out.body).toMatchObject({ ok: false, offline: true })
    expect(out.body.detail).toBe('no_key')
    expect(f).not.toHaveBeenCalled()
  })

  it('at the day cap a probe is 503 busy, and still counts nothing', async () => {
    vi.stubEnv('CHAT_GLOBAL_DAY', '1')
    const f = modelOk()
    expect(
      (await handleChat(viaProxy('203.0.113.124'), deps(good(), { fetch: f })))
        .status
    ).toBe(200)
    for (let i = 0; i < 3; i++) {
      const out = await handleChat(
        viaProxy('203.0.113.125'),
        deps(probe(), { fetch: f })
      )
      expect(out.status).toBe(503)
      expect(out.body).toMatchObject({ reason: 'busy', detail: 'global' })
    }
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('a probe that is not a boolean is 400; probe false is an ordinary message', async () => {
    const f = modelOk()
    for (const p of ['true', 1, null, {}])
      expect(
        (
          await handleChat(
            viaProxy('203.0.113.126'),
            deps(good({ probe: p }), { fetch: f })
          )
        ).status
      ).toBe(400)
    expect(f).not.toHaveBeenCalled()
    const out = await handleChat(
      viaProxy('203.0.113.127'),
      deps(good({ probe: false }), { fetch: f })
    )
    expect(out.status).toBe(200)
    expect(out.body.answer).toBeTruthy()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('only POST: a GET probe is 405', async () => {
    const f = modelOk()
    const out = await handleChat(
      viaProxy('203.0.113.128', undefined, 'GET'),
      deps(probe(), { fetch: f })
    )
    expect(out.status).toBe(405)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('the turn of the conversation', () => {
  it('a turn at the cap is 429 limit, before any window, with no model call', async () => {
    const f = modelOk()
    const out = await handleChat(
      viaProxy('203.0.113.140'),
      deps(good({ turn: CHAT.CHAT_TURNS_MAX }), { fetch: f })
    )
    expect(out.status).toBe(429)
    expect(out.body).toMatchObject({
      ok: false,
      offline: true,
      reason: 'limit',
    })
    expect(f).not.toHaveBeenCalled()
  })

  it('records nothing: refused turns leave the address and key windows whole', async () => {
    const f = modelOk()
    const k = mintKey(1, 'learner-turns', 30, NOW, courseKeySecret()!)
    for (let i = 0; i < 50; i++)
      expect(
        (
          await handleChat(
            viaProxy('203.0.113.141'),
            deps(good({ turn: CHAT.CHAT_TURNS_MAX + i, key: k }), { fetch: f })
          )
        ).status
      ).toBe(429)
    for (let i = 0; i < CHAT.CHAT_PER_IP_HOUR; i++)
      expect(
        (
          await handleChat(
            viaProxy('203.0.113.141'),
            deps(good({ turn: 0, key: k }), { fetch: f })
          )
        ).status
      ).toBe(200)
    expect(f).toHaveBeenCalledTimes(CHAT.CHAT_PER_IP_HOUR)
  })

  it('the last turn below the cap answers; an absent turn counts as the first', async () => {
    const f = modelOk()
    expect(
      (
        await handleChat(
          viaProxy('203.0.113.142'),
          deps(good({ turn: CHAT.CHAT_TURNS_MAX - 1 }), { fetch: f })
        )
      ).status
    ).toBe(200)
    expect(
      (await handleChat(viaProxy('203.0.113.143'), deps(good(), { fetch: f })))
        .status
    ).toBe(200)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a turn that is not a whole number from zero up is 400, with no model call', async () => {
    const f = modelOk()
    for (const t of ['3', null, 1.5, -1, true, [], {}])
      expect(
        (
          await handleChat(
            viaProxy('203.0.113.144'),
            deps(good({ turn: t }), { fetch: f })
          )
        ).status
      ).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })

  it('keeps the spec order: a bad request or another course is answered before the turn cap', async () => {
    const f = modelOk()
    const late = CHAT.CHAT_TURNS_MAX + 5
    expect(
      (
        await handleChat(
          viaProxy('203.0.113.145'),
          deps(good({ turn: late, message: 'a'.repeat(601) }), { fetch: f })
        )
      ).status
    ).toBe(400)
    expect(
      (
        await handleChat(
          viaProxy('203.0.113.145'),
          deps(good({ turn: late, course: 'other' }), { fetch: f })
        )
      ).status
    ).toBe(404)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('the request', () => {
  it('a course other than vibecoding is 404', async () => {
    const f = modelOk()
    const out = await handleChat(
      viaProxy('203.0.113.100'),
      deps(good({ course: 'other' }), { fetch: f })
    )
    expect(out.status).toBe(404)
    expect(f).not.toHaveBeenCalled()
  })

  it('a message of 601 characters is 400; 600 is fine; empty is 400', async () => {
    const f = modelOk()
    const run = (message: unknown, ip: string) =>
      handleChat(viaProxy(ip), deps(good({ message }), { fetch: f }))
    expect((await run('a'.repeat(601), '203.0.113.101')).status).toBe(400)
    expect((await run('', '203.0.113.102')).status).toBe(400)
    expect((await run('a'.repeat(600), '203.0.113.103')).status).toBe(200)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('a title over 120 is 400; a missing title is fine', async () => {
    const f = modelOk()
    expect(
      (
        await handleChat(
          viaProxy('203.0.113.104'),
          deps(good({ title: 't'.repeat(121) }), { fetch: f })
        )
      ).status
    ).toBe(400)
    const { title: _t, ...noTitle } = good()
    expect(
      (await handleChat(viaProxy('203.0.113.105'), deps(noTitle, { fetch: f })))
        .status
    ).toBe(200)
  })

  it('bad JSON, a non-object, a non-string message and a GET are refused with no model call', async () => {
    const f = modelOk()
    const run = (b: unknown, method = 'POST') =>
      handleChat(
        viaProxy('203.0.113.106', undefined, method),
        deps(b, { fetch: f })
      )
    expect((await run('{nope')).status).toBe(400)
    expect((await run('[1,2]')).status).toBe(400)
    expect((await run('null')).status).toBe(400)
    expect((await run(good({ message: 42 }))).status).toBe(400)
    expect((await run(good({ title: 7 }))).status).toBe(400)
    expect((await run(good(), 'GET')).status).toBe(405)
    expect(f).not.toHaveBeenCalled()
  })

  it('a body the reader refuses (too large, too slow) is a 400, not a crash', async () => {
    const out = await handleChat(viaProxy('203.0.113.107'), {
      readBody: async () => {
        throw new Error('readBody: body too large')
      },
      now: () => NOW,
      log: () => {},
    })
    expect(out.status).toBe(400)
  })
})

describe('the answer', () => {
  it('returns {ok, answer}, clamped to the answer limit, think blocks removed', async () => {
    const long = '<think>secret chain</think>' + 'z'.repeat(2000)
    const out = await handleChat(
      viaProxy('203.0.113.110'),
      deps(good(), { fetch: modelOk(long) })
    )
    expect(out.status).toBe(200)
    expect(out.body.ok).toBe(true)
    expect((out.body.answer as string).length).toBe(CHAT.CHAT_ANSWER_MAX)
    expect(out.body.answer as string).not.toContain('think')
  })

  it('sends the spec prompt with the lesson clause only when there is a title', async () => {
    let sent: any
    const f = vi.fn(async (_u: any, init: any) => {
      sent = JSON.parse(init.body)
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 }
      )
    }) as unknown as typeof fetch
    await handleChat(viaProxy('203.0.113.111'), deps(good(), { fetch: f }))
    expect(sent.messages[0]).toEqual({
      role: 'system',
      content: systemPrompt('vibecoding', 'First lesson'),
    })
    expect(sent.messages[1]).toEqual({
      role: 'user',
      content: 'What is a prompt?',
    })
    expect(sent.messages[0].content).toContain(CHAT.CHAT_PROMPT_LESSON)
    expect(systemPrompt('vibecoding', '')).not.toContain(
      CHAT.CHAT_PROMPT_LESSON
    )
    expect(sent.tools).toBeUndefined()
  })

  it('an empty model answer is 502 empty; an unreachable model is 502 unreachable', async () => {
    const empty = await handleChat(
      viaProxy('203.0.113.112'),
      deps(good(), { fetch: modelOk('   ') })
    )
    expect(empty.status).toBe(502)
    expect(empty.body).toMatchObject({
      ok: false,
      offline: true,
      reason: 'empty',
    })
    const down = await handleChat(
      viaProxy('203.0.113.113'),
      deps(good(), {
        fetch: vi.fn(async () => {
          throw new Error('ECONNREFUSED')
        }) as unknown as typeof fetch,
      })
    )
    expect(down.status).toBe(502)
    expect(down.body).toMatchObject({ reason: 'unreachable' })
  })

  it('a model that never answers is cut at the timeout: 504 timeout', async () => {
    vi.useFakeTimers()
    const f = vi.fn(
      (_u: any, init: any) =>
        new Promise((_res, rej) =>
          init.signal.addEventListener('abort', () => rej(new Error('aborted')))
        )
    ) as unknown as typeof fetch
    const p = handleChat(viaProxy('203.0.113.114'), deps(good(), { fetch: f }))
    await vi.advanceTimersByTimeAsync(CHAT.CHAT_TIMEOUT_MS)
    const out = await p
    expect(out.status).toBe(504)
    expect(out.body).toMatchObject({ reason: 'timeout' })
  })
})

describe('logs carry counts and key ids, never text or keys', () => {
  it('no log line holds the message, the title, the answer or any key', async () => {
    const lines: string[] = []
    const k = mintKey(1, 'learner-9', 30, NOW, courseKeySecret()!)
    await handleChat(
      viaProxy('203.0.113.120'),
      deps(
        good({
          message: 'my secret question zebra',
          title: 'Hidden Lesson',
          key: k,
        }),
        { fetch: modelOk('a secret answer yak'), log: l => lines.push(l) }
      )
    )
    // A refusal path too.
    await handleChat(
      viaProxy('203.0.113.121'),
      deps(good({ message: 'a'.repeat(601) }), { log: l => lines.push(l) })
    )
    const all = lines.join('\n')
    expect(lines.length).toBe(2)
    for (const secret of [
      'zebra',
      'Hidden Lesson',
      'yak',
      k,
      'glm-test-key',
      SIGNING,
      'learner-9',
    ])
      expect(all).not.toContain(secret)
    expect(all).toMatch(/status=200 .*ip_n=0 key_n=0 key=[0-9a-f]{10} /)
  })
})

describe('CORS for the page origin only', () => {
  it('answers for exactly https://t27.ai and nothing else', () => {
    const ok = chatCorsHeaders(CHAT.CHAT_ROUTE, CHAT_ORIGIN)!
    expect(ok['Access-Control-Allow-Origin']).toBe('https://t27.ai')
    expect(ok['Access-Control-Allow-Methods']).toBe('POST, OPTIONS')
    expect(ok['Access-Control-Allow-Headers']).toBe('Content-Type')
    for (const o of [
      undefined,
      'https://t27.ai.evil.example',
      'http://t27.ai',
      'https://evil.example',
      'null',
      '*',
    ]) {
      const h = chatCorsHeaders(CHAT.CHAT_ROUTE, o)!
      expect(h['Access-Control-Allow-Origin']).toBeNull()
      expect(h['Access-Control-Allow-Methods']).toBeNull()
    }
  })

  it('leaves every other path to the server-wide answer', () => {
    expect(chatCorsHeaders('/api/course/key', CHAT_ORIGIN)).toBeNull()
    expect(chatCorsHeaders('/api/course/checkout', CHAT_ORIGIN)).toBeNull()
    expect(chatCorsHeaders('/health', undefined)).toBeNull()
  })

  it('the server applies the override before it answers OPTIONS', () => {
    const src = fs.readFileSync(
      fileURLToPath(new URL('../../render-server.ts', import.meta.url)),
      'utf8'
    )
    const cors = src.indexOf('chatCorsHeaders(')
    const options = src.indexOf("req.method === 'OPTIONS'")
    expect(cors).toBeGreaterThan(0)
    expect(options).toBeGreaterThan(cors)
    // The chat dispatch sits before the course doors and reads a small body.
    expect(src).toContain('CHAT_BODY_MAX')
  })
})
