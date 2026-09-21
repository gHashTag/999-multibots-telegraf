/**
 * A DROPPED SOCKET IS NOT A DEAD PROVIDER, AND A DEPARTED CALLER IS NOT WORK.
 *
 * Production, 20.09.2026. `[agent] provider skipped: zai: TypeError:
 * terminated` fired twice in ten minutes. Each time the forty seconds already
 * spent were thrown away and the whole call restarted from zero against a
 * slower reserve, and each time the turn then missed the bot's deadline. The
 * bot asked again; the second run charged the client for the same picture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ABORTED_BY_CALLER,
  RETRY_DROPPED_STREAM,
  RETRY_LOG_PREFIX,
  SKIP_LOG_PREFIX,
  streamModel,
} from './chat'
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

const drain = async (opts?: { signal?: AbortSignal }) => {
  const events: unknown[] = []
  for await (const ev of streamModel([{ role: 'user', content: 'hi' }], opts)) {
    events.push(ev)
  }
  return events
}

beforeEach(() => {
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('AGENT_PROVIDER', 'zai')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
})

describe('a transport death is retried on the same route', () => {
  it('the route that dropped is asked again and its answer is used', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        if (calls === 1) throw new TypeError('terminated')
        return sse('Готово')
      })
    )
    const events = await drain()
    expect(calls).toBe(2)
    expect(events[0]).toEqual({ kind: 'provider', id: 'zai', model: 'glm-5.3' })
    expect(events).toContainEqual({ kind: 'content', text: 'Готово' })
  })

  it('asking again is not the same thing as skipping a route', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        if (calls === 1) throw new TypeError('terminated')
        return sse('Готово')
      })
    )
    await drain()
    const warn = console.warn as unknown as { mock: { calls: unknown[][] } }
    const lines = warn.mock.calls.map(c => String(c[0]))
    expect(lines.filter(l => l.startsWith(RETRY_LOG_PREFIX))).toHaveLength(1)
    expect(lines.filter(l => l.startsWith(SKIP_LOG_PREFIX))).toHaveLength(0)
  })

  it('the retry is bounded, and a refusal buys no retry at all', async () => {
    // Counted against each other rather than against a literal: how many
    // routes the chain holds is a deployment's business, not this test's.
    const countCalls = async (fail: () => Promise<Response>) => {
      let calls = 0
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          calls += 1
          return fail()
        })
      )
      await expect(drain()).rejects.toThrow()
      forgetProviderChoiceForTests()
      return calls
    }

    const refused = await countCalls(async () => {
      return new Response('{"error":{"message":"Insufficient Balance"}}', {
        status: 402,
      })
    })
    const dropped = await countCalls(async () => {
      throw new TypeError('terminated')
    })

    expect(refused).toBeGreaterThan(0)
    expect(dropped).toBe(refused * (RETRY_DROPPED_STREAM + 1))
  })
})

describe('the caller going away stops the turn', () => {
  it('an already-departed caller costs no request at all', async () => {
    const fetchSpy = vi.fn(async () => sse('Готово'))
    vi.stubGlobal('fetch', fetchSpy)
    const gone = new AbortController()
    gone.abort()
    await expect(drain({ signal: gone.signal })).rejects.toThrow(
      ABORTED_BY_CALLER
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('leaving mid-stream ends the turn as abandoned, not as a provider fault', async () => {
    const gone = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        gone.abort()
        // The render passes the caller's departure down to the fetch itself.
        const reason = (init?.signal as AbortSignal | undefined)?.aborted
        throw new Error(reason ? 'This operation was aborted' : 'not wired')
      })
    )
    await expect(drain({ signal: gone.signal })).rejects.toThrow(
      ABORTED_BY_CALLER
    )
  })
})
