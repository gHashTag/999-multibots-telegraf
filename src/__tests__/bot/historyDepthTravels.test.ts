import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE DEPTH ASKED FOR HAS TO REACH THE SERVER.
 *
 * The daily plan looks for its own marker in the shared transcript -- after a
 * redeploy that marker is the only thing standing between a restart and a
 * second plan the same day. It used to look in the model's own window of
 * forty turns, and the proactive sweep writes two turns every half hour, so
 * by the afternoon the morning marker was no longer inside it.
 *
 * The caller now asks for three hundred. This checks the OTHER half: that the
 * number travels into the request. The plan's own test mocks fetchHistory, so
 * it proves the asking and nothing about the asking arriving -- a chain where
 * every unit is right and the wiring is not is this repository's most
 * expensive shape, and it has been paid for four times.
 */
describe('a deeper read of the shared conversation actually asks for it', () => {
  const urls: string[] = []

  beforeEach(() => {
    vi.resetModules()
    urls.length = 0
    process.env.RENDER_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        urls.push(String(url))
        return { ok: true, json: async () => ({ messages: [] }) }
      })
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  const depthOf = (u: string) =>
    Number(new URL(u).searchParams.get('limit') ?? 0)

  it('carries the depth the caller named', async () => {
    const { fetchHistory } = await import('@/services/trinityAgent')
    await fetchHistory('144022504', 300)
    expect(urls, 'no request was made at all').toHaveLength(1)
    expect(depthOf(urls[0])).toBe(300)
  })

  it('keeps the model window when nobody names a depth', async () => {
    // The default is what the model reads; a caller LOOKING for something
    // needs more, and must say so.
    const { fetchHistory } = await import('@/services/trinityAgent')
    await fetchHistory('144022504')
    expect(depthOf(urls[0])).toBe(40)
  })

  it('refuses to ask for more than the server will give', async () => {
    // The render clamps at 500; asking for more would silently get 500 back
    // and the caller would believe it had read further than it had.
    const { fetchHistory } = await import('@/services/trinityAgent')
    await fetchHistory('144022504', 5000)
    expect(depthOf(urls[0])).toBe(500)
  })
})
