import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  AGENT_COPY,
  answerAsAgent,
  chunks,
  clearAgentBots,
  forgetAgentBot,
  registerAgentBot,
  registerManager,
  rosterLine,
  runningAgentBots,
  type AgentCtx,
} from '@/core/bot/agentHive/answer'
import {
  clearChain,
  noteSent,
  placeOfIncoming,
} from '@/core/bot/agentHive/chain'
import {
  agentBotUsername,
  agentIdOfUsername,
  callsAll,
  mentions,
} from '@/core/bot/agentHive/rules'
import { HIVE_COPY } from '@/core/bot/agentHive'
import { HIVE_AGENTS } from '@/core/bot/agentHive/catalogue'
import type { ManagedBotRow } from '@/core/bot/managedBots/store'

const HIVE = -1009
const row = (botId: number, agentId: string | undefined, topic?: number) =>
  ({
    botId,
    botUsername: `t27_${agentId}_bot`,
    botName: String(agentId),
    ownerId: 144,
    managerBot: 't27ai_bot',
    status: 'live',
    agentId,
    hiveChatId: HIVE,
    hiveTopicId: topic,
  }) as ManagedBotRow

const BLOGGER = row(11, 'blogger', 70)

function harness(
  chat: { id: number; type: string } = { id: HIVE, type: 'supergroup' }
) {
  const sent: { chatId: number; text: string; extra?: any }[] = []
  let next = 2000
  const ctx = (message: unknown): AgentCtx => ({
    message,
    chat,
    botInfo: { id: BLOGGER.botId, username: BLOGGER.botUsername },
    telegram: {
      sendMessage: async (chatId, text, extra) => {
        sent.push({ chatId, text, extra })
        return { message_id: next++ }
      },
      sendChatAction: async () => {
        throw new Error('no typing on this host')
      },
    },
  })
  return { sent, ctx }
}

const tagged = (text: string, username = BLOGGER.botUsername) => [
  {
    type: 'mention',
    offset: text.indexOf(`@${username}`),
    length: username.length + 1,
  },
]

afterEach(() => {
  clearAgentBots()
  clearChain()
})

describe('the hive rules at their edges', () => {
  it('the all tag stands alone; a longer word is not a call to everybody', () => {
    expect(callsAll('@all hi')).toBe(true)
    expect(callsAll('hi @ALL')).toBe(true)
    expect(callsAll('@все, привет')).toBe(true)
    expect(callsAll('@allies and @всем')).toBe(false)
    expect(callsAll('@allies then @all.')).toBe(true)
    expect(callsAll('no tag')).toBe(false)
  })

  it('a text mention by id counts, a mention of someone else does not', () => {
    const me = { id: 11, username: 't27_blogger_bot' }
    expect(
      mentions(
        'Blogger',
        [{ type: 'text_mention', offset: 0, length: 7, user: { id: 11 } }],
        me
      )
    ).toBe(true)
    expect(
      mentions(
        'Coder',
        [{ type: 'text_mention', offset: 0, length: 5, user: { id: 12 } }],
        me
      )
    ).toBe(false)
    expect(
      mentions('@t27_coder_bot', tagged('@t27_coder_bot', 't27_coder_bot'), me)
    ).toBe(false)
    expect(
      mentions(
        '@T27_Blogger_Bot',
        tagged('@T27_Blogger_Bot', 'T27_Blogger_Bot'),
        me
      )
    ).toBe(true)
    expect(mentions('x', undefined, me)).toBe(false)
  })

  it('an agent bot username reads back to its agent, anything else to null', () => {
    for (const a of HIVE_AGENTS)
      expect(agentIdOfUsername(agentBotUsername(a.id))).toBe(a.id)
    expect(agentIdOfUsername('T27_CODER_BOT')).toBe('coder')
    expect(agentIdOfUsername('t27__bot')).toBeNull()
    expect(agentIdOfUsername('coder_bot')).toBeNull()
    expect(agentIdOfUsername('t27_coder')).toBeNull()
  })
})

describe('the chain at its edges', () => {
  it('forgets the oldest message past five thousand', () => {
    noteSent(HIVE, 1, 1, 5)
    for (let i = 2; i <= 5001; i++) noteSent(HIVE, i, 1, 5)
    const bot = { chatId: HIVE, fromBot: true, fromId: 11 }
    expect(placeOfIncoming({ ...bot, messageId: 1 })).toEqual({
      depth: 1,
      origin: null,
    })
    expect(placeOfIncoming({ ...bot, messageId: 5001 })).toEqual({
      depth: 1,
      origin: 5,
    })
  })

  it('an unknown bot message under a known parent is one deeper, in its name', () => {
    noteSent(HIVE, 40, 2, 5)
    expect(
      placeOfIncoming({
        chatId: HIVE,
        messageId: 41,
        fromBot: true,
        fromId: 12,
        replyToMessageId: 40,
      })
    ).toEqual({ depth: 3, origin: 5 })
  })
})

describe('an agent answer at its edges', () => {
  it('a long answer is cut on a line, and every piece is one deeper', async () => {
    registerAgentBot(BLOGGER)
    const h = harness()
    const long = `${'a'.repeat(3000)}\n${'b'.repeat(3000)}`
    const ok = await answerAsAgent(
      h.ctx({
        message_id: 7,
        text: `@${BLOGGER.botUsername} go`,
        entities: tagged(`@${BLOGGER.botUsername} go`),
        from: { id: 5, first_name: '', username: 'dima' },
      }),
      BLOGGER,
      { ask: async () => long }
    )
    expect(ok).toBe(true)
    expect(h.sent.map(s => s.text.length)).toEqual([3000, 3000])
    expect(h.sent[0].extra.reply_parameters).toBeDefined()
    expect(h.sent[1].extra.reply_parameters).toBeUndefined()
    for (const id of [2000, 2001])
      expect(
        placeOfIncoming({
          chatId: HIVE,
          messageId: id,
          fromBot: true,
          fromId: 11,
        })
      ).toEqual({ depth: 1, origin: 5 })
  })

  it('cuts with no newline at the limit, and drops an empty answer', () => {
    expect(chunks('x'.repeat(9000)).map(c => c.length)).toEqual([
      4000, 4000, 1000,
    ])
    expect(chunks('   ')).toEqual([])
  })

  it('tells the person it is busy when the agent fails', async () => {
    const h = harness({ id: 5, type: 'private' })
    await answerAsAgent(
      h.ctx({
        message_id: 1,
        text: 'hi',
        from: { id: 5, first_name: 'A', language_code: 'en' },
      }),
      BLOGGER,
      {
        ask: async () => {
          throw new Error('render down')
        },
      }
    )
    expect(h.sent[0].text).toBe(
      "I couldn't answer right now. Please try again in a minute."
    )
  })

  it('asks for words when a private message has none, stays quiet in a group', async () => {
    const p = harness({ id: 5, type: 'private' })
    const ask = vi.fn()
    expect(
      await answerAsAgent(
        p.ctx({ message_id: 1, from: { id: 5, first_name: 'A' } }),
        BLOGGER,
        { ask }
      )
    ).toBe(false)
    expect(p.sent[0].text).toBe(AGENT_COPY.ru.textOnly)
    const g = harness()
    expect(
      await answerAsAgent(
        g.ctx({
          message_id: 2,
          caption: '',
          from: { id: 5, first_name: 'A' },
          is_topic_message: true,
          message_thread_id: 70,
        }),
        BLOGGER,
        { ask }
      )
    ).toBe(false)
    expect(g.sent).toHaveLength(0)
    expect(ask).not.toHaveBeenCalled()
  })

  it('reads a caption, names a nameless person, answers in the own topic', async () => {
    registerAgentBot(BLOGGER)
    const h = harness()
    const ask = vi.fn(async () => 'ok')
    await answerAsAgent(
      h.ctx({
        message_id: 3,
        caption: 'look',
        from: { id: 5, first_name: '' },
        is_topic_message: true,
        message_thread_id: 70,
      }),
      BLOGGER,
      { ask }
    )
    expect(ask.mock.calls[0][1]).toContain('a person wrote:\nlook')
    expect(h.sent[0].extra.message_thread_id).toBe(70)
  })

  it('ignores channels, missing senders, rows without an agent, and bots in private', async () => {
    const ask = vi.fn()
    const ch = harness({ id: -1, type: 'channel' })
    expect(
      await answerAsAgent(
        ch.ctx({ message_id: 1, text: 'x', from: { id: 5 } }),
        BLOGGER,
        { ask }
      )
    ).toBe(false)
    const g = harness()
    expect(
      await answerAsAgent(g.ctx({ message_id: 1, text: 'x' }), BLOGGER, { ask })
    ).toBe(false)
    expect(
      await answerAsAgent(
        g.ctx({ message_id: 1, text: 'x', from: { id: 5 } }),
        row(13, undefined),
        { ask }
      )
    ).toBe(false)
    registerManager(99)
    const p = harness({ id: 99, type: 'private' })
    expect(
      await answerAsAgent(
        p.ctx({ message_id: 1, text: 'x', from: { id: 99, is_bot: true } }),
        BLOGGER,
        { ask }
      )
    ).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })

  it('names a bot author by username or id', async () => {
    registerAgentBot(BLOGGER)
    registerManager(99)
    const h = harness()
    const ask = vi.fn(async () => 'ok')
    noteSent(HIVE, 50, 1, 5)
    const text = `@${BLOGGER.botUsername} help`
    await answerAsAgent(
      h.ctx({
        message_id: 51,
        text,
        entities: tagged(text),
        from: { id: 99, is_bot: true },
        reply_to_message: { message_id: 50 },
      }),
      BLOGGER,
      { ask, now: () => 1e9 }
    )
    expect(ask.mock.calls[0][1]).toContain('@99 (an agent of this hive) wrote:')
    expect(ask.mock.calls[0][0]).toBe('5')
  })
})

describe('the hive registry', () => {
  it('lists running agent bots, forgets one, and drops a row without an agent', () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(row(12, 'coder'))
    expect(runningAgentBots().map(r => r.botId)).toEqual([11, 12])
    forgetAgentBot(12)
    registerAgentBot(row(11, undefined))
    expect(runningAgentBots()).toEqual([])
  })

  it('the roster names the other agents, or just the hive', () => {
    expect(rosterLine(HIVE, 11)).toBe('[Hive group.]')
    registerAgentBot(BLOGGER)
    registerAgentBot({ ...row(14, 'ghost'), agentId: 'ghost' } as ManagedBotRow)
    expect(rosterLine(HIVE, 11)).toContain('@t27_ghost_bot.')
    expect(rosterLine(HIVE, 14)).toContain('@t27_blogger_bot (')
  })
})

describe('every line of the hive copy renders in both languages', () => {
  it('has the same keys and no empty text', () => {
    const a = HIVE_AGENTS[0]
    for (const lang of ['ru', 'en'] as const) {
      const c = HIVE_COPY[lang]
      expect(Object.keys(c).sort()).toEqual(Object.keys(HIVE_COPY.ru).sort())
      for (const [key, v] of Object.entries(c)) {
        const out =
          typeof v === 'function'
            ? (v as (...x: unknown[]) => string)(a, 'bot', 3)
            : v
        expect(out, `${lang}.${key}`).toMatch(/\S/)
      }
    }
  })
})
