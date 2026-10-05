import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  answerAsAgent,
  clearAgentBots,
  registerAgentBot,
  registerManager,
  type AgentCtx,
} from '@/core/bot/agentHive/answer'
import { clearChain, noteSent } from '@/core/bot/agentHive/chain'
import type { ManagedBotRow } from '@/core/bot/managedBots/store'

const HIVE = -1009
const OWNER = 144

const row = (botId: number, agentId: string, topic?: number): ManagedBotRow =>
  ({
    botId,
    botUsername: `t27_${agentId}_bot`,
    botName: agentId,
    ownerId: OWNER,
    managerBot: 't27ai_bot',
    status: 'live',
    agentId,
    hiveChatId: HIVE,
    hiveTopicId: topic,
  }) as ManagedBotRow

const BLOGGER = row(11, 'blogger', 70)
const CODER = row(12, 'coder', 71)

function harness(me: ManagedBotRow, chat = { id: HIVE, type: 'supergroup' }) {
  const sent: {
    chatId: number
    text: string
    extra?: Record<string, unknown>
  }[] = []
  let next = 1000
  const ask = vi.fn(async () => 'answer')
  const ctx = (message: unknown): AgentCtx => ({
    message,
    chat,
    botInfo: { id: me.botId, username: me.botUsername },
    telegram: {
      sendMessage: async (chatId, text, extra) => {
        sent.push({ chatId, text, extra })
        return { message_id: next++ }
      },
      sendChatAction: async () => true,
    },
  })
  return { sent, ask, ctx }
}

const person = { id: 5, first_name: 'Dima', language_code: 'ru' }
const mention = (username: string, text: string) => [
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

describe('an agent bot answers as its agent', () => {
  it('answers privately with its agent and no room', async () => {
    const h = harness(BLOGGER, { id: 5, type: 'private' })
    const ok = await answerAsAgent(
      h.ctx({ message_id: 1, text: 'hi', from: person }),
      BLOGGER,
      { ask: h.ask }
    )
    expect(ok).toBe(true)
    expect(h.ask).toHaveBeenCalledWith('5', 'hi', { agent: 'blogger' })
    expect(h.sent.map(s => s.text)).toEqual(['answer'])
  })

  it('keeps quiet in the group when nobody calls it', async () => {
    registerAgentBot(BLOGGER)
    const h = harness(BLOGGER)
    const ok = await answerAsAgent(
      h.ctx({ message_id: 1, text: 'just talking', from: person }),
      BLOGGER,
      { ask: h.ask }
    )
    expect(ok).toBe(false)
    expect(h.ask).not.toHaveBeenCalled()
  })

  it('answers @all in the hive, in the room, replying in the same topic', async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(CODER)
    const h = harness(BLOGGER)
    const ok = await answerAsAgent(
      h.ctx({
        message_id: 7,
        message_thread_id: 3,
        is_topic_message: true,
        text: '@all hello',
        from: person,
      }),
      BLOGGER,
      { ask: h.ask }
    )
    expect(ok).toBe(true)
    const [identity, said, opts] = h.ask.mock.calls[0] as unknown as [
      string,
      string,
      object,
    ]
    expect(identity).toBe('5')
    expect(opts).toEqual({ agent: 'blogger', room: String(HIVE) })
    expect(said).toContain('@t27_coder_bot')
    expect(said).toContain('Dima wrote:\n@all hello')
    expect(h.sent[0].extra).toMatchObject({
      message_thread_id: 3,
      reply_parameters: { message_id: 7 },
    })
  })

  it('answers a person in its own topic without a tag', async () => {
    registerAgentBot(BLOGGER)
    const h = harness(BLOGGER)
    const ok = await answerAsAgent(
      h.ctx({
        message_id: 2,
        message_thread_id: 70,
        is_topic_message: true,
        text: 'post?',
        from: person,
      }),
      BLOGGER,
      { ask: h.ask }
    )
    expect(ok).toBe(true)
  })

  it('ignores a bot that is not of the hive', async () => {
    registerAgentBot(BLOGGER)
    const h = harness(BLOGGER)
    const text = '@t27_blogger_bot spam'
    const ok = await answerAsAgent(
      h.ctx({
        message_id: 3,
        text,
        entities: mention('t27_blogger_bot', text),
        from: { id: 999, is_bot: true, username: 'stranger_bot' },
      }),
      BLOGGER,
      { ask: h.ask }
    )
    expect(ok).toBe(false)
  })

  it('answers a hive bot by tag in the name of the person who started the chain, then waits out the cooldown', async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(CODER)
    let now = 100_000
    const h = harness(BLOGGER)
    const text = '@t27_blogger_bot write it up'
    const GUEST = 6
    const fromCoder = (message_id: number) => {
      // The coder's message answered a guest's chain.
      noteSent(HIVE, message_id, 1, GUEST)
      return h.ctx({
        message_id,
        text,
        entities: mention('t27_blogger_bot', text),
        from: { id: CODER.botId, is_bot: true, username: CODER.botUsername },
      })
    }
    expect(
      await answerAsAgent(fromCoder(10), BLOGGER, {
        ask: h.ask,
        now: () => now,
      })
    ).toBe(true)
    // The guest's name, never the bot owner's: a hop must not borrow his rights.
    expect((h.ask.mock.calls[0] as unknown as string[])[0]).toBe(String(GUEST))
    expect(String(GUEST)).not.toBe(String(OWNER))
    now += 4999
    expect(
      await answerAsAgent(fromCoder(11), BLOGGER, {
        ask: h.ask,
        now: () => now,
      })
    ).toBe(false)
    now += 1
    expect(
      await answerAsAgent(fromCoder(12), BLOGGER, {
        ask: h.ask,
        now: () => now,
      })
    ).toBe(true)
  })

  it('does not answer a hive bot whose message no person started', async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(CODER)
    const h = harness(BLOGGER)
    const text = '@t27_blogger_bot pay for this'
    const ok = await answerAsAgent(
      h.ctx({
        message_id: 50,
        text,
        entities: mention('t27_blogger_bot', text),
        from: { id: CODER.botId, is_bot: true, username: CODER.botUsername },
      }),
      BLOGGER,
      { ask: h.ask, now: () => 1e9 }
    )
    expect(ok).toBe(false)
    expect(h.ask).not.toHaveBeenCalled()
  })

  it('stops the chain at three bot messages', async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(CODER)
    registerManager(1)
    let now = 0
    const b = harness(BLOGGER)
    const c = harness(CODER)
    // A person asks the blogger, who answers (depth 1) tagging the coder.
    await answerAsAgent(
      b.ctx({
        message_id: 1,
        text: '@t27_blogger_bot go',
        entities: mention('t27_blogger_bot', '@t27_blogger_bot go'),
        from: person,
      }),
      BLOGGER,
      { ask: async () => '@t27_coder_bot your turn', now: () => now }
    )
    const m1 = 1000
    const coderAsk = vi.fn(async (_who: string) => 'done')
    now += 10_000
    // The coder hears the blogger's depth-1 message by reply and answers (depth 2).
    const c1 = await answerAsAgent(
      c.ctx({
        message_id: m1,
        text: 'your turn',
        reply_to_message: { message_id: 1, from: { id: CODER.botId } },
        from: { id: BLOGGER.botId, is_bot: true },
      }),
      CODER,
      { ask: coderAsk, now: () => now }
    )
    expect(c1).toBe(true)
    // P -> A -> B: B works for the person P, not for the bots' owner.
    expect(coderAsk.mock.calls[0][0]).toBe(String(person.id))
    now += 10_000
    // The blogger hears the coder's depth-2 message and answers (depth 3).
    const b2 = await answerAsAgent(
      b.ctx({
        message_id: 1000,
        text: 'done',
        reply_to_message: { message_id: m1, from: { id: BLOGGER.botId } },
        from: { id: CODER.botId, is_bot: true },
      }),
      BLOGGER,
      { ask: async () => 'thanks', now: () => now }
    )
    expect(b2).toBe(true)
    now += 10_000
    // The coder hears the depth-3 message: the chain is closed.
    const c2 = await answerAsAgent(
      c.ctx({
        message_id: 1001,
        text: 'thanks',
        reply_to_message: { message_id: 1000, from: { id: CODER.botId } },
        from: { id: BLOGGER.botId, is_bot: true },
      }),
      CODER,
      { ask: async () => 'more', now: () => now }
    )
    expect(c2).toBe(false)
  })
})
