import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE FARM'S CASHIERS: which bot mints the invoice.
 *
 * The map is learned from Telegram, once, and only for bots that answer; a
 * blank map is not remembered. Names are compared the way people type them.
 */

const ENV_KEYS = [
  'BOT_TOKEN_1',
  'BOT_TOKEN_2',
  'BOT_TOKEN_12',
  'TELEGRAM_BOT_TOKEN',
  'TOKENS_PAYMENT_BOT_TOKEN',
]

function stubGetMe(bots: Record<string, string | null>) {
  const asked: string[] = []
  const fetchImpl = vi.fn(async (url: string) => {
    const m = /\/bot([^/]+)\/getMe$/.exec(String(url))
    const token = m?.[1] ?? ''
    asked.push(token)
    const u = bots[token]
    if (u === undefined) throw new Error('network')
    return {
      json: async () =>
        u === null ? { ok: false } : { ok: true, result: { username: u } },
    }
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, asked }
}

beforeEach(() => {
  vi.resetModules()
  for (const k of ENV_KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('the farm map comes from getMe, not from a hand-typed list', () => {
  it('every distinct token is asked once and answers by username', async () => {
    process.env.BOT_TOKEN_1 = 'tok-one' // secret-guard-ok: invented for this test
    process.env.BOT_TOKEN_2 = 'tok-two' // secret-guard-ok: invented for this test
    // The same bot under two names: one token, one question.
    process.env.TELEGRAM_BOT_TOKEN = 'tok-one' // secret-guard-ok: invented for this test
    process.env.TOKENS_PAYMENT_BOT_TOKEN = 'tok-pay' // secret-guard-ok: invented for this test
    const { fetchImpl, asked } = stubGetMe({
      'tok-one': 'Neuro_Blogger_Bot',
      'tok-two': 'ZavaraBot',
      'tok-pay': 't27ai_bot',
    })
    const { tokenForBot } = await import('./src/agent/bot-farm')
    expect(await tokenForBot('@neuro_blogger_bot', fetchImpl)).toEqual({
      username: 'neuro_blogger_bot',
      token: 'tok-one',
    })
    expect(await tokenForBot('zavarabot', fetchImpl)).toEqual({
      username: 'zavarabot',
      token: 'tok-two',
    })
    expect(await tokenForBot('t27ai_bot', fetchImpl)).toEqual({
      username: 't27ai_bot',
      token: 'tok-pay',
    })
    expect(asked.sort()).toEqual(['tok-one', 'tok-pay', 'tok-two'])
  })

  it('a bot that does not answer is not a cashier; the others still are', async () => {
    process.env.BOT_TOKEN_1 = 'tok-one' // secret-guard-ok: invented for this test
    process.env.BOT_TOKEN_2 = 'tok-dead' // secret-guard-ok: invented for this test
    process.env.BOT_TOKEN_12 = 'tok-revoked' // secret-guard-ok: invented for this test
    const { fetchImpl } = stubGetMe({
      'tok-one': 'neuro_blogger_bot',
      'tok-revoked': null,
    })
    const { tokenForBot } = await import('./src/agent/bot-farm')
    expect(await tokenForBot('neuro_blogger_bot', fetchImpl)).toBeTruthy()
    expect(await tokenForBot('whatever', fetchImpl)).toBeNull()
  })

  it('an empty map is not remembered: the next call asks again', async () => {
    process.env.BOT_TOKEN_1 = 'tok-one' // secret-guard-ok: invented for this test
    const first = stubGetMe({})
    const { tokenForBot } = await import('./src/agent/bot-farm')
    expect(await tokenForBot('neuro_blogger_bot', first.fetchImpl)).toBeNull()
    const second = stubGetMe({ 'tok-one': 'neuro_blogger_bot' })
    expect(await tokenForBot('neuro_blogger_bot', second.fetchImpl)).toEqual({
      username: 'neuro_blogger_bot',
      token: 'tok-one',
    })
  })

  // A bot on our own Bot API server while it restarts (a network error), or
  // one its proxy or the cloud refuses (ok:false: not yet listed there, or
  // within 10 minutes of its logOut): not a cashier NOW, but it must become
  // one again without a redeploy.
  for (const [how, answer] of [
    ['does not answer', undefined],
    ['is refused', null],
  ] as const) {
    it(`a map with a bot that ${how} is kept for minutes, not for the life of the process`, async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        process.env.BOT_TOKEN_1 = 'tok-one' // secret-guard-ok: invented for this test
        process.env.BOT_TOKEN_2 = 'tok-moved' // secret-guard-ok: invented for this test
        const { tokenForBot, INCOMPLETE_FARM_TTL_MS } = await import(
          './src/agent/bot-farm'
        )
        const down = stubGetMe({
          'tok-one': 'neuro_blogger_bot',
          ...(answer === null ? { 'tok-moved': null } : {}),
        })
        expect(
          await tokenForBot('kaya_easy_art_bot', down.fetchImpl)
        ).toBeNull()
        // Within the window: remembered, not asked again.
        expect(
          await tokenForBot('kaya_easy_art_bot', down.fetchImpl)
        ).toBeNull()
        expect(down.asked).toHaveLength(2)

        vi.setSystemTime(Date.now() + INCOMPLETE_FARM_TTL_MS + 1)
        const up = stubGetMe({
          'tok-one': 'neuro_blogger_bot',
          'tok-moved': 'Kaya_easy_art_bot',
        })
        expect(await tokenForBot('kaya_easy_art_bot', up.fetchImpl)).toEqual({
          username: 'kaya_easy_art_bot',
          token: 'tok-moved',
        })
      } finally {
        vi.useRealTimers()
      }
    })
  }

  it('a full map IS remembered: one getMe per token per process', async () => {
    process.env.BOT_TOKEN_1 = 'tok-one' // secret-guard-ok: invented for this test
    const { fetchImpl, asked } = stubGetMe({ 'tok-one': 'neuro_blogger_bot' })
    const { tokenForBot } = await import('./src/agent/bot-farm')
    await tokenForBot('neuro_blogger_bot', fetchImpl)
    await tokenForBot('neuro_blogger_bot', fetchImpl)
    await tokenForBot('other', fetchImpl)
    expect(asked).toHaveLength(1)
  })

  it('names are compared the way people and the business chat write them', async () => {
    const { normaliseBotName } = await import('./src/agent/bot-farm')
    expect(normaliseBotName('@Neuro_Blogger_Bot')).toBe('neuro_blogger_bot')
    expect(normaliseBotName('business_neuro_blogger_bot')).toBe(
      'neuro_blogger_bot'
    )
    expect(normaliseBotName('  ')).toBe('')
    expect(normaliseBotName(null)).toBe('')
  })

  it('nothing is asked for an empty name', async () => {
    process.env.BOT_TOKEN_1 = 'tok-one' // secret-guard-ok: invented for this test
    const { fetchImpl, asked } = stubGetMe({ 'tok-one': 'neuro_blogger_bot' })
    const { tokenForBot } = await import('./src/agent/bot-farm')
    expect(await tokenForBot('', fetchImpl)).toBeNull()
    expect(await tokenForBot(null, fetchImpl)).toBeNull()
    expect(asked).toHaveLength(0)
  })
})
