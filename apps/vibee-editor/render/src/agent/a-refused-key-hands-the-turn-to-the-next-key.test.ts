/**
 * A REFUSED KEY HANDS THE TURN TO THE NEXT KEY, NOT TO THE NEXT PROVIDER.
 *
 * Production, 26.10.2026 16:09 UTC: a client's turn died with every provider
 * at once -- zai 1305, kie's key invalid, zai-lite silent, nemotron at
 * NVIDIA's org ceiling. Measured the same day against the coding endpoint:
 * glm-4.5-flash answered 200 on FIVE keys of the project's pool while
 * glm-5.3/glm-4.5 answered 1210/1113 on four of them -- z.ai counts limits
 * per key (see KEY_WIDE_LIMIT_CODES), so the pool behind one route is real
 * capacity exactly when the primary key is the wall. GLM_API_KEYS carries
 * the pool; this file pins the order it is walked in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamModel } from './chat'
import { glmPoolKeys } from './provider'
import { forgetProviderChoiceForTests } from './provider-choice'

const sse = (text: string) =>
  new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
      'data: [DONE]',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )

const refused = () =>
  new Response('{"error":{"message":"limit exceeded","code":1302}}', {
    status: 429,
  })

const drain = async (opts?: { signal?: AbortSignal }) => {
  const events: unknown[] = []
  for await (const ev of streamModel([{ role: 'user', content: 'hi' }], opts)) {
    events.push(ev)
  }
  return events
}

beforeEach(() => {
  vi.stubEnv('KIE_AI_API_KEY', '')
  vi.stubEnv('GLM_API_KEY', 'k0')
  vi.stubEnv('GLM_API_KEYS', 'k0, k1 , ,k2,k0')
  vi.stubEnv('AGENT_PROVIDER', 'zai')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
})

describe('the key pool', () => {
  it('glmPoolKeys: primary first, blanks and duplicates dropped', () => {
    expect(glmPoolKeys('k0')).toEqual(['k0', 'k1', 'k2'])
  })

  it('no GLM_API_KEYS means the route carries just its primary', () => {
    vi.stubEnv('GLM_API_KEYS', '')
    expect(glmPoolKeys('k0')).toEqual(['k0'])
  })

  it('a 429 on the primary key is answered by the next key of the same route', async () => {
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: unknown, init?: { headers?: Record<string, string> }) => {
          const auth = String(init?.headers?.Authorization ?? '')
          seen.push(auth)
          if (auth === 'Bearer k0') return refused()
          return sse('Готово')
        }
      )
    )
    const events = await drain()
    expect(seen).toEqual(['Bearer k0', 'Bearer k1'])
    expect(events[0]).toEqual({
      kind: 'provider',
      id: 'zai',
      model: 'glm-4.7-flash',
    })
    expect(events).toContainEqual({ kind: 'content', text: 'Готово' })
  })

  it('an exhausted pool is one provider verdict, and the chain moves on', async () => {
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: unknown, init?: { headers?: Record<string, string> }) => {
          const auth = String(init?.headers?.Authorization ?? '')
          seen.push(auth)
          return refused()
        }
      )
    )
    await expect(drain()).rejects.toThrow('Ни один провайдер')
    // zai walks k0,k1,k2 and that is the whole turn's work for the route:
    // zai-lite reads the SAME primary key (no ZAI_LITE_API_KEY here), and the
    // key-group rule -- one key-wide limit is one wall for every route on
    // that key -- spares it three doomed calls it would answer identically.
    expect(seen).toEqual(['Bearer k0', 'Bearer k1', 'Bearer k2'])
  })

  it('a route with a key of its own walks its own pool after the head falls', async () => {
    vi.stubEnv('ZAI_LITE_API_KEY', 'k3')
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: unknown, init?: { headers?: Record<string, string> }) => {
          const auth = String(init?.headers?.Authorization ?? '')
          seen.push(auth)
          return refused()
        }
      )
    )
    await expect(drain()).rejects.toThrow('Ни один провайдер')
    // zai: k0,k1,k2. zai-lite: its own primary k3 first, then the shared
    // pool -- a different first wall, so the key-group rule does not spare
    // it, and its own pool is walked in full.
    expect(seen).toEqual([
      'Bearer k0',
      'Bearer k1',
      'Bearer k2',
      'Bearer k3',
      'Bearer k0',
      'Bearer k1',
      'Bearer k2',
    ])
  })
})
