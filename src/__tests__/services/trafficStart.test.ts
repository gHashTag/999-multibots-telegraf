/**
 * A BOT START IS TOLD TO THE RENDER, AND NOTHING ELSE (tick 9).
 * The channel and what the link opened; never who pressed it, and never a
 * /start held up by a render that is down.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { reportBotStart } from '@/services/trafficStart'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('telling the render about a start', () => {
  it('sends the channel with the service key, and no person', async () => {
    vi.stubEnv('RENDER_API_KEY', 'test-key')
    const calls: Array<{ url: string; init: RequestInit }> = []
    const f = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response('{"ok":true}')
    }) as unknown as typeof fetch
    expect(
      await reportBotStart({ source: 'telegram', campaign: 'app_feed' }, f)
    ).toBe('counted')
    expect(calls[0].url).toMatch(/\/api\/traffic\/start$/)
    expect((calls[0].init.headers as Record<string, string>)['X-Api-Key']).toBe(
      'test-key'
    )
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      source: 'telegram',
      campaign: 'app_feed',
    })
  })

  it('a refusal, a dead network or no key never throws', async () => {
    vi.stubEnv('RENDER_API_KEY', 'test-key')
    const refused = vi.fn(
      async () => new Response('', { status: 403 })
    ) as unknown as typeof fetch
    expect(await reportBotStart({ source: 'x', campaign: '' }, refused)).toBe(
      'not counted'
    )
    const down = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    expect(await reportBotStart({ source: 'x', campaign: '' }, down)).toBe(
      'not counted'
    )
    vi.stubEnv('RENDER_API_KEY', '')
    const never = vi.fn() as unknown as typeof fetch
    expect(await reportBotStart({ source: 'x', campaign: '' }, never)).toBe(
      'not counted'
    )
    expect(never).not.toHaveBeenCalled()
  })
})
