/**
 * A LONG TOOL SAYS IT IS ALIVE.
 *
 * Production, 20.09.2026: one `image_edit` ran 170 seconds and the stream
 * carried nothing at all in the meantime. The bot could only measure total
 * elapsed time, so it gave up 10 seconds AFTER the picture had landed in the
 * bucket and replayed the turn -- charging the client a second time for the
 * same picture. With a tick while the tool runs, the caller can wait on
 * silence instead of on the clock.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { TOOL_HEARTBEAT_MS, withHeartbeat, runAgent } from './chat'

afterEach(() => vi.useRealTimers())

/** Drive the generator to completion under fake time. */
async function run(work: Promise<unknown>) {
  const ticks: Array<{ имя: string; мс: number }> = [] // cyrillic-ok: event envelope fields
  const it = withHeartbeat('image_edit', Date.now(), work)
  const pump = (async () => {
    for (;;) {
      const step = await it.next()
      if (step.done) return step.value
      ticks.push(step.value as { имя: string; мс: number }) // cyrillic-ok: event envelope fields
    }
  })()
  return { ticks, pump }
}

describe('a tool that answers at once', () => {
  it('costs no ticks at all', async () => {
    const { ticks, pump } = await run(Promise.resolve({ ok: true }))
    expect(await pump).toEqual({ ok: true })
    expect(ticks).toEqual([])
  })

  it('a thrown handler becomes a tool result, never a throw', async () => {
    const { pump } = await run(Promise.reject(new Error('KIE said no')))
    expect(await pump).toEqual({ ошибка: 'Error: KIE said no' }) // cyrillic-ok: tool result key
  })
})

describe('a tool that takes minutes', () => {
  it('ticks once per interval and still returns the real value', async () => {
    vi.useFakeTimers()
    let done: (v: unknown) => void = () => {}
    const work = new Promise(resolve => {
      done = resolve
    })
    const { ticks, pump } = await run(work)

    await vi.advanceTimersByTimeAsync(TOOL_HEARTBEAT_MS * 3 + 1)
    expect(ticks).toHaveLength(3)
    expect(ticks[0]?.имя).toBe('image_edit') // cyrillic-ok: event envelope field
    expect(ticks[2]?.мс).toBeGreaterThanOrEqual(TOOL_HEARTBEAT_MS * 3) // cyrillic-ok: event envelope field

    done({ url: 'https://example/one.png' })
    await vi.advanceTimersByTimeAsync(1)
    expect(await pump).toEqual({ url: 'https://example/one.png' })
    // Nothing is left ticking after the answer arrives.
    const seen = ticks.length
    await vi.advanceTimersByTimeAsync(TOOL_HEARTBEAT_MS * 2)
    expect(ticks).toHaveLength(seen)
  })

  it('the interval is short enough to matter against a 170-second tool', () => {
    expect(TOOL_HEARTBEAT_MS).toBeLessThanOrEqual(30_000)
  })
})

describe('a caller who has already left', () => {
  it('buys no model call and no events at all', async () => {
    const calls = vi.fn()
    vi.stubGlobal('fetch', calls)
    const gone = new AbortController()
    gone.abort()

    const seen: Array<Record<string, unknown>> = []
    for await (const ev of runAgent(
      [{ role: 'user', content: 'сделай картинку' }],
      /* Only the id matters to this test; the rest of ToolContext is not
         exercised, and main's typecheck was red on the bare literal. */
      { telegramId: '555' } as Parameters<typeof runAgent>[1],
      { signal: gone.signal }
    ))
      seen.push(ev)

    // The turn id goes out before the first step -- it is free and the
    // caller's transcript needs it. Nothing else does: no model call, no
    // tool, nothing that could spend.
    expect(seen.map(e => e['тип'])).toEqual(['ход']) // cyrillic-ok: envelope
    expect(calls).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
