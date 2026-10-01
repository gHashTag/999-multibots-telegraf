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
  MANAGED_BOTS_TABLE,
  liveManagedBots,
  rememberManagedBot,
  setManagedBotsDbForTests,
  type Db,
} from '@/core/bot/managedBots/store'
import { COPY, replyToClient } from '@/core/bot/managedBots/runner'

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
    ])
    expect(await liveManagedBots('t27ai_bot')).toEqual([
      {
        botId: 7000000001,
        botUsername: 'playra_agent_bot',
        botName: 'Dmitrii agent',
        ownerId: 144022504,
      },
    ])
  })
})

describe('a client writes to the managed bot', () => {
  const bot = { botUsername: 'playra_agent_bot', ownerId: 144022504 }

  it('is a business turn with the bot owner as the seller', async () => {
    const answer = vi.fn(async () => 'Здравствуйте!') // cyrillic-ok: test reply
    const tellOwner = vi.fn(async () => undefined)
    const reply = await replyToClient({ answer, tellOwner }, bot, {
      fromId: 555000111,
      fromName: 'Lena',
      language: 'ru',
      text: ' сколько стоит? ', // cyrillic-ok: test input
    })
    expect(reply).toBe('Здравствуйте!') // cyrillic-ok: test reply
    expect(answer).toHaveBeenCalledWith(
      '555000111',
      'сколько стоит?', // cyrillic-ok: test input
      expect.any(Function),
      '144022504'
    )
    expect(tellOwner).not.toHaveBeenCalled()
  })

  it('a message without text is answered without asking the agent', async () => {
    const answer = vi.fn()
    const reply = await replyToClient({ answer, tellOwner: vi.fn() }, bot, {
      fromId: 1,
      fromName: '',
      language: 'en',
    })
    expect(reply).toBe(COPY.en.textOnly)
    expect(answer).not.toHaveBeenCalled()
  })

  it('when the agent cannot answer, the owner hears and the client gets no invented reply', async () => {
    const tellOwner = vi.fn(async () => undefined)
    const reply = await replyToClient(
      {
        answer: async (_c, _t, fallback) => fallback(),
        tellOwner,
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
