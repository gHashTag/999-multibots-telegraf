import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  postSubscriptionChange,
  registerSubscriptionUpdates,
} from '@/handlers/paymentHandlers'

/**
 * A SUBSCRIPTION CHANGE HAS TO SURVIVE THREE PLACES TO BECOME A FACT.
 *
 * Telegram will not send BotSubscriptionUpdated unless `subscription` is named
 * in allowedUpdates; Telegraf 4.16.3 has no type for it, so the handler is
 * registered by a string; and the touch log lives in the render's database,
 * so the bot has to carry it across. Any one of the three missing and the only
 * sign a subscriber left goes back to being a month of silence.
 */
describe('the update is allowed through at all', () => {
  it('src/index.ts asks Telegram for it by name', () => {
    // Not in Telegram's default set: an omission here is silent, forever.
    const src = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8')
    const list = src.slice(src.indexOf('launchWithConflictRetry(bot'))
    expect(list.slice(0, 900)).toContain("'subscription'")
  })
})

describe('the handler', () => {
  const fetches: Array<{ url: string; body: any; key: string }> = []
  beforeEach(() => {
    fetches.length = 0
    process.env.RENDER_API_KEY = 'test-key' // secret-guard-ok: invented here
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init: any) => {
        fetches.push({
          url: String(url),
          body: JSON.parse(String(init?.body ?? '{}')),
          key: String(init?.headers?.['X-Api-Key'] ?? ''),
        })
        return { ok: true, json: async () => ({ ok: true, recorded: 1 }) }
      })
    )
  })

  /** A bot that records what was registered and lets the test fire it. */
  function fakeBot() {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>()
    return {
      handlers,
      on: (key: string, fn: (ctx: unknown) => Promise<void>) =>
        handlers.set(String(key), fn),
    }
  }

  it('registers itself under the key Telegram sends', () => {
    const bot = fakeBot()
    registerSubscriptionUpdates(bot as never)
    expect(bot.handlers.has('subscription')).toBe(true)
  })

  it('carries the payload and the state across, with the server key', async () => {
    const bot = fakeBot()
    registerSubscriptionUpdates(bot as never)
    await bot.handlers.get('subscription')!({
      update: {
        subscription: {
          invoice_payload: 'subtokens:150:900000001',
          state: 'canceled',
        },
      },
      botInfo: { username: 'seller_bot' },
    })
    expect(fetches).toHaveLength(1)
    expect(fetches[0].url).toContain('/api/crm/subscription')
    expect(fetches[0].key).toBe('test-key')
    expect(fetches[0].body).toEqual({
      payload: 'subtokens:150:900000001',
      state: 'canceled',
      botName: 'seller_bot',
    })
  })

  it('says nothing to anybody when the note cannot be written', async () => {
    // The money path is elsewhere. A lost note must not look to the person
    // like a lost payment, so this swallows rather than replying.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('render down')
      })
    )
    const bot = fakeBot()
    registerSubscriptionUpdates(bot as never)
    const ctx = {
      update: {
        subscription: {
          invoice_payload: 'subtokens:1:900000001',
          state: 'failed',
        },
      },
      botInfo: { username: 'b' },
      reply: vi.fn(),
    }
    await expect(
      bot.handlers.get('subscription')!(ctx)
    ).resolves.toBeUndefined()
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('does not call out for an update with nothing in it', async () => {
    const bot = fakeBot()
    registerSubscriptionUpdates(bot as never)
    await bot.handlers.get('subscription')!({ update: { subscription: {} } })
    expect(fetches).toHaveLength(0)
  })

  it('postSubscriptionChange reaches the ledger service, not Supabase', async () => {
    await postSubscriptionChange({
      payload: 'subtokens:10:900000001',
      state: 'active',
    })
    expect(fetches[0].url).toContain('vibee-render')
  })
})
