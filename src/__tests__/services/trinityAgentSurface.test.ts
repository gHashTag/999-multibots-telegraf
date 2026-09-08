import { describe, it, expect, vi, afterEach } from 'vitest'

/** The surface travels in the request: the server shapes the prompt by it. */
describe('спроситьАгента carries the surface', () => {
  afterEach(() => vi.unstubAllGlobals())
  const stub = () => {
    const bodies: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        if (String(url).includes('/api/agent/history'))
          return { ok: true, status: 200, json: async () => ({ messages: [] }) }
        bodies.push(JSON.parse(String(init?.body ?? '{}')))
        return {
          ok: true,
          status: 200,
          body: null,
          text: async () => '',
          json: async () => ({}),
        }
      })
    )
    return bodies
  }
  it('bot by default, business when asked', async () => {
    process.env.RENDER_API_KEY = 'k-for-tests' // secret-guard-ok: invented for this test
    const { спроситьАгента } = await import('@/services/trinityAgent') // cyrillic-ok: pre-existing identifier
    const bodies = stub()
    await спроситьАгента('555', 'привет').catch(() => undefined) // cyrillic-ok: pre-existing identifier
    await /* cyrillic-ok */ спроситьАгента('555', 'привет', {
      surface: 'business',
    }).catch(() => undefined) // cyrillic-ok: pre-existing identifier
    const chat = bodies.filter(b => Array.isArray(b.messages))
    expect(chat.map(b => b.surface)).toEqual(['bot', 'business'])
  })
})
