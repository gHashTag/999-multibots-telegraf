import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * NOBODY IS LISTENING ANY MORE -- STOP SPENDING.
 *
 * The bot gives up on a turn at 180 seconds and stops reading. Until
 * 2026-09-16 the agent did not care: up to eight steps of 120 seconds each,
 * streaming from a paid provider and calling tools, for an answer with
 * nowhere to arrive. The only abort handling in the route was inside
 * readBody, which is finished long before the agent starts.
 *
 * These cases pin the two places a turn spends money: asking the model, and
 * running a tool. A tool is the worse of the two, because some of them send.
 */

/** One SSE frame, the shape the provider parser reads. */
const frame = (delta: unknown) =>
  `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`

function stubProvider(body: string) {
  const asked: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      asked.push(String(url))
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            const chunks = [new TextEncoder().encode(body)]
            let i = 0
            return {
              read: async () =>
                i < chunks.length
                  ? { done: false, value: chunks[i++] }
                  : { done: true, value: undefined },
              cancel: async () => undefined,
            }
          },
        },
      }
    })
  )
  return asked
}

const pool = { query: async () => ({ rows: [] }) }
const ctx = { telegramId: '144022504', pool } as never

beforeEach(() => {
  vi.resetModules()
  process.env.GLM_API_KEY = 'test-key' // secret-guard-ok: invented here
})
afterEach(() => vi.unstubAllGlobals())

describe('a turn that nobody is waiting for', () => {
  it('asks the model nothing at all when the caller is already gone', async () => {
    const asked = stubProvider(frame({ content: 'привет' }))
    const { runAgent } = await import('./src/agent/chat')
    const gone = new AbortController()
    gone.abort()
    const out: string[] = []
    for await (const ev of runAgent([], ctx, { signal: gone.signal })) {
      out.push(String((ev as Record<string, unknown>)['тип']))
    }
    expect(out).toContain('оборвано')
    expect(asked, 'a provider was paid for an answer nobody reads').toEqual([])
  })

  it('runs no further tool once the caller goes away mid-turn', async () => {
    /*
     * The decisive case. A model can ask for several tools at once, and some
     * tools SEND things. Checking once per step would have let the rest of
     * the batch run after the listener had already left.
     *
     * Both names are deliberately unknown, so nothing can actually happen
     * while the case proves that nothing is attempted.
     */
    stubProvider(
      frame({
        tool_calls: [
          {
            index: 0,
            id: 'a',
            function: { name: 'нет_такого_1', arguments: '{}' },
          },
          {
            index: 1,
            id: 'b',
            function: { name: 'нет_такого_2', arguments: '{}' },
          },
        ],
      })
    )
    const { runAgent } = await import('./src/agent/chat')
    const gone = new AbortController()
    const seen: string[] = []
    for await (const ev of runAgent([], ctx, { signal: gone.signal })) {
      const kind = String((ev as Record<string, unknown>)['тип'])
      seen.push(kind)
      // The generator is suspended on this yield: hanging up here is exactly
      // the moment the next tool would otherwise start.
      if (kind === 'инструмент') gone.abort()
    }
    expect(seen.filter(k => k === 'инструмент')).toHaveLength(1)
    expect(seen).toContain('оборвано')
  })

  it('leaves an ordinary turn alone', async () => {
    const asked = stubProvider(frame({ content: 'готово' }))
    const { runAgent } = await import('./src/agent/chat')
    const alive = new AbortController()
    const out: string[] = []
    for await (const ev of runAgent([], ctx, { signal: alive.signal })) {
      out.push(String((ev as Record<string, unknown>)['тип']))
    }
    expect(asked.length).toBeGreaterThan(0)
    expect(out).toContain('текст')
    expect(out).not.toContain('оборвано')
  })

  it('cuts the model stream itself, not just the loop around it', async () => {
    /*
     * A blind spot until it had this case: removing the signal from the
     * streamModel call left every other test green. Without it a provider
     * that answers slowly keeps streaming into a socket nobody reads, and the
     * loop only notices at the next step -- up to two minutes later.
     *
     * Hanging up has to happen while the request is IN FLIGHT, which is why
     * it happens inside the stub: once the provider loop is over the listener
     * is removed on purpose, and aborting then proves nothing.
     */
    const gone = new AbortController()
    let cutMidFlight: boolean | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: any) => {
        gone.abort()
        cutMidFlight = Boolean(init?.signal?.aborted)
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => ({ done: true, value: undefined }),
              cancel: async () => undefined,
            }),
          },
        }
      })
    )
    const { runAgent } = await import('./src/agent/chat')
    for await (const _ of runAgent([], ctx, { signal: gone.signal })) {
      // drained; the point is what reached the provider call
    }
    expect(cutMidFlight, 'hanging up did not reach the provider call').toBe(
      true
    )
  })

  it('works with no signal at all, as every other caller passes none', async () => {
    stubProvider(frame({ content: 'готово' }))
    const { runAgent } = await import('./src/agent/chat')
    const out: string[] = []
    for await (const ev of runAgent([], ctx)) {
      out.push(String((ev as Record<string, unknown>)['тип']))
    }
    expect(out).toContain('текст')
  })
})
