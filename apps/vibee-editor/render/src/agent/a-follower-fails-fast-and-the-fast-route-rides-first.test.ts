/**
 * THE SPEED LEVERS (agent-provider-chain.t27 v5), measured into a turn.
 *
 * The 26.10 outage minutes were SILENCE: nemotron held the 120 s ceiling,
 * zai-lite 60 s of quiet, while the chain stood in line. Two rules, both
 * compiled from the spec:
 *
 *   silence_budget  -- the head keeps the whole silence window, every
 *                      follower gets half; a follower that goes quiet fails
 *                      fast into the next route;
 *   fastestFirst    -- after successes, the breaker's rolling first-byte
 *                      average reorders the REST of the chain (the head and
 *                      the owner's pick never move) when one route is faster
 *                      than another by more than SWAP_HYSTERESIS_MS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROVIDER_SILENCE_MS, streamModel } from './chat'
import {
  fastestFirst,
  forgetBreakersForTests,
  forgetHealthForTests,
  healthOf,
  recordFirstByte,
} from './provider-breaker'
import { forgetKeyRotationForTests } from './provider'
import { forgetProviderChoiceForTests } from './provider-choice'

const GLM = 'glm-4.7-flash'
const NEMO = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'

const sse = (text: string) =>
  new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
      'data: [DONE]',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )

const hanging = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError'))
    )
  })

const drain = async () => {
  const events: Array<{ kind: string }> = []
  for await (const ev of streamModel([{ role: 'user', content: 'hi' }]))
    events.push(ev)
  return events
}

beforeEach(() => {
  // The root vitest config sets KIE_AI_API_KEY for every test; these chains
  // are the ones without it.
  vi.stubEnv('KIE_AI_API_KEY', '')
  forgetBreakersForTests()
  forgetHealthForTests()
  forgetKeyRotationForTests()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
  forgetBreakersForTests()
  forgetHealthForTests()
  forgetKeyRotationForTests()
})

describe('the health order', () => {
  it('a measuredly faster follower rides before a slower one, the head never moves', () => {
    const rest = [{ id: 'zai' as const }, { id: 'nemotron' as const }]
    recordFirstByte('zai', 5000)
    recordFirstByte('nemotron', 300)
    expect(fastestFirst(rest).map(p => p.id)).toEqual(['nemotron', 'zai'])
    expect(healthOf('zai')).toBe(5000)
  })

  it('below the hysteresis nothing swaps, and an unmeasured route keeps its place', () => {
    const rest = [{ id: 'zai' as const }, { id: 'nemotron' as const }]
    recordFirstByte('zai', 1000)
    recordFirstByte('nemotron', 2000)
    expect(fastestFirst(rest).map(p => p.id)).toEqual(['zai', 'nemotron'])
    expect(fastestFirst([{ id: 'zai' as const }]).map(p => p.id)).toEqual([
      'zai',
    ])
  })

  it('a success feeds the rolling average, 70% old and 30% fresh', () => {
    recordFirstByte('zai', 1000)
    recordFirstByte('zai', 2000)
    expect(healthOf('zai')).toBe(1300)
  })
})

describe('the silence budget', () => {
  beforeEach(() => {
    vi.stubEnv('GLM_API_KEY', 'g')
    vi.stubEnv('NVIDIA_API_KEY', 'n')
    vi.stubEnv('RESERVE_BASE_URL', '')
    vi.stubEnv('ZAI_LITE_API_KEY', '')
    vi.stubEnv('AGENT_PROVIDER', '')
    vi.stubEnv('AGENT_MODEL', '')
    vi.stubEnv('OLLAMA_ENABLED', '')
    vi.stubEnv('RAILWAY_SERVICE_QUEEN_OLLAMA_URL', '')
  })

  it('the head keeps the whole silence window', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const model = JSON.parse(String(init?.body ?? '{}')).model as string
        return model === GLM ? hanging(init) : sse('nemo')
      })
    )
    const state = { done: false, error: null as Error | null }
    const events: Array<{ kind: string }> = []
    const finished = (async () => {
      try {
        for await (const ev of streamModel([{ role: 'user', content: 'hi' }]))
          events.push(ev)
      } catch (e) {
        state.error = e instanceof Error ? e : new Error(String(e))
      } finally {
        state.done = true
      }
    })()
    await vi.advanceTimersByTimeAsync(PROVIDER_SILENCE_MS + 1)
    await finished
    // The head went quiet for its full window, then the turn survived on
    // nemotron: the skip line names the silence, the answer is nemotron's.
    const lines = vi
      .mocked(console.warn)
      .mock.calls.map(c => String(c[0]))
      .join('\n')
    expect(lines).toContain('zai: молчал 60с (таймаут)')
    expect(state.error).toBeNull()
    expect(events.some(e => e.kind === 'done')).toBe(true)
  })

  it('a follower that goes quiet is cut at half the window', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const model = JSON.parse(String(init?.body ?? '{}')).model as string
        if (model === GLM)
          return new Response('{"error":{"message":"down","code":1302}}', {
            status: 429,
          })
        return hanging(init)
      })
    )
    const state = { done: false, error: null as Error | null }
    const finished = (async () => {
      try {
        for await (const ev of streamModel([{ role: 'user', content: 'hi' }]))
          void ev
      } catch (e) {
        state.error = e instanceof Error ? e : new Error(String(e))
      } finally {
        state.done = true
      }
    })()
    // zai falls in one quick 429 (code 1302 -- this key's wall), nemotron
    // the follower goes quiet: it is cut at half the head's window.
    await vi.advanceTimersByTimeAsync(PROVIDER_SILENCE_MS / 2 + 1)
    await finished
    expect(String(state.error)).toContain('nemotron: молчал 30с')
  })
})
