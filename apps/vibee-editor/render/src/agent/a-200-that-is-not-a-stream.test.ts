import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SKIP_LOG_PREFIX, streamModel } from './chat'
import { forgetProviderChoiceForTests } from './provider-choice'

/**
 * A 200 THAT IS NOT A STREAM. Spec: agent-provider-chain.t27 v3 (the Kie
 * route).
 *
 * Kie answers its own errors as HTTP 200 with a plain JSON body
 * (`{"code":402,"msg":...}`). Read as a stream it has no `data:` line, so it
 * looked like an EMPTY answer: one follow-up on the same route and then "no
 * answer", instead of the next provider. A vendor that ignores `stream` and
 * sends one whole completion is the opposite case: that body IS the answer.
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
const json = (o: unknown) =>
  new Response(JSON.stringify(o), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const drain = async () => {
  const events: any[] = []
  for await (const ev of streamModel([{ role: 'user', content: 'hi' }])) {
    events.push(ev)
  }
  return events
}

const KIE = 'https://api.kie.ai/gemini-2.5-flash/v1/chat/completions'

beforeEach(() => {
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('KIE_AI_API_KEY', 'k')
  vi.stubEnv('AGENT_PROVIDER', 'kie')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
})

describe('a 200 that is not a stream', () => {
  it("kie's 200 with a 402 inside is a refusal: named, logged, and the next route answers", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url))
        if (String(url) === KIE)
          return json({ code: 402, msg: 'Credits insufficient' })
        return sse('Да')
      })
    )
    const events = await drain()
    expect(calls[0]).toBe(KIE)
    expect(calls).toHaveLength(2)
    const skips = warn.mock.calls
      .map(c => String(c[0]))
      .filter(l => l.startsWith(SKIP_LOG_PREFIX))
    expect(skips).toHaveLength(1)
    expect(skips[0]).toContain('kie')
    expect(skips[0]).toContain('на ключе нет средств') // cyrillic-ok: quoted diagnose() text
    const done = events.find(e => e.kind === 'done')
    expect(done.provider).toBe('zai')
    expect(done.message.content).toBe('Да')
  })

  it('a 200 with a 401 inside reads as a bad key, not as a 200', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url) === KIE
          ? json({ code: 401, msg: 'You do not have access permissions' })
          : sse('Да')
      )
    )
    await drain()
    const skip = warn.mock.calls
      .map(c => String(c[0]))
      .find(l => l.startsWith(SKIP_LOG_PREFIX))!
    expect(skip).toContain('ключ недействителен') // cyrillic-ok: quoted diagnose() text
  })

  it('one whole completion is the answer: its text and its tool calls, one call, a bounded max_tokens', async () => {
    const bodies: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        bodies.push({ url: String(url), ...JSON.parse(init.body) })
        return json({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Готово', // cyrillic-ok: sample answer
                tool_calls: [
                  {
                    id: 'c1',
                    type: 'function',
                    function: { name: 'whoami', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        })
      })
    )
    const events = await drain()
    expect(bodies).toHaveLength(1)
    expect(bodies[0].url).toBe(KIE)
    expect(bodies[0].max_tokens).toBe(8192)
    expect(bodies[0].thinking).toBeUndefined()
    expect(events.filter(e => e.kind === 'content').map(e => e.text)).toEqual([
      'Готово', // cyrillic-ok: sample answer
    ])
    const done = events.find(e => e.kind === 'done')
    expect(done.provider).toBe('kie')
    expect(done.message.tool_calls).toHaveLength(1)
    expect(done.message.tool_calls[0].function.name).toBe('whoami')
  })

  it('a real stream is still read as a stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sse('Да'))
    )
    const events = await drain()
    const done = events.find(e => e.kind === 'done')
    expect(done.provider).toBe('kie')
    expect(done.message.content).toBe('Да')
  })
})
