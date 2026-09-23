/**
 * A BUSINESS TURN SAYS WHOSE CHAT IT IS.
 *
 * Owner, 2026-09-23: the agent in his wife's profile wrote as him. The turn
 * carried the CLIENT's id and a surface and nothing else, so the render had
 * to guess the seller -- and its only guess was the platform owner. A second
 * seller's client was answered out of the platform owner's correspondence, in
 * his voice.
 *
 * The seller now travels with the turn, from Telegram's own connection
 * object. Pinned here: `answerClient` forwards it, and the agent client puts
 * it in the request only when it is an id.
 *
 * Fictional ids only (9000000xx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const WIFE = '900000121'
const CLIENT = '900000122'

const asked = vi.fn(async () => ({ ['текст']: 'ответ' })) // cyrillic-ok: the agent answer shape
vi.mock('@/services/trinityAgent', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  /* cyrillic-ok: pre-existing export name */ спроситьАгента: (
    ...a: unknown[]
  ) => asked(...(a as [])),
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))

const { answerClient } = await import('@/services/businessBotService')

beforeEach(() => {
  asked.mockClear()
})

describe('answerClient', () => {
  it('passes the seller whose chat it is', async () => {
    await answerClient(CLIENT, 'сколько стоит?', async () => 'fallback', WIFE) // cyrillic-ok: a client question
    const opts = (asked.mock.calls[0] as unknown[])[2] as Record<
      string,
      unknown
    >
    expect(opts.surface).toBe('business')
    expect(opts.seller).toBe(WIFE)
  })

  it('sends no seller at all when the connection owner is unknown', async () => {
    await answerClient(CLIENT, 'привет', async () => 'fallback') // cyrillic-ok: a client line
    const opts = (asked.mock.calls[0] as unknown[])[2] as Record<
      string,
      unknown
    >
    expect('seller' in opts).toBe(false)
  })
})

/**
 * The wire: the id reaches the render as `seller_id`, and only when it IS an
 * id. A body field that can be anything decides whose CRM is read.
 */
describe('the request the render receives', () => {
  const bodyOf = async (seller?: string) => {
    let sent: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url)
        if (u.includes('/api/agent/history'))
          return new Response(JSON.stringify({ messages: [] }), { status: 200 })
        sent = JSON.parse(String(init?.body ?? '{}'))
        return new Response('{"тип":"текст","текст":"ok"}\n', { status: 200 }) // cyrillic-ok: event envelope
      })
    )
    const real = await vi.importActual<Record<string, any>>(
      '@/services/trinityAgent'
    )
    process.env.RENDER_API_KEY = 'server-key-for-tests' // secret-guard-ok: invented value, fetch is stubbed
    await real['спроситьАгента'](CLIENT, 'привет', {
      // cyrillic-ok: pre-existing export
      surface: 'business',
      ...(seller ? { seller } : {}),
    }).catch(() => undefined)
    vi.unstubAllGlobals()
    return sent
  }

  it('carries seller_id for a real id', async () => {
    expect((await bodyOf(WIFE)).seller_id).toBe(WIFE)
  })

  it('carries nothing for a handle, a word, or too few digits', async () => {
    for (const bad of ['@wife', 'wife', '123']) {
      expect((await bodyOf(bad)).seller_id, bad).toBeUndefined()
    }
  })

  it('carries nothing when no seller is named', async () => {
    expect((await bodyOf()).seller_id).toBeUndefined()
  })
})
