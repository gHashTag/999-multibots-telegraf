import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const ADMIN = 144
vi.mock('@/middleware/adminOnly', () => ({
  isAdmin: (id: number) => id === 144,
}))

const store = vi.hoisted(() => ({
  agentBots: vi.fn(),
  bindAgent: vi.fn(),
  rememberHive: vi.fn(async () => undefined),
  setHiveTopic: vi.fn(async () => undefined),
  setManagedBotStatus: vi.fn(),
}))
vi.mock('@/core/bot/managedBots/store', () => store)

const runner = vi.hoisted(() => ({
  launchManagedBot: vi.fn(async () => undefined),
  runningTelegram: vi.fn(),
  isRunning: vi.fn(() => true),
  stopManagedBot: vi.fn(),
}))
vi.mock('@/core/bot/managedBots/runner', () => runner)

import {
  HIVE_COPY,
  addToGroupLink,
  agentHiveDeps,
  agentLine,
  agentsKeyboard,
  installAgentHive,
  noteManager,
} from '@/core/bot/agentHive'
import { clearAgentBots, isHiveBot } from '@/core/bot/agentHive/answer'
import { claimAgent, clearClaims } from '@/core/bot/agentHive/claims'
import { HIVE_AGENTS, hiveAgent } from '@/core/bot/agentHive/catalogue'
import type { AgentBotRow } from '@/core/bot/managedBots/store'

const MANAGER = { id: 999, username: 't27ai_bot', can_manage_bots: true }
const HIVE = -100777

const agentRow = (
  botId: number,
  agentId: string,
  extra: Partial<AgentBotRow> = {}
): AgentBotRow =>
  ({
    botId,
    botUsername: `t27_${agentId}_bot`,
    botName: agentId,
    ownerId: ADMIN,
    managerBot: 't27ai_bot',
    status: 'live',
    agentId,
    ...extra,
  }) as AgentBotRow

type Handler = (ctx: any, next?: () => unknown) => Promise<unknown>

function fakeBot(botInfo: Record<string, unknown> = MANAGER) {
  const commands = new Map<string, Handler>()
  let action: { re: RegExp; fn: Handler } | undefined
  const telegram = {
    getChat: vi.fn(async (..._a: any[]): Promise<any> => ({ is_forum: true })),
    getChatMember: vi.fn(
      async (_chat: number, user: number): Promise<any> => ({
        status: user === MANAGER.id ? 'administrator' : 'member',
        can_manage_topics: true,
      })
    ),
    callApi: vi.fn(async (..._a: any[]) => ({ message_thread_id: 55 })),
    sendMessage: vi.fn(async (..._a: any[]) => ({ message_id: 1 })),
  }
  const bot = {
    botInfo,
    telegram,
    command: (name: string, fn: Handler) => commands.set(name, fn),
    action: (re: RegExp, fn: Handler) => {
      action = { re, fn }
    },
  }
  const deps = { tellOwner: vi.fn(async () => undefined) } as any
  installAgentHive(bot as any, deps)
  const ctx = (over: Record<string, unknown> = {}) => ({
    from: { id: ADMIN, language_code: 'en' },
    chat: { id: ADMIN, type: 'private' },
    botInfo,
    reply: vi.fn(async (..._a: any[]) => ({})),
    editMessageText: vi.fn(async (..._a: any[]) => ({})),
    answerCbQuery: vi.fn(async () => true),
    telegram,
    ...over,
  })
  const tap = async (data: string, over: Record<string, unknown> = {}) => {
    const c = ctx({ match: action!.re.exec(data), ...over })
    await action!.fn(c)
    return c
  }
  return { bot, telegram, commands, ctx, tap, deps }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.agentBots.mockResolvedValue([])
  runner.isRunning.mockReturnValue(true)
})
afterEach(() => {
  clearAgentBots()
  clearClaims()
})

const copy = HIVE_COPY.en
const blogger = hiveAgent('blogger')!

describe('the /agents list', () => {
  it('names each agent with its bot state', () => {
    expect(agentLine(blogger, undefined, false, copy, false)).toContain(
      copy.noBot
    )
    const row = agentRow(11, 'blogger', { hiveTopicId: 3 })
    expect(agentLine(blogger, row, true, copy, false)).toBe(
      `${blogger.icon} ${blogger.name.en} — @t27_blogger_bot (${copy.live}, ${copy.topic})`
    )
    expect(agentLine(blogger, row, false, copy, false)).toContain(copy.down)
    expect(
      agentLine(blogger, { ...row, status: 'paused' }, true, copy, true)
    ).toContain(`${blogger.name.ru} — @t27_blogger_bot (${copy.paused}`)
  })

  it('gives one row per agent: create, or pause/resume and a new token', () => {
    const kb = agentsKeyboard(
      [agentRow(11, 'blogger'), agentRow(12, 'coder', { status: 'paused' })],
      copy
    ).inline_keyboard
    expect(kb).toHaveLength(HIVE_AGENTS.length)
    const rowOf = (id: string) => kb[HIVE_AGENTS.findIndex(a => a.id === id)]
    expect(rowOf('blogger')).toEqual([
      expect.objectContaining({
        callback_data: 'hive:pause:11',
        style: 'danger',
      }),
      { text: copy.token, callback_data: 'hive:token:11' },
    ])
    expect(rowOf('coder')[0]).toMatchObject({
      callback_data: 'hive:live:12',
      style: 'primary',
    })
    expect(rowOf('job')).toEqual([
      expect.objectContaining({
        callback_data: 'hive:new:job',
        style: 'success',
      }),
    ])
  })

  it('adds a bot to a group as an admin who may manage topics', () => {
    expect(addToGroupLink('t27_coder_bot')).toBe(
      'https://t.me/t27_coder_bot?startgroup=hive&admin=pin_messages+manage_topics'
    )
  })

  it('answers the team in private, in their language', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([agentRow(11, 'blogger')])
    const c = f.ctx({ from: { id: ADMIN, language_code: 'ru' } })
    await f.commands.get('agents')!(c, vi.fn())
    const [text, extra] = c.reply.mock.calls[0]
    expect(text).toContain(HIVE_COPY.ru.title)
    expect(text).toContain('@t27_blogger_bot')
    expect(extra.reply_markup.inline_keyboard).toHaveLength(HIVE_AGENTS.length)
    expect(isHiveBot(MANAGER.id)).toBe(true)
  })

  it('passes everybody else on, and stays quiet in a group', async () => {
    const f = fakeBot()
    const next = vi.fn()
    await f.commands.get('agents')!(f.ctx({ from: { id: 7 } }), next)
    expect(next).toHaveBeenCalledOnce()
    const g = f.ctx({ chat: { id: HIVE, type: 'supergroup' } })
    await f.commands.get('agents')!(g, vi.fn())
    expect(g.reply).not.toHaveBeenCalled()
  })

  it('is inert on a bot without Bot Management Mode', async () => {
    const f = fakeBot({ ...MANAGER, can_manage_bots: false })
    const next = vi.fn()
    await f.commands.get('agents')!(f.ctx(), next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('says it failed when the database does not answer', async () => {
    const f = fakeBot()
    store.agentBots.mockRejectedValue(new Error('db down'))
    const c = f.ctx()
    await f.commands.get('agents')!(c, vi.fn())
    expect(c.reply).toHaveBeenCalledWith(copy.failed)
  })
})

describe('the /agents buttons', () => {
  it('answers the callback first, and ignores a stranger', async () => {
    const f = fakeBot()
    const c = await f.tap('hive:pause:11', { from: { id: 7 } })
    expect(c.answerCbQuery).toHaveBeenCalled()
    expect(store.setManagedBotStatus).not.toHaveBeenCalled()
  })

  it('create: leaves a claim and asks Telegram for t27_<id>_bot', async () => {
    const f = fakeBot()
    const c = await f.tap('hive:new:blogger')
    const [text, extra] = c.reply.mock.calls[0]
    expect(text).toBe(copy.askCreate(blogger, 't27_blogger_bot'))
    expect(extra.reply_markup.keyboard[0][0].request_managed_bot).toMatchObject(
      {
        suggested_username: 't27_blogger_bot',
        suggested_name: blogger.name.en,
      }
    )
  })

  it('create: a second tap does not ask for a second bot', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([agentRow(11, 'blogger')])
    const c = await f.tap('hive:new:blogger')
    expect(c.reply).toHaveBeenCalledWith(copy.already('t27_blogger_bot'))
    expect(c.reply).toHaveBeenCalledTimes(1)
  })

  it('create: an unknown agent does nothing', async () => {
    const f = fakeBot()
    const c = await f.tap('hive:new:nobody')
    expect(c.reply).not.toHaveBeenCalled()
  })

  it('pause stops the bot; resume launches it; both refresh the list', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([agentRow(11, 'blogger')])
    const p = await f.tap('hive:pause:11')
    expect(store.setManagedBotStatus).toHaveBeenCalledWith(11, 'paused')
    expect(runner.stopManagedBot).toHaveBeenCalledWith(11)
    expect(p.reply).toHaveBeenCalledWith(copy.paused1('t27_blogger_bot'))
    expect(p.editMessageText).toHaveBeenCalled()

    const live = agentRow(11, 'blogger')
    store.setManagedBotStatus.mockResolvedValue(live)
    const l = await f.tap('hive:live:11')
    expect(runner.launchManagedBot).toHaveBeenCalledWith(
      f.bot,
      live,
      f.deps,
      't27ai_bot'
    )
    expect(l.reply).toHaveBeenCalledWith(copy.resumed('t27_blogger_bot'))
  })

  it('resume of a row the database no longer has launches nothing', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([agentRow(11, 'blogger')])
    store.setManagedBotStatus.mockResolvedValue(null)
    await f.tap('hive:live:11')
    expect(runner.launchManagedBot).not.toHaveBeenCalled()
  })

  it('token: asks Telegram for a new one', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([agentRow(11, 'blogger')])
    const c = await f.tap('hive:token:11')
    expect(f.telegram.callApi).toHaveBeenCalledWith('replaceManagedBotToken', {
      user_id: 11,
    })
    expect(c.reply).toHaveBeenCalledWith(copy.tokenDone('t27_blogger_bot'))
  })

  it("a bot that is not this manager's agent bot is left alone", async () => {
    const f = fakeBot()
    const c = await f.tap('hive:pause:404')
    expect(store.setManagedBotStatus).not.toHaveBeenCalled()
    expect(c.reply).not.toHaveBeenCalled()
  })

  it('says it failed when Telegram refuses', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([agentRow(11, 'blogger')])
    f.telegram.callApi.mockRejectedValueOnce(new Error('403'))
    const c = await f.tap('hive:token:11')
    expect(c.reply).toHaveBeenCalledWith(copy.failed)
  })
})

describe('/hive in a group', () => {
  const inHive = (f: ReturnType<typeof fakeBot>, over = {}) =>
    f.ctx({ chat: { id: HIVE, type: 'supergroup' }, ...over })

  it('makes a topic per live agent bot and links the missing ones', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([
      agentRow(11, 'blogger'),
      agentRow(12, 'coder', { hiveChatId: HIVE, hiveTopicId: 9 }),
      agentRow(13, 'job', { status: 'paused' }),
    ])
    f.telegram.getChatMember.mockImplementation(async (_c, user) =>
      user === MANAGER.id
        ? { status: 'administrator', can_manage_topics: true }
        : user === 11
          ? { status: 'left' }
          : { status: 'member' }
    )
    const c = inHive(f)
    await f.commands.get('hive')!(c, vi.fn())

    expect(store.rememberHive).toHaveBeenCalledWith(HIVE, ADMIN, 't27ai_bot')
    expect(f.telegram.callApi).toHaveBeenCalledTimes(1)
    expect(f.telegram.callApi).toHaveBeenCalledWith('createForumTopic', {
      chat_id: HIVE,
      name: `${blogger.icon} ${blogger.name.en}`,
    })
    expect(store.setHiveTopic).toHaveBeenCalledWith(11, HIVE, 55)
    const intro = f.telegram.sendMessage.mock.calls[0]
    expect(intro[1]).toBe(copy.topicIntro(blogger, 't27_blogger_bot'))
    expect(intro[1]).not.toContain('@t27_blogger_bot')
    expect(intro[2]).toEqual({ message_thread_id: 55 })

    const [text, extra] = c.reply.mock.calls[0]
    expect(text).toBe(`${copy.hiveReady(2)}\n\n${copy.missing}`)
    expect(extra.reply_markup.inline_keyboard).toEqual([
      [
        {
          text: '➕ @t27_blogger_bot',
          url: addToGroupLink('t27_blogger_bot'),
        },
      ],
    ])
    expect(isHiveBot(11)).toBe(true)
    expect(isHiveBot(13)).toBe(false)
  })

  it('a topic intro Telegram refuses does not stop the hive', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([agentRow(11, 'blogger')])
    f.telegram.getChatMember.mockImplementation(async (_c, user) =>
      user === MANAGER.id
        ? { status: 'administrator', can_manage_topics: true }
        : { status: 'member' }
    )
    f.telegram.sendMessage.mockRejectedValueOnce(new Error('TOPIC_CLOSED'))
    const c = inHive(f)
    await f.commands.get('hive')!(c, vi.fn())
    expect(store.setHiveTopic).toHaveBeenCalledWith(11, HIVE, 55)
    expect(c.reply.mock.calls[0][0]).toBe(copy.hiveReady(1))
  })

  it('says ready when every agent bot is already there', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([
      agentRow(12, 'coder', { hiveChatId: HIVE, hiveTopicId: 9 }),
    ])
    const c = inHive(f)
    await f.commands.get('hive')!(c, vi.fn())
    expect(c.reply).toHaveBeenCalledWith(copy.hiveReady(1), undefined)
  })

  it('a bot whose membership cannot be read counts as missing', async () => {
    const f = fakeBot()
    store.agentBots.mockResolvedValue([
      agentRow(12, 'coder', { hiveChatId: HIVE, hiveTopicId: 9 }),
    ])
    f.telegram.getChatMember.mockImplementation(async (_c, user) => {
      if (user === MANAGER.id) return { status: 'creator' }
      throw new Error('400')
    })
    const c = inHive(f)
    await f.commands.get('hive')!(c, vi.fn())
    expect(c.reply.mock.calls[0][0]).toContain(copy.missing)
  })

  it('refuses a group without topics, and a manager without topic rights', async () => {
    const f = fakeBot()
    f.telegram.getChat.mockResolvedValueOnce({ is_forum: false })
    const a = inHive(f)
    await f.commands.get('hive')!(a, vi.fn())
    expect(a.reply).toHaveBeenCalledWith(copy.notForum, undefined)

    const basic = f.ctx({ chat: { id: -5, type: 'group' } })
    await f.commands.get('hive')!(basic, vi.fn())
    expect(basic.reply).toHaveBeenCalledWith(copy.notForum, undefined)

    f.telegram.getChatMember.mockResolvedValueOnce({
      status: 'administrator',
      can_manage_topics: false,
    })
    const b = inHive(f)
    await f.commands.get('hive')!(b, vi.fn())
    expect(b.reply).toHaveBeenCalledWith(copy.noRights, undefined)
  })

  it('says there are no agent bots yet', async () => {
    const f = fakeBot()
    const c = inHive(f)
    await f.commands.get('hive')!(c, vi.fn())
    expect(c.reply).toHaveBeenCalledWith(copy.noAgents, undefined)
    expect(store.rememberHive).not.toHaveBeenCalled()
  })

  it('tells a stranger it is for the team; passes private chats on', async () => {
    const f = fakeBot()
    const s = inHive(f, { from: { id: 7, language_code: 'ru' } })
    await f.commands.get('hive')!(s, vi.fn())
    expect(s.reply).toHaveBeenCalledWith(HIVE_COPY.ru.only)
    const next = vi.fn()
    await f.commands.get('hive')!(f.ctx(), next)
    expect(next).toHaveBeenCalledOnce()
    const inert = fakeBot({ ...MANAGER, can_manage_bots: false })
    const n2 = vi.fn()
    await inert.commands.get('hive')!(inHive(inert), n2)
    expect(n2).toHaveBeenCalledOnce()
  })

  it('says it failed when Telegram does not answer', async () => {
    const f = fakeBot()
    f.telegram.getChat.mockRejectedValueOnce(new Error('timeout'))
    const c = inHive(f)
    await f.commands.get('hive')!(c, vi.fn())
    expect(c.reply).toHaveBeenCalledWith(copy.failed)
  })
})

describe('a bot is born as an agent', () => {
  const event = (ownerId: number, botUsername = 'my_new_bot') => ({
    botId: 21,
    botUsername,
    botName: 'x',
    ownerId,
    ownerName: 'x',
  })

  it('binds the claimed agent for the team only', async () => {
    const deps = agentHiveDeps({ tellOwner: vi.fn() } as any)
    store.bindAgent.mockResolvedValue(agentRow(21, 'coder'))
    claimAgent(ADMIN, 'coder')
    expect(await deps.claimAgent!(event(ADMIN), 't27ai_bot')).toMatchObject({
      agentId: 'coder',
    })
    expect(store.bindAgent).toHaveBeenCalledWith(21, 'coder', 't27ai_bot')

    claimAgent(7, 'coder')
    expect(await deps.claimAgent!(event(7), 't27ai_bot')).toBeNull()
    expect(await deps.claimAgent!(event(ADMIN), 't27ai_bot')).toBeNull()
  })

  it('writes its profile in both languages and tells the owner', async () => {
    const tellOwner = vi.fn(async () => undefined)
    const callApi = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValue(true)
    runner.runningTelegram.mockReturnValue({ callApi })
    const deps = agentHiveDeps({ tellOwner } as any)
    await deps.agentBorn!(agentRow(21, 'blogger'))
    expect(callApi.mock.calls.map(c => c[0])).toEqual([
      'setMyDescription',
      'setMyDescription',
      'setMyShortDescription',
      'setMyShortDescription',
    ])
    expect(callApi.mock.calls[1][1]).toMatchObject({ language_code: 'ru' })
    expect(tellOwner).toHaveBeenCalledWith(
      ADMIN,
      HIVE_COPY.ru.born(blogger, 't27_blogger_bot')
    )
  })

  it('still tells the owner when the bot is not running yet; skips a non-agent', async () => {
    const tellOwner = vi.fn(async () => undefined)
    runner.runningTelegram.mockReturnValue(undefined)
    const deps = agentHiveDeps({ tellOwner } as any)
    await deps.agentBorn!(agentRow(21, 'blogger'))
    expect(tellOwner).toHaveBeenCalledOnce()
    await deps.agentBorn!(agentRow(22, 'nobody'))
    expect(tellOwner).toHaveBeenCalledOnce()
  })

  it('asAgent hands the turn to the agent answer', async () => {
    const deps = agentHiveDeps({ tellOwner: vi.fn() } as any)
    const ctx = { message: undefined, chat: undefined, botInfo: { id: 1 } }
    await expect(deps.asAgent!(ctx, agentRow(21, 'blogger'))).resolves.toBe(
      false
    )
  })

  it('noteManager knows the manager at boot, and nothing without an id', () => {
    noteManager({})
    expect(isHiveBot(MANAGER.id)).toBe(false)
    noteManager({ id: MANAGER.id })
    expect(isHiveBot(MANAGER.id)).toBe(true)
  })
})
