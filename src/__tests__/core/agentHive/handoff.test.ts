/**
 * A2A over Telegram (spec agent-hive-group.t27 v4, #3929): an agent hands a
 * task to a colleague bot to bot, in private; the colleague answers in the
 * person's name; the answer is carried to the person and starts no turn.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  answerAsAgent,
  clearAgentBots,
  registerAgentBot,
  type AgentCtx,
} from '@/core/bot/agentHive/answer'
import { clearChain, noteSent } from '@/core/bot/agentHive/chain'
import {
  clearAsks,
  handoffsIn,
  readTagged,
  tagged,
} from '@/core/bot/agentHive/handoff'
import * as SPEC from '@/spec/agent-hive-group.gen'
import type { ManagedBotRow } from '@/core/bot/managedBots/store'

const OWNER = 144
const row = (botId: number, agentId: string, ownerId = OWNER): ManagedBotRow =>
  ({
    botId,
    botUsername: `t27_${agentId}_bot`,
    botName: agentId,
    ownerId,
    agentId,
  }) as ManagedBotRow

const BLOGGER = row(11, 'blogger')
const TIKTOK = row(12, 'tiktok')
const STRANGER = row(13, 'google', 999)
const PERSON = { id: 5, first_name: 'Dima', language_code: 'ru' }

let clock = 1_000_000
function harness(me: ManagedBotRow, chatId: number, reply = 'answer') {
  const sent: { chatId: number | string; text: string }[] = []
  let next = 1000
  const ask = vi.fn(async (..._a: unknown[]) => reply)
  const ctx = (message: unknown): AgentCtx => ({
    message,
    chat: { id: chatId, type: 'private' },
    botInfo: { id: me.botId, username: me.botUsername },
    telegram: {
      sendMessage: async (to, text) => {
        sent.push({ chatId: to, text })
        return { message_id: next++ }
      },
      sendChatAction: async () => true,
    },
  })
  const deps = { ask, now: () => clock }
  return { sent, ask, ctx, deps }
}

const fromBot = (b: ManagedBotRow) => ({
  id: b.botId,
  is_bot: true,
  username: b.botUsername,
  first_name: b.botName,
})

afterEach(() => {
  clearAgentBots()
  clearChain()
  clearAsks()
  clock += 3_600_000
})

describe('the wire format', () => {
  it('a tagged message reads back, and anything else is no tag', () => {
    expect(readTagged(tagged(SPEC.DM_ASK, 5, 'make a reel'))).toEqual({
      kind: SPEC.DM_ASK,
      origin: 5,
      body: 'make a reel',
    })
    expect(readTagged('make a reel')).toBeNull()
    expect(readTagged('#a2a 1 5')).toBeNull()
    expect(readTagged('#a2a 1 0\nx')).toBeNull()
    expect(readTagged('#a2ab 1 5\nx')).toBeNull()
    expect(readTagged(' #a2a 1 5\nx')).toBeNull()
    expect(readTagged('say #a2a 1 5\nx')).toBeNull()
  })

  it('hand-off lines name colleagues only, once each', () => {
    const mates = ['t27_tiktok_bot', 't27_google_bot']
    expect(
      handoffsIn(
        'Sure.\n@t27_TikTok_bot: a 15 s reel\n@t27_tiktok_bot: again\n@someone_else: no\n@t27_google_bot : find demand',
        mates
      )
    ).toEqual([
      { username: 't27_tiktok_bot', task: 'a 15 s reel' },
      { username: 't27_google_bot', task: 'find demand' },
    ])
    expect(handoffsIn('see @t27_tiktok_bot: inline', mates)).toEqual([])
  })
})

describe('an agent hands a task to a colleague', () => {
  it('tells the agent who its colleagues are and sends the ask to @colleague', async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(TIKTOK)
    registerAgentBot(STRANGER)
    const h = harness(
      BLOGGER,
      PERSON.id,
      'Passing it on.\n@t27_tiktok_bot: a 15 s reel about cows'
    )
    await answerAsAgent(
      h.ctx({ message_id: 1, text: 'make me a reel', from: PERSON }),
      BLOGGER,
      h.deps
    )
    const said = String(h.ask.mock.calls[0][1])
    expect(said).toContain('@t27_tiktok_bot')
    expect(said).not.toContain('@t27_google_bot')
    expect(said.endsWith('make me a reel')).toBe(true)
    expect(h.sent.at(-1)).toEqual({
      chatId: '@t27_tiktok_bot',
      text: tagged(SPEC.DM_ASK, PERSON.id, 'a 15 s reel about cows'),
    })
  })

  it("a stranger owner's bot is no colleague: no ask goes to it", async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(STRANGER)
    const h = harness(BLOGGER, PERSON.id, '@t27_google_bot: find demand')
    await answerAsAgent(
      h.ctx({ message_id: 1, text: 'hi', from: PERSON }),
      BLOGGER,
      h.deps
    )
    expect(h.sent.map(s => s.chatId)).toEqual([PERSON.id])
    expect(String(h.ask.mock.calls[0][1])).toBe('hi')
  })

  it('at most two hand-offs per answer', async () => {
    const mates = ['a', 'b', 'c'].map((n, i) => row(20 + i, `mate${n}x`))
    registerAgentBot(BLOGGER)
    for (const r of mates) registerAgentBot(r)
    const h = harness(
      BLOGGER,
      PERSON.id,
      mates.map(r => `@${r.botUsername}: task`).join('\n')
    )
    await answerAsAgent(
      h.ctx({ message_id: 1, text: 'go', from: PERSON }),
      BLOGGER,
      h.deps
    )
    const asks = h.sent.filter(s => typeof s.chatId === 'string')
    expect(asks).toHaveLength(SPEC.MAX_DM_HANDOFFS)
  })

  it('a refused hand-off is told to the person, with the fix', async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(TIKTOK)
    const h = harness(BLOGGER, PERSON.id, '@t27_tiktok_bot: a reel')
    const c = h.ctx({ message_id: 1, text: 'go', from: PERSON })
    const send = c.telegram.sendMessage
    c.telegram.sendMessage = async (to, text) => {
      if (typeof to === 'string')
        throw new Error("Forbidden: bot can't send messages to bots")
      return send(to, text)
    }
    await answerAsAgent(c, BLOGGER, h.deps)
    const last = h.sent.at(-1)!
    expect(last.chatId).toBe(PERSON.id)
    expect(last.text).toContain('@t27_tiktok_bot')
    expect(last.text).toContain('Bot-to-Bot Communication Mode')
  })
})

describe('the colleague answers, and the answer is carried', () => {
  it("an ask runs the colleague in the person's name and answers back tagged", async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(TIKTOK)
    const h = harness(TIKTOK, BLOGGER.botId, 'here is the reel plan')
    const ok = await answerAsAgent(
      h.ctx({
        message_id: 1,
        text: tagged(SPEC.DM_ASK, PERSON.id, 'a reel'),
        from: fromBot(BLOGGER),
      }),
      TIKTOK,
      h.deps
    )
    expect(ok).toBe(true)
    expect(h.ask).toHaveBeenCalledTimes(1)
    expect(h.ask.mock.calls[0][0]).toBe(String(PERSON.id))
    expect(String(h.ask.mock.calls[0][1])).toContain('a reel')
    expect(h.sent).toEqual([
      {
        chatId: BLOGGER.botId,
        text: tagged(SPEC.DM_ANSWER, PERSON.id, 'here is the reel plan'),
      },
    ])
  })

  it('a bot that is no colleague, or a colleague with no tag, is not heard', async () => {
    registerAgentBot(TIKTOK)
    registerAgentBot(STRANGER)
    registerAgentBot(BLOGGER)
    const h = harness(TIKTOK, STRANGER.botId)
    expect(
      await answerAsAgent(
        h.ctx({
          message_id: 1,
          text: tagged(SPEC.DM_ASK, PERSON.id, 'x'),
          from: fromBot(STRANGER),
        }),
        TIKTOK,
        h.deps
      )
    ).toBe(false)
    expect(
      await answerAsAgent(
        h.ctx({ message_id: 2, text: 'plain words', from: fromBot(BLOGGER) }),
        TIKTOK,
        h.deps
      )
    ).toBe(false)
    expect(h.ask).not.toHaveBeenCalled()
    expect(h.sent).toEqual([])
  })

  it('the answer to its own fresh ask is carried to the person and starts no turn', async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(TIKTOK)
    const a = harness(BLOGGER, PERSON.id, '@t27_tiktok_bot: a reel')
    await answerAsAgent(
      a.ctx({ message_id: 1, text: 'go', from: PERSON }),
      BLOGGER,
      a.deps
    )
    const back = harness(BLOGGER, TIKTOK.botId)
    const ok = await answerAsAgent(
      back.ctx({
        message_id: 2,
        text: tagged(SPEC.DM_ANSWER, PERSON.id, 'the plan'),
        from: fromBot(TIKTOK),
      }),
      BLOGGER,
      back.deps
    )
    expect(ok).toBe(true)
    expect(back.ask).not.toHaveBeenCalled()
    expect(back.sent).toEqual([
      { chatId: PERSON.id, text: '↪ @t27_tiktok_bot:\nthe plan' },
    ])
  })

  it('an answer nobody asked for, or a stale one, is not carried', async () => {
    registerAgentBot(BLOGGER)
    registerAgentBot(TIKTOK)
    const msg = (id: number) => ({
      message_id: id,
      text: tagged(SPEC.DM_ANSWER, PERSON.id, 'unasked'),
      from: fromBot(TIKTOK),
    })
    const h = harness(BLOGGER, TIKTOK.botId)
    expect(await answerAsAgent(h.ctx(msg(1)), BLOGGER, h.deps)).toBe(false)
    const a = harness(BLOGGER, PERSON.id, '@t27_tiktok_bot: a reel')
    await answerAsAgent(
      a.ctx({ message_id: 2, text: 'go', from: PERSON }),
      BLOGGER,
      a.deps
    )
    clock += SPEC.DM_ANSWER_WINDOW_MS
    expect(await answerAsAgent(h.ctx(msg(3)), BLOGGER, h.deps)).toBe(false)
    expect(h.sent).toEqual([])
  })
})

describe('the group stays as it was', () => {
  it("in the hive group a bot that is not the hive's is not answered", async () => {
    const HIVE = -1009
    const hiveRow = { ...BLOGGER, hiveChatId: HIVE } as ManagedBotRow
    registerAgentBot(hiveRow)
    const h = harness(hiveRow, HIVE)
    // It replies to the agent's own message, whose person is known: only
    // the hive-bot guard keeps it out.
    noteSent(HIVE, 500, 1, PERSON.id)
    const c = h.ctx({
      message_id: 1,
      text: 'hi',
      reply_to_message: { message_id: 500, from: { id: hiveRow.botId } },
      from: { id: 777, is_bot: true, username: 'outsider_bot' },
    })
    c.chat = { id: HIVE, type: 'supergroup' }
    expect(await answerAsAgent(c, hiveRow, h.deps)).toBe(false)
    expect(h.ask).not.toHaveBeenCalled()
  })
})
