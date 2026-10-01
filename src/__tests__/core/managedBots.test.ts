import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BOT_USERNAME_RE,
  newBotLink,
  readManagedBotCreated,
  readManagedBotUpdate,
  requestManagedBotKeyboard,
  suggestBotName,
  suggestBotUsername,
} from '@/core/bot/managedBots/protocol'
import {
  ACCESS_OF_BOT,
  EXTEND_MANAGED_BOT,
  MANAGED_BOTS_TABLE,
  TRIAL_DAYS,
  UPSERT_MANAGED_BOT,
  clearManagedBotAccessCache,
  extendManagedBot,
  liveManagedBots,
  managedBotAccess,
  rememberManagedBot,
  setManagedBotsDbForTests,
  type Db,
} from '@/core/bot/managedBots/store'
import {
  COPY,
  clearPausedNotices,
  renewUrl,
  replyToClient,
} from '@/core/bot/managedBots/runner'
import {
  MANAGER_COPY,
  ownedLine,
  parseAgentBotArgs,
} from '@/core/bot/managedBots/install'
import { launchWithConflictRetry } from '@/core/bot/launchWithConflictRetry'

const owner = {
  id: 144022504,
  is_bot: false,
  first_name: 'Dmitrii',
  username: 'playra',
  language_code: 'ru',
}
const created = {
  id: 7000000001,
  is_bot: true,
  first_name: 'Dmitrii agent',
  username: 'playra_agent_bot',
}

describe('the managed_bot update, as Bot API 9.6 documents it', () => {
  it('reads creator and bot', () => {
    expect(
      readManagedBotUpdate({
        update_id: 1,
        managed_bot: { user: owner, bot: created },
      })
    ).toEqual({
      botId: created.id,
      botUsername: 'playra_agent_bot',
      botName: 'Dmitrii agent',
      ownerId: owner.id,
      ownerUsername: 'playra',
      ownerName: 'Dmitrii',
      ownerLanguage: 'ru',
    })
  })

  it('refuses anything else, including a bot without a username', () => {
    expect(readManagedBotUpdate({ update_id: 1, message: {} })).toBeNull()
    expect(readManagedBotUpdate(null)).toBeNull()
    expect(
      readManagedBotUpdate({
        managed_bot: { user: owner, bot: { ...created, username: undefined } },
      })
    ).toBeNull()
    expect(
      readManagedBotUpdate({
        managed_bot: { user: { ...owner, id: '1' }, bot: created },
      })
    ).toBeNull()
  })

  it('reads the service message, with the sender as the owner', () => {
    const event = readManagedBotCreated({
      message_id: 5,
      from: owner,
      managed_bot_created: { bot: created },
    })
    expect(event?.ownerId).toBe(owner.id)
    expect(event?.botUsername).toBe('playra_agent_bot')
    expect(readManagedBotCreated({ message_id: 5, from: owner })).toBeNull()
  })
})

describe('what we suggest in the creation sheet', () => {
  it('every suggested username is one Telegram accepts', () => {
    const people = [
      { id: 1, username: 'playra' },
      { id: 2, username: 'ivan_bot' },
      { id: 3, username: '_9x' },
      { id: 4 },
      { id: 5, username: 'a'.repeat(32) },
      { id: 144022504, username: 'Кирилл' }, // cyrillic-ok: test input
    ]
    for (const p of people) {
      const name = suggestBotUsername(p)
      expect(name, JSON.stringify(p)).toMatch(BOT_USERNAME_RE)
      expect(name.length).toBeLessThanOrEqual(32)
    }
    expect(suggestBotUsername({ id: 1, username: 'playra' })).toBe(
      'playra_agent_bot'
    )
    expect(suggestBotUsername({ id: 2, username: 'ivan_bot' })).toBe(
      'ivan_agent_bot'
    )
  })

  it('the button is the documented request_managed_bot field', () => {
    const markup = requestManagedBotKeyboard('Create', {
      username: 'playra_agent_bot',
      name: suggestBotName('Dmitrii', false),
    }) as { keyboard: { text: string; request_managed_bot: object }[][] }
    expect(markup.keyboard[0][0]).toEqual({
      text: 'Create',
      request_managed_bot: {
        request_id: 1,
        suggested_name: 'Dmitrii · agent',
        suggested_username: 'playra_agent_bot',
      },
    })
  })

  it('the link is t.me/newbot/{manager}/{username}?name=', () => {
    expect(
      newBotLink('t27ai_bot', { username: 'playra_agent_bot', name: 'D · a' })
    ).toBe('https://t.me/newbot/t27ai_bot/playra_agent_bot?name=D%20%C2%B7%20a')
  })
})

describe('the managed_bots table keeps no token', () => {
  afterEach(() => setManagedBotsDbForTests(null))

  it('has no column a token could live in', () => {
    expect(MANAGED_BOTS_TABLE).not.toMatch(/token|secret/i)
  })

  it('creates the table, upserts, and lists the live bots of a manager', async () => {
    const calls: { sql: string; params?: unknown[] }[] = []
    const db: Db = {
      async query(sql, params) {
        calls.push({ sql, params })
        if (/^SELECT bot_id/.test(sql.trim()))
          return {
            rows: [
              {
                bot_id: '7000000001',
                bot_username: 'playra_agent_bot',
                bot_name: 'Dmitrii agent',
                owner_id: '144022504',
                owner_username: null,
              },
            ],
          }
        return { rows: [] }
      },
    }
    setManagedBotsDbForTests(db)
    await rememberManagedBot(
      readManagedBotUpdate({ managed_bot: { user: owner, bot: created } })!,
      't27ai_bot'
    )
    expect(calls[0].sql).toBe(MANAGED_BOTS_TABLE)
    expect(calls[1].params).toEqual([
      created.id,
      'playra_agent_bot',
      'Dmitrii agent',
      owner.id,
      'playra',
      't27ai_bot',
      TRIAL_DAYS,
    ])
    expect(await liveManagedBots('t27ai_bot')).toEqual([
      {
        botId: 7000000001,
        botUsername: 'playra_agent_bot',
        botName: 'Dmitrii agent',
        ownerId: 144022504,
        media: false,
      },
    ])
  })

  it('a new bot gets the trial on insert, and a token rotation gives no new one', () => {
    const [insert, onConflict] = UPSERT_MANAGED_BOT.split('ON CONFLICT')
    expect(insert).toMatch(/paid_until/)
    expect(onConflict).not.toMatch(/paid_until|media/)
    expect(TRIAL_DAYS).toBeGreaterThan(0)
  })
})

describe('who pays for a managed bot', () => {
  afterEach(() => {
    setManagedBotsDbForTests(null)
    clearManagedBotAccessCache()
  })

  it('reads access once a minute, and a payment clears it', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === ACCESS_OF_BOT)
        return { rows: [{ paid: false, media: false }] }
      if (sql === EXTEND_MANAGED_BOT)
        return {
          rows: [
            {
              bot_id: '42',
              bot_username: 'x_agent_bot',
              owner_id: '7',
              media: true,
              paid_until: '2026-11-01T00:00:00Z',
            },
          ],
        }
      return { rows: [] }
    })
    setManagedBotsDbForTests({ query })
    expect(await managedBotAccess(42, 0)).toEqual({ paid: false, media: false })
    await managedBotAccess(42, 30_000)
    expect(query.mock.calls.filter(c => c[0] === ACCESS_OF_BOT)).toHaveLength(1)

    expect(await extendManagedBot('@x_agent_bot', 30, true)).toEqual({
      botId: 42,
      botUsername: 'x_agent_bot',
      ownerId: 7,
      media: true,
      paidUntil: new Date('2026-11-01T00:00:00Z'),
    })
    expect(query).toHaveBeenCalledWith(EXTEND_MANAGED_BOT, [
      'x_agent_bot',
      30,
      true,
    ])
    await managedBotAccess(42, 31_000)
    expect(query.mock.calls.filter(c => c[0] === ACCESS_OF_BOT)).toHaveLength(2)
  })

  it('a database that does not answer leaves the bot answering, as text', async () => {
    setManagedBotsDbForTests({
      query: async () => {
        throw new Error('down')
      },
    })
    expect(await managedBotAccess(1)).toEqual({ paid: true, media: false })
  })

  it('paying early never loses the days left', () => {
    expect(EXTEND_MANAGED_BOT).toMatch(
      /greatest\(coalesce\(paid_until, now\(\)\), now\(\)\)/
    )
  })

  it('a payment for a bot nobody made is null, not a row', async () => {
    setManagedBotsDbForTests({ query: async () => ({ rows: [] }) })
    expect(await extendManagedBot('nobody_bot', 30)).toBeNull()
  })
})

describe('the team switches a bot on with /agentbot', () => {
  it('reads @username, days and an optional package', () => {
    expect(parseAgentBotArgs('/agentbot @x_agent_bot 30')).toEqual({
      botUsername: 'x_agent_bot',
      days: 30,
    })
    expect(parseAgentBotArgs('/agentbot x_agent_bot 30 text')).toEqual({
      botUsername: 'x_agent_bot',
      days: 30,
      media: false,
    })
    expect(
      parseAgentBotArgs('/agentbot@t27ai_bot @x_agent_bot 30 media')
    ).toEqual({
      botUsername: 'x_agent_bot',
      days: 30,
      media: true,
    })
  })

  it('refuses anything else', () => {
    for (const bad of [
      '/agentbot',
      '/agentbot @x_agent_bot',
      '/agentbot @x_agent_bot 0',
      '/agentbot @x_agent_bot -5',
      '/agentbot @x_agent_bot 9999',
      '/agentbot @x_agent_bot 30 video',
      '/agentbot @x_agent_bot 30 text extra',
      '/agentbot @x 30',
    ])
      expect(parseAgentBotArgs(bad), bad).toBeNull()
  })

  it('/mybot says until when each bot answers', () => {
    const now = new Date('2026-10-01T00:00:00Z')
    const copy = MANAGER_COPY.en
    expect(
      ownedLine(
        {
          botUsername: 'a_bot',
          status: 'live',
          paidUntil: new Date('2026-10-04T10:00:00Z'),
        },
        copy,
        now
      )
    ).toBe('@a_bot (paid until 2026-10-04)')
    expect(
      ownedLine(
        {
          botUsername: 'a_bot',
          status: 'live',
          paidUntil: new Date('2026-09-04T10:00:00Z'),
        },
        copy,
        now
      )
    ).toBe('@a_bot (paused)')
    expect(ownedLine({ botUsername: 'a_bot', status: 'live' }, copy, now)).toBe(
      '@a_bot (paused)'
    )
  })
})

describe('a client writes to the managed bot', () => {
  const bot = {
    botId: 7000000001,
    botUsername: 'playra_agent_bot',
    ownerId: 144022504,
    manager: 't27ai_bot',
  }
  const paidText = async () => ({ paid: true, media: false })
  afterEach(() => clearPausedNotices())

  it('is a business turn with the bot owner as the seller', async () => {
    const answer = vi.fn(async () => 'Здравствуйте!') // cyrillic-ok: test reply
    const tellOwner = vi.fn(async () => undefined)
    const reply = await replyToClient(
      { answer, tellOwner, access: paidText },
      bot,
      {
        fromId: 555000111,
        fromName: 'Lena',
        language: 'ru',
        text: ' сколько стоит? ', // cyrillic-ok: test input
      }
    )
    expect(reply).toBe('Здравствуйте!') // cyrillic-ok: test reply
    expect(answer).toHaveBeenCalledWith(
      '555000111',
      'сколько стоит?', // cyrillic-ok: test input
      expect.any(Function),
      '144022504',
      true
    )
    expect(tellOwner).not.toHaveBeenCalled()
  })

  it('a media package is asked with its media tools', async () => {
    const answer = vi.fn(async () => 'ok')
    await replyToClient(
      {
        answer,
        tellOwner: vi.fn(),
        access: async () => ({ paid: true, media: true }),
      },
      bot,
      { fromId: 1, fromName: 'A', language: 'en', text: 'hi' }
    )
    expect(answer.mock.calls[0][4]).toBe(false)
  })

  it('a bot past its paid date asks no model; the owner gets the message, and why once a day', async () => {
    const answer = vi.fn()
    const tellOwner = vi.fn(async () => undefined)
    const deps = {
      answer,
      tellOwner,
      access: async () => ({ paid: false, media: false }),
    }
    const msg = {
      fromId: 9,
      fromName: 'Lena',
      fromUsername: 'lena',
      language: 'en',
      text: 'price?',
    }
    expect(await replyToClient(deps, bot, msg, 1_000)).toBe(COPY.en.paused)
    expect(await replyToClient(deps, bot, msg, 2_000)).toBe(COPY.en.paused)
    expect(answer).not.toHaveBeenCalled()
    const said = tellOwner.mock.calls.map(c => String(c[1]))
    expect(
      said.filter(t => t.includes('Lena @lena') && t.includes('price?'))
    ).toHaveLength(2)
    const notices = said.filter(t => t.includes(renewUrl('t27ai_bot', false)))
    expect(notices).toHaveLength(1)
    await replyToClient(deps, bot, msg, 1_000 + 24 * 60 * 60 * 1000)
    expect(
      tellOwner.mock.calls.filter(c =>
        String(c[1]).includes('agentpkg_manager')
      )
    ).toHaveLength(2)
  })

  it('a message without text is answered without asking the agent', async () => {
    const answer = vi.fn()
    const reply = await replyToClient(
      { answer, tellOwner: vi.fn(), access: paidText },
      bot,
      {
        fromId: 1,
        fromName: '',
        language: 'en',
      }
    )
    expect(reply).toBe(COPY.en.textOnly)
    expect(answer).not.toHaveBeenCalled()
  })

  it('when the agent cannot answer, the owner hears and the client gets no invented reply', async () => {
    const tellOwner = vi.fn(async () => undefined)
    const reply = await replyToClient(
      {
        answer: async (_c, _t, fallback) => fallback(),
        tellOwner,
        access: paidText,
      },
      bot,
      { fromId: 9, fromName: 'Lena', language: 'en', text: 'price?' }
    )
    expect(reply).toBe(COPY.en.busy)
    expect(tellOwner).toHaveBeenCalledWith(
      144022504,
      expect.stringContaining('price?')
    )
  })
})

describe('a 409 at launch is waited out, for the farm and the managed bots', () => {
  const conflict = Object.assign(new Error('Conflict'), {
    response: { error_code: 409 },
  })

  it('retries a 409 and reports that the bot polled', async () => {
    vi.useFakeTimers()
    try {
      const launch = vi
        .fn()
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce(undefined)
      const done = launchWithConflictRetry({ launch, stop: vi.fn() }, 'x_bot', [
        'message',
      ])
      await vi.advanceTimersByTimeAsync(15_000)
      expect(await done).toBe(true)
      expect(launch).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not start a bot that was replaced while it waited', async () => {
    vi.useFakeTimers()
    try {
      const launch = vi.fn().mockRejectedValue(conflict)
      const done = launchWithConflictRetry(
        { launch, stop: vi.fn() },
        'x_bot',
        ['message'],
        8,
        () => false
      )
      await vi.advanceTimersByTimeAsync(15_000)
      expect(await done).toBe(false)
      expect(launch).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('anything but 409 is not retried', async () => {
    const launch = vi.fn().mockRejectedValue(new Error('401 Unauthorized'))
    expect(
      await launchWithConflictRetry({ launch, stop: vi.fn() }, 'x_bot', [
        'message',
      ])
    ).toBe(false)
    expect(launch).toHaveBeenCalledTimes(1)
  })
})
