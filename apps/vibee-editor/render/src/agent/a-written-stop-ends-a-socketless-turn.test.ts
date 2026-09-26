/**
 * THE OTHER END OF THE PRESS: THE TURN ACTUALLY ASKS.
 *
 * agent-stops.ts is guarded on its own, but a record nobody reads stops
 * nothing. This drives runAgent itself with a pool that reports a stop and
 * proves the turn ends BEFORE it asks a model -- no provider call, nothing
 * spent -- and that with no stop written the same turn runs normally.
 *
 * Without this pair, the honest-looking half (a table, a route, a button)
 * could ship complete while the money kept going out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgent } from './chat'
import { forgetStopsTableForTests } from './agent-stops'

const sse = (text: string) =>
  new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
      'data: [DONE]',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )

let asked: ReturnType<typeof vi.fn>

beforeEach(() => {
  forgetStopsTableForTests()
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('AGENT_PROVIDER', 'zai')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  asked = vi.fn(async () => sse('готово'))
  vi.stubGlobal('fetch', asked)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Answers every other question with nothing; only the stop row is real. */
const poolThatSays = (stopped: boolean) => ({
  async query(q: string) {
    if (/SELECT 1 FROM agent_stops/.test(q))
      return { rows: stopped ? [{ one: 1 }] : [] }
    return { rows: [] }
  },
})

const drain = async (stopped: boolean) => {
  const out: any[] = []
  for await (const ev of runAgent(
    [{ role: 'user', content: 'привет' } as any],
    {
      telegramId: '900000077',
      pool: poolThatSays(stopped),
    } as any
  )) {
    out.push(ev)
  }
  return out
}

describe('a written stop ends a turn that has no socket', () => {
  it('with a stop: no model is asked and nothing is said', async () => {
    const out = await drain(true)
    expect(asked).not.toHaveBeenCalled()
    expect(out.map(e => e.тип)).not.toContain('провайдер') // cyrillic-ok: event envelope
    expect(out.some(e => e.текст)).toBe(false) // cyrillic-ok: event envelope
  }, 20000)

  it('without one: the very same turn runs and answers', async () => {
    const out = await drain(false)
    expect(asked).toHaveBeenCalled()
    expect(out.map(e => e.тип)).toContain('провайдер') // cyrillic-ok: event envelope
  }, 20000)
})
