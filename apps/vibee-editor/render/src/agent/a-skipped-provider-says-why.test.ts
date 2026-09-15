import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SKIP_LOG_PREFIX, streamModel } from './chat'
import { forgetProviderChoiceForTests } from './provider-choice'

/**
 * A SKIPPED PROVIDER SAYS WHY. Spec: t27 specs/automation/agent-provider-chain.t27
 * (SKIPPED_PROVIDER_IS_LOGGED, SKIP_LOG_PREFIX).
 *
 * 2026-09-15, vibee-render e2c4617: the reserve route was moved first by the
 * owner and the stream named zai. The diagnose() reason was collected for the
 * final "nobody answered" error only -- once a later provider succeeded it was
 * gone, and the log had no line about the reserve at all. Now every
 * fall-through is one warn line before the next provider is tried.
 */
const sse = (text: string) =>
  new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
      'data: [DONE]',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )

const drain = async () => {
  const events: unknown[] = []
  for await (const ev of streamModel([{ role: 'user', content: 'hi' }])) {
    events.push(ev)
  }
  return events
}

beforeEach(() => {
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('RESERVE_BASE_URL', 'https://vendor.example/v1')
  vi.stubEnv('RESERVE_API_KEY', 'r')
  vi.stubEnv('RESERVE_MODEL', 'some/model')
  vi.stubEnv('AGENT_PROVIDER', 'reserve')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
})

describe('a skipped provider says why', () => {
  it('an HTTP error on the first route is one warn line with the diagnose() reason, then the next route answers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url))
        if (String(url).startsWith('https://vendor.example/v1'))
          return new Response('{"error":{"message":"Insufficient Balance"}}', {
            status: 402,
          })
        return sse('Да')
      })
    )
    const events = await drain()
    expect(calls[0]).toBe('https://vendor.example/v1/chat/completions')
    expect(events[0]).toEqual({ kind: 'provider', id: 'zai', model: 'glm-5.3' })
    const skips = warn.mock.calls
      .map(c => String(c[0]))
      .filter(l => l.startsWith(SKIP_LOG_PREFIX))
    expect(skips).toHaveLength(1)
    expect(skips[0]).toContain('reserve')
    // diagnose() renders 402 as the human line about the balance, not the code.
    expect(skips[0]).toContain('на ключе нет средств') // cyrillic-ok: quoted diagnose() text
  })

  it('a thrown fetch is logged the same way, with the provider id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).startsWith('https://vendor.example/v1'))
          throw new TypeError('fetch failed: getaddrinfo ENOTFOUND')
        return sse('Да')
      })
    )
    const events = await drain()
    expect(events[0]).toEqual({ kind: 'provider', id: 'zai', model: 'glm-5.3' })
    const skips = warn.mock.calls
      .map(c => String(c[0]))
      .filter(l => l.startsWith(SKIP_LOG_PREFIX))
    expect(skips).toEqual([
      expect.stringContaining('reserve: TypeError: fetch failed'),
    ])
  })

  it('the route that answers is not logged as skipped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => sse('Да')))
    const events = await drain()
    expect(events[0]).toEqual({
      kind: 'provider',
      id: 'reserve',
      model: 'some/model',
    })
    expect(
      warn.mock.calls.some(c => String(c[0]).startsWith(SKIP_LOG_PREFIX))
    ).toBe(false)
  })

  it('the prefix is the one the spec names', () => {
    expect(SKIP_LOG_PREFIX).toBe('[agent] provider skipped:')
  })
})
