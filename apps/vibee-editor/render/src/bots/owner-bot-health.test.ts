import { describe, expect, it, vi } from 'vitest'
import { healthLine, healthOfOwnedBots } from './owner-bot-health'

/**
 * THE ANSWER THE BOT OWNER COULD NOT GET IN JUNE.
 *
 * Her bot was down for nineteen days and she heard about it from her own
 * clients; the cause was an invalid token, visible only in a service she has
 * no access to. Every case below is one of the ways that question can be
 * answered wrongly: a comforting yes, a silent empty list, or a lie about
 * whose fault it is.
 */

const NOW = () => new Date('2026-09-23T12:00:00.000Z')

const answers = (byUrl: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    const key = Object.keys(byUrl).find(k => String(url).includes(k))
    return {
      json: async () =>
        key ? byUrl[key] : { ok: false, description: 'unknown' },
    } as never
  }) as unknown as typeof fetch

describe('is my bot alive', () => {
  it('says yes when Telegram knows the token, with the queue beside it', async () => {
    const health = await healthOfOwnedBots('27', {
      botsOwnedBy: async () => ['NeuroLenaAssistant_bot'],
      tokenForBot: async () => 'token-1',
      now: NOW,
      fetchImpl: answers({
        getMe: { ok: true, result: { username: 'NeuroLenaAssistant_bot' } },
        getWebhookInfo: { ok: true, result: { pending_update_count: 0 } },
      }),
    })
    expect(health).toEqual([
      {
        bot: 'NeuroLenaAssistant_bot',
        alive: true,
        why: null,
        pendingUpdates: 0,
        checkedAt: '2026-09-23T12:00:00.000Z',
      },
    ])
  })

  it('repeats Telegram’s own words when the token is dead', async () => {
    // June 2026, verbatim from the screenshot in her chat: 404 Not Found.
    const health = await healthOfOwnedBots('27', {
      botsOwnedBy: async () => ['@NeuroLenaAssistant_bot'],
      tokenForBot: async () => 'stale',
      now: NOW,
      fetchImpl: answers({
        getMe: { ok: false, description: 'Not Found' },
      }),
    })
    expect(health[0].alive).toBe(false)
    expect(health[0].why).toBe('Not Found')
    expect(healthLine(health[0])).toContain('не отвечает')
  })

  it('names our own gap as ours when the farm has no token', async () => {
    // "Your bot is broken" would be a lie: nobody on our side can answer with
    // it, and that is a different sentence and a different fix.
    const health = await healthOfOwnedBots('27', {
      botsOwnedBy: async () => ['SomebodysBot'],
      tokenForBot: async () => null,
      now: NOW,
      fetchImpl: answers({}),
    })
    expect(health[0].alive).toBe(false)
    expect(health[0].why).toContain('токена этого бота нет на сервере')
  })

  it('does not call a network failure a dead bot', async () => {
    const health = await healthOfOwnedBots('27', {
      botsOwnedBy: async () => ['B'],
      tokenForBot: async () => 't',
      now: NOW,
      fetchImpl: vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      }) as unknown as typeof fetch,
    })
    // Still not alive -- but the reason is the network, and it is said.
    expect(health[0].alive).toBe(false)
    expect(health[0].why).toContain('ENOTFOUND')
  })

  it('says a growing queue out loud: alive at Telegram, nobody collecting', async () => {
    const health = await healthOfOwnedBots('27', {
      botsOwnedBy: async () => ['B'],
      tokenForBot: async () => 't',
      now: NOW,
      fetchImpl: answers({
        getMe: { ok: true, result: { username: 'B' } },
        getWebhookInfo: { ok: true, result: { pending_update_count: 412 } },
      }),
    })
    expect(health[0].alive).toBe(true)
    expect(healthLine(health[0])).toContain('412 сообщений ждут разбора')
  })

  it('an ownership source that is down is not "you own nothing"', async () => {
    const health = await healthOfOwnedBots('27', {
      botsOwnedBy: async () => {
        throw new Error('avatars replied 503')
      },
      tokenForBot: async () => 't',
      now: NOW,
      fetchImpl: answers({}),
    })
    // Empty, and deliberately NOT a made-up "all fine" row.
    expect(health).toEqual([])
  })

  it('never hands the token back to the caller', async () => {
    // The answer goes to a browser. A token is the right to speak as that bot.
    const health = await healthOfOwnedBots('27', {
      botsOwnedBy: async () => ['B'],
      tokenForBot: async () => 'secret-token-value',
      now: NOW,
      fetchImpl: answers({
        getMe: { ok: true, result: { username: 'B' } },
        getWebhookInfo: { ok: true, result: { pending_update_count: 1 } },
      }),
    })
    expect(JSON.stringify(health)).not.toContain('secret-token-value')
  })
})
