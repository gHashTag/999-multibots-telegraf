import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TOOLS, type ToolContext } from './src/agent/tools'

/**
 * WHOAMI SAYS WHICH HIVE ROLE THE CALLER HAS.
 *
 * A signed-in surface (the TRI player, the game HUD) needs one answer to "who
 * is this and what are they": identity plus keeper/owner/bee. The role comes
 * from the same visibilityOf that decides what hive tools show, so the label
 * can never claim more than the server grants. It is display-only; permission
 * checks stay where they are.
 *
 * Fail closed: when ownership cannot be established (Supabase down, a non-2xx
 * answer), the role is bee -- never owner -- and whoami still answers.
 */

const whoami = () => {
  const t = TOOLS.find(t => t.name === 'whoami')
  if (!t) throw new Error('no whoami tool')
  return t
}

function profilePool() {
  return {
    async query(sql: string, params: unknown[] = []) {
      if (/FROM users u/.test(sql))
        return {
          rows: [
            {
              telegram_id: params[0],
              username: 'someone',
              first_name: 'Someone',
              avatar_url: 'https://example.invalid/a.jpg',
              display_name: 'Someone',
            },
          ],
        }
      if (/FROM public_templates/.test(sql)) return { rows: [{ n: 3 }] }
      return { rows: [] }
    },
  }
}

const ENV = ['HIVE_KEEPERS', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const
const saved: Record<string, string | undefined> = {}

async function ask(telegramId: string): Promise<Record<string, unknown>> {
  const ctx = { telegramId, pool: profilePool() } as ToolContext
  return (await whoami().handler({}, ctx)) as Record<string, unknown>
}

/** Every field whoami returned before the role existed. */
function expectEarlierFields(out: Record<string, unknown>, telegramId: string) {
  expect(out.telegram_id).toBe(telegramId)
  expect(out).toHaveProperty('профиль.username', 'someone')
  expect(out).toHaveProperty('опубликовано', 3)
  expect(out).toHaveProperty('аватар', 'https://example.invalid/a.jpg')
  expect(out).toHaveProperty('подсказкаПроАватар')
}

describe('whoami role', () => {
  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    process.env.HIVE_KEEPERS = '100'
    process.env.SUPABASE_URL = 'https://supabase.example.invalid'
    process.env.SUPABASE_SERVICE_KEY = 'key'
  })

  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
  })

  const avatarsAnswer = (bots: string[]) =>
    vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => bots.map(bot_name => ({ bot_name })),
    }))

  it('a keeper is keeper', async () => {
    vi.stubGlobal('fetch', avatarsAnswer([]))
    const out = await ask('100')
    expect(out.role).toBe('keeper')
    expectEarlierFields(out, '100')
  })

  it('someone with bots in avatars is owner', async () => {
    const fetch = avatarsAnswer(['bot_a'])
    vi.stubGlobal('fetch', fetch)
    const out = await ask('200')
    expect(out.role).toBe('owner')
    expect(String(fetch.mock.calls[0]?.[0])).toContain('telegram_id=eq.200')
    expectEarlierFields(out, '200')
  })

  it('someone with no bots is bee', async () => {
    vi.stubGlobal('fetch', avatarsAnswer([]))
    expect((await ask('300')).role).toBe('bee')
  })

  it('fails closed to bee when the ownership lookup throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      })
    )
    const out = await ask('400')
    expect(out.role).toBe('bee')
    expectEarlierFields(out, '400')
  })

  it('fails closed to bee when avatars answers an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => [] }))
    )
    expect((await ask('500')).role).toBe('bee')
  })
})
