import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The road's clock is module state, so every test gets a fresh module: one
 * test's ping must not count as another's recent use.
 */
async function api() {
  vi.resetModules()
  return import('./voiceApi')
}

describe('wakeRoad: reopen a quiet connection as the person starts talking', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a road never used is woken with one plain GET of the status', async () => {
    const { wakeRoad } = await api()
    expect(wakeRoad(1_000_000)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit?]
    expect(url).toMatch(/\/api\/voice\/status$/)
    // No headers and no method: a simple request, so no CORS preflight
    // doubles the road it is meant to open.
    expect(init).toBeUndefined()
  })

  it('a road used moments ago is left alone', async () => {
    const { wakeRoad, ROAD_IDLE_MS } = await api()
    wakeRoad(1_000_000)
    expect(wakeRoad(1_000_000 + ROAD_IDLE_MS - 1)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(wakeRoad(1_000_000 + ROAD_IDLE_MS)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('every real call counts as use of the road', async () => {
    const { wakeRoad, synthesize, ROAD_IDLE_MS } = await api()
    fetchMock.mockImplementation(async () => new Response(new ArrayBuffer(8)))
    await synthesize('hi', 'en', null)
    expect(wakeRoad(Date.now() + ROAD_IDLE_MS - 1000)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('an unreachable server is not an error the session sees', async () => {
    const { wakeRoad } = await api()
    fetchMock.mockImplementation(async () => {
      throw new TypeError('offline')
    })
    expect(() => wakeRoad(1_000_000)).not.toThrow()
    await new Promise(r => setTimeout(r, 0))
  })
})

describe('transcribe: the ears may also judge the end of the turn', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function answering(body: unknown) {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(body))
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('asks for the verdict only when it has somewhere to put it', async () => {
    const { transcribe } = await api()
    const fetchMock = answering({ text: 'hi' })
    await transcribe(new Blob(['x']), { lang: 'ru' })
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\?lang=ru$/)
    await transcribe(new Blob(['x']), { lang: 'ru', onTurn: () => {} })
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\?lang=ru&turn=1$/)
  })

  it("hands over the voice's verdict with the words", async () => {
    const { transcribe } = await api()
    answering({ text: ' open my week ', done: 0.21 })
    const onTurn = vi.fn()
    expect(await transcribe(new Blob(['x']), { onTurn })).toBe('open my week')
    expect(onTurn).toHaveBeenCalledWith(0.21)
  })

  it('ears that could not judge say nothing, rather than "finished"', async () => {
    const { transcribe } = await api()
    const onTurn = vi.fn()
    answering({ text: 'hi' })
    await transcribe(new Blob(['x']), { onTurn })
    answering({ text: 'hi', done: 'yes' })
    await transcribe(new Blob(['x']), { onTurn })
    expect(onTurn).not.toHaveBeenCalled()
  })
})
