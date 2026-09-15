import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { newBotLink } from '@/services/managedBotLink'
import { registerManagedBots } from '@/services/managedBots'

/**
 * A BOT MADE WITHOUT A TRIP TO BOTFATHER, AND A TOKEN NOBODY READS.
 *
 * Bot API 9.6 (3 Apr 2026). The token of a managed bot can be fetched exactly
 * once, when the update arrives -- BotFather does not own this bot, we do --
 * so losing it there means losing it for good. And it is a secret: the whole
 * point of the flow is that no person ever sees or pastes it.
 */
describe('the link Telegram is asked to create a bot with', () => {
  it('has the shape the reference documents', () => {
    expect(newBotLink('t27ai_bot', 'olga_seller_bot')).toBe(
      'https://t.me/newbot/t27ai_bot/olga_seller_bot'
    )
  })

  it('carries a display name when one was given', () => {
    expect(newBotLink('t27ai_bot', 'olga_seller_bot', 'Продавец Ольги')).toBe(
      'https://t.me/newbot/t27ai_bot/olga_seller_bot?name=%D0%9F%D1%80%D0%BE%D0%B4%D0%B0%D0%B2%D0%B5%D1%86%20%D0%9E%D0%BB%D1%8C%D0%B3%D0%B8'
    )
  })

  it('tolerates a leading @ on either name', () => {
    expect(newBotLink('@t27ai_bot', '@olga_seller_bot')).toBe(
      'https://t.me/newbot/t27ai_bot/olga_seller_bot'
    )
  })

  it('refuses a username Telegram will not take, instead of sending a dead link', () => {
    // Telegram requires the name to end in "bot"; a link with anything else
    // opens and fails, and the person has no idea why.
    expect(() => newBotLink('t27ai_bot', 'olga_seller')).toThrow('bot')
    expect(() => newBotLink('', 'olga_seller_bot')).toThrow()
  })

  /**
   * THE RULE THE REFUSAL STATES IS THE RULE THE CHECK APPLIES.
   *
   * The message says "5 to 32 characters" -- Telegram's own rule -- while the
   * pattern behind it allowed 7..34. Wrong in BOTH directions, measured:
   *
   *   "aabot"  (5, valid for Telegram)   was refused by us
   *   34 chars (Telegram will refuse it) passed, and the person found out
   *                                      after opening the link
   *
   * This case used to assert the opposite for a six-character name, which is
   * how the wrong pattern stayed: the test encoded it.
   */
  it('takes exactly the lengths Telegram takes: five to thirty-two', () => {
    const name = (n: number) => 'a'.repeat(n - 3) + 'bot'
    expect(() => newBotLink('t27ai_bot', name(4))).toThrow()
    expect(newBotLink('t27ai_bot', name(5))).toContain(name(5))
    expect(newBotLink('t27ai_bot', 'ab_bot')).toContain('ab_bot')
    expect(newBotLink('t27ai_bot', name(32))).toContain(name(32))
    expect(() => newBotLink('t27ai_bot', name(33))).toThrow()
  })
})

describe('when the bot is created', () => {
  const posted: Array<{ url: string; body: any; key: string }> = []
  beforeEach(() => {
    posted.length = 0
    process.env.RENDER_API_KEY = 'test-key' // secret-guard-ok: invented here
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init: any) => {
        posted.push({
          url: String(url),
          body: JSON.parse(String(init?.body ?? '{}')),
          key: String(init?.headers?.['X-Api-Key'] ?? ''),
        })
        return { ok: true, json: async () => ({ ok: true }) }
      })
    )
  })

  function fakeBot(token = 'fresh-token') {
    // secret-guard-ok: invented above, never a real key
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>()
    const sent: Array<[string, string]> = []
    return {
      handlers,
      sent,
      command: () => undefined,
      on: (k: string, fn: (ctx: unknown) => Promise<void>) =>
        handlers.set(String(k), fn),
      telegram: {
        callApi: vi.fn(async () => token),
        sendMessage: vi.fn(async (to: string, text: string) => {
          sent.push([String(to), String(text)])
          return true
        }),
      },
    }
  }

  const update = {
    update: {
      managed_bot: {
        user: { id: 144022504 },
        bot: { id: 8123456789, username: 'olga_seller_bot' },
      },
    },
  }

  it('reads the token and keeps it, with the server key', async () => {
    const b = fakeBot()
    registerManagedBots(b as never)
    await b.handlers.get('managed_bot')!({ ...update, telegram: b.telegram })
    expect(b.telegram.callApi).toHaveBeenCalledWith('getManagedBotToken', {
      user_id: 8123456789,
    })
    expect(posted).toHaveLength(1)
    expect(posted[0].url).toContain('/api/bots/managed')
    expect(posted[0].key).toBe('test-key')
    expect(posted[0].body.owner).toBe('144022504')
    expect(posted[0].body.botUsername).toBe('olga_seller_bot')
  })

  it('never puts the token in the message it sends the person', async () => {
    /*
     * The decisive case. The flow exists so that a key never passes through a
     * human; a helpful "here is your token" would undo the whole thing.
     */
    const b = fakeBot('SECRET-VALUE') // secret-guard-ok: invented here
    registerManagedBots(b as never)
    await b.handlers.get('managed_bot')!({ ...update, telegram: b.telegram })
    expect(b.sent).toHaveLength(1)
    expect(b.sent[0][0]).toBe('144022504')
    expect(b.sent[0][1]).not.toContain('SECRET-VALUE')
    expect(b.sent[0][1]).toContain('olga_seller_bot')
  })

  it('keeps nothing and says so when the token does not come', async () => {
    const b = fakeBot('')
    registerManagedBots(b as never)
    await b.handlers.get('managed_bot')!({ ...update, telegram: b.telegram })
    expect(posted).toHaveLength(0)
    expect(b.sent[0][1]).toContain('не удалось')
  })

  it('ignores an update with nothing usable in it', async () => {
    const b = fakeBot()
    registerManagedBots(b as never)
    await b.handlers.get('managed_bot')!({
      update: { managed_bot: { bot: {} } },
      telegram: b.telegram,
    })
    expect(b.telegram.callApi).not.toHaveBeenCalled()
    expect(posted).toHaveLength(0)
  })
})

describe('the update is allowed through at all', () => {
  it('src/index.ts asks Telegram for it by name', () => {
    const src = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8')
    const list = src.slice(src.indexOf('launchWithConflictRetry(bot'))
    expect(list.slice(0, 1200)).toContain("'managed_bot'")
  })

  it('and the handler is registered on the bot', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/navigation/registerCommands.ts'),
      'utf8'
    )
    expect(src).toContain('registerManagedBots(bot)')
  })
})
