import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * THE HIVE'S v2/v3 LAWS, WIRED (spec agent-hive-group.t27).
 *
 * The rules are tested one by one in src/spec/agent-hive-group.test.ts; this
 * file proves each one is actually consulted by the agent's turn and by the
 * manager's commands: /stop, /mute, follow-ups, one speaker on @all, the seen
 * mark, /brief, a deleted topic remade, /summary.
 */

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const briefs = new Map<number, Map<number, string>>()
const setHiveTopic = vi.fn(async () => undefined)
vi.mock('@/core/bot/managedBots/store', () => ({
  setHiveTopic: (...a: unknown[]) => (setHiveTopic as any)(...a),
  hiveBriefs: async (chat: number) => new Map(briefs.get(chat) ?? []),
  setHiveBrief: async (
    chat: number,
    thread: number,
    brief: string,
    _by: number
  ) => {
    const all = briefs.get(chat) ?? new Map()
    if (brief) all.set(thread, brief)
    else all.delete(thread)
    briefs.set(chat, all)
  },
}))

import * as SPEC from '@/spec/agent-hive-group.gen'
import {
  answerAsAgent,
  allRank,
  clearAgentBots,
  registerAgentBot,
  SEEN_REACTION,
  type AgentCtx,
} from '@/core/bot/agentHive/answer'
import { clearChain, noteSent } from '@/core/bot/agentHive/chain'
import {
  clearRoom,
  noteMute,
  noteStop,
  lastLines,
} from '@/core/bot/agentHive/room'
import { installRoomCommands } from '@/core/bot/agentHive/index'
import type { ManagedBotRow } from '@/core/bot/managedBots/store'

const HIVE = -1009
const row = (botId: number, agentId: string, topic?: number): ManagedBotRow =>
  ({
    botId,
    botUsername: `t27_${agentId}_bot`,
    botName: agentId,
    ownerId: 144,
    status: 'live',
    agentId,
    hiveChatId: HIVE,
    hiveTopicId: topic,
  }) as ManagedBotRow

// Catalogue order: blogger before coder.
const BLOGGER = row(11, 'blogger', 70)
const CODER = row(12, 'coder', 71)
const DIMA = { id: 5, first_name: 'Dima', language_code: 'en' }
const ANNA = { id: 6, first_name: 'Anna', language_code: 'en' }

function harness(me: ManagedBotRow) {
  const sent: { text: string; extra?: Record<string, unknown> }[] = []
  const calls: { method: string; payload: Record<string, unknown> }[] = []
  let next = 1000
  let failSend: ((extra?: Record<string, unknown>) => unknown) | null = null
  const ask = vi.fn(async (..._a: unknown[]) => 'answer')
  const ctx = (message: unknown): AgentCtx => ({
    message,
    chat: { id: HIVE, type: 'supergroup' },
    botInfo: { id: me.botId, username: me.botUsername },
    telegram: {
      sendMessage: async (_chat, text, extra) => {
        const err = failSend?.(extra)
        if (err) throw err
        sent.push({ text, extra })
        return { message_id: next++ }
      },
      sendChatAction: async () => true,
      callApi: async (method, payload) => {
        calls.push({ method, payload })
        if (method === 'createForumTopic') return { message_thread_id: 99 }
        return true
      },
    },
  })
  return {
    sent,
    calls,
    ask,
    ctx,
    failWhen: (f: (extra?: Record<string, unknown>) => unknown) => {
      failSend = f
    },
  }
}

const msg = (
  id: number,
  text: string,
  from: object = DIMA,
  thread?: number,
  extra: object = {}
) => ({
  message_id: id,
  text,
  from,
  ...(thread !== undefined
    ? { message_thread_id: thread, is_topic_message: true }
    : {}),
  ...extra,
})
const tag = (username: string, text: string) => ({
  entities: [
    {
      type: 'mention',
      offset: text.indexOf(`@${username}`),
      length: username.length + 1,
    },
  ],
})

beforeEach(() => {
  registerAgentBot(BLOGGER)
  registerAgentBot(CODER)
})
afterEach(() => {
  clearAgentBots()
  clearChain()
  clearRoom()
  briefs.clear()
  setHiveTopic.mockClear()
})

describe('an agent never answers a command', () => {
  it('leaves /stop in its own topic to the manager', async () => {
    const h = harness(BLOGGER)
    expect(
      await answerAsAgent(h.ctx(msg(1, '/stop', DIMA, 70)), BLOGGER, {
        ask: h.ask,
      })
    ).toBe(false)
    expect(h.ask).not.toHaveBeenCalled()
  })
})

describe('follow-ups: the next message in the topic needs no tag', () => {
  const t = '@t27_blogger_bot draft a post'
  it('the agent that answered last hears the same person, for two minutes', async () => {
    let now = 1_000_000
    const h = harness(BLOGGER)
    const deps = { ask: h.ask, now: () => now }
    expect(
      await answerAsAgent(
        h.ctx(msg(1, t, DIMA, 3, tag('t27_blogger_bot', t))),
        BLOGGER,
        deps
      )
    ).toBe(true)
    now += SPEC.FOLLOW_UP_WINDOW_MS - 1
    expect(
      await answerAsAgent(
        h.ctx(msg(2, 'shorter please', DIMA, 3)),
        BLOGGER,
        deps
      )
    ).toBe(true)
    // Another person, another topic, or too late: no follow-up.
    expect(
      await answerAsAgent(h.ctx(msg(3, 'and me?', ANNA, 3)), BLOGGER, deps)
    ).toBe(false)
    expect(
      await answerAsAgent(h.ctx(msg(4, 'here?', DIMA, 4)), BLOGGER, deps)
    ).toBe(false)
    now += SPEC.FOLLOW_UP_WINDOW_MS
    expect(
      await answerAsAgent(h.ctx(msg(5, 'later', DIMA, 3)), BLOGGER, deps)
    ).toBe(false)
  })

  it('another agent does not take the follow-up', async () => {
    const b = harness(BLOGGER)
    const c = harness(CODER)
    await answerAsAgent(
      b.ctx(msg(1, t, DIMA, 3, tag('t27_blogger_bot', t))),
      BLOGGER,
      { ask: b.ask }
    )
    expect(
      await answerAsAgent(c.ctx(msg(2, 'more', DIMA, 3)), CODER, { ask: c.ask })
    ).toBe(false)
  })
})

describe('on @all only the best fit answers', () => {
  it('in the general topic the first agent of the catalogue speaks, the rest wait', async () => {
    const b = harness(BLOGGER)
    const c = harness(CODER)
    expect(
      await answerAsAgent(b.ctx(msg(1, '@all hi', DIMA, 3)), BLOGGER, {
        ask: b.ask,
      })
    ).toBe(true)
    expect(
      await answerAsAgent(c.ctx(msg(1, '@all hi', DIMA, 3)), CODER, {
        ask: c.ask,
      })
    ).toBe(false)
  })

  it("in an agent's topic, or when the text names it, that agent is first", () => {
    expect(allRank(HIVE, 71, '@all hi', CODER.botId)).toBe(0)
    expect(allRank(HIVE, 71, '@all hi', BLOGGER.botId)).toBe(1)
    expect(allRank(HIVE, 3, '@all Coding Scientist, look', CODER.botId)).toBe(0)
  })

  it('a tag still reaches the agent that is not first', async () => {
    const c = harness(CODER)
    const t = '@all and @t27_coder_bot please'
    expect(
      await answerAsAgent(
        c.ctx(msg(1, t, DIMA, 3, tag('t27_coder_bot', t))),
        CODER,
        { ask: c.ask }
      )
    ).toBe(true)
  })
})

describe('/mute and /stop', () => {
  it('a muted topic is heard only by tag, for the hour', async () => {
    let now = 5_000_000
    const h = harness(BLOGGER)
    noteMute(HIVE, 70, undefined, now)
    const deps = { ask: h.ask, now: () => now }
    expect(
      await answerAsAgent(h.ctx(msg(1, 'post?', DIMA, 70)), BLOGGER, deps)
    ).toBe(false)
    const t = '@t27_blogger_bot post?'
    expect(
      await answerAsAgent(
        h.ctx(msg(2, t, DIMA, 70, tag('t27_blogger_bot', t))),
        BLOGGER,
        deps
      )
    ).toBe(true)
    now += SPEC.MUTE_MS
    expect(
      await answerAsAgent(h.ctx(msg(3, 'post?', DIMA, 70)), BLOGGER, deps)
    ).toBe(true)
  })

  it('muting one agent leaves the others hearing', async () => {
    const h = harness(CODER)
    noteMute(HIVE, 71, BLOGGER.botId)
    expect(
      await answerAsAgent(h.ctx(msg(1, 'fix it', DIMA, 71)), CODER, {
        ask: h.ask,
      })
    ).toBe(true)
  })

  it('a stop silences bots for ten minutes and never a person', async () => {
    let now = 9_000_000
    const h = harness(BLOGGER)
    const deps = { ask: h.ask, now: () => now }
    noteStop(HIVE, now)
    const t = '@t27_blogger_bot write it up'
    noteSent(HIVE, 50, 1, DIMA.id)
    const fromCoder = h.ctx(
      msg(
        50,
        t,
        { id: CODER.botId, is_bot: true, username: CODER.botUsername },
        3,
        tag('t27_blogger_bot', t)
      )
    )
    expect(await answerAsAgent(fromCoder, BLOGGER, deps)).toBe(false)
    expect(
      await answerAsAgent(
        h.ctx(msg(51, t, DIMA, 3, tag('t27_blogger_bot', t))),
        BLOGGER,
        deps
      )
    ).toBe(true)
    now += SPEC.STOP_WINDOW_MS
    noteSent(HIVE, 52, 1, DIMA.id)
    expect(
      await answerAsAgent(
        h.ctx(
          msg(
            52,
            t,
            { id: CODER.botId, is_bot: true, username: CODER.botUsername },
            3,
            tag('t27_blogger_bot', t)
          )
        ),
        BLOGGER,
        deps
      )
    ).toBe(true)
  })
})

describe('the seen mark', () => {
  it('👀 while the agent works, kept when it answered', async () => {
    const h = harness(BLOGGER)
    await answerAsAgent(h.ctx(msg(1, 'post?', DIMA, 70)), BLOGGER, {
      ask: h.ask,
    })
    const reactions = h.calls.filter(c => c.method === 'setMessageReaction')
    expect(reactions).toHaveLength(1)
    expect(reactions[0].payload).toMatchObject({
      chat_id: HIVE,
      message_id: 1,
      reaction: [{ type: 'emoji', emoji: SEEN_REACTION }],
    })
  })

  it('taken away when the turn failed', async () => {
    const h = harness(BLOGGER)
    h.ask.mockRejectedValueOnce(new Error('render down'))
    await answerAsAgent(h.ctx(msg(1, 'post?', DIMA, 70)), BLOGGER, {
      ask: h.ask,
    })
    const reactions = h.calls.filter(c => c.method === 'setMessageReaction')
    expect(reactions.map(r => r.payload.reaction)).toEqual([
      [{ type: 'emoji', emoji: SEEN_REACTION }],
      [],
    ])
  })
})

describe('/brief reaches the turn', () => {
  it("the topic's brief wins over the group's", async () => {
    briefs.set(
      HIVE,
      new Map([
        [0, 'Answer in Russian.'],
        [70, 'Posts under 500 characters.'],
      ])
    )
    const h = harness(BLOGGER)
    await answerAsAgent(h.ctx(msg(1, 'post?', DIMA, 70)), BLOGGER, {
      ask: h.ask,
    })
    const said = String(h.ask.mock.calls[0][1])
    expect(said).toContain('Posts under 500 characters.')
    expect(said).not.toContain('Answer in Russian.')
  })

  it("elsewhere the group's brief is carried", async () => {
    briefs.set(HIVE, new Map([[0, 'Answer in Russian.']]))
    const h = harness(BLOGGER)
    await answerAsAgent(h.ctx(msg(1, 'post?', DIMA, 70)), BLOGGER, {
      ask: h.ask,
    })
    expect(String(h.ask.mock.calls[0][1])).toContain('Answer in Russian.')
  })
})

describe('a deleted topic is remade', () => {
  it('once per cooldown, and the answer goes into the new topic', async () => {
    let now = 20_000_000
    const h = harness(BLOGGER)
    const gone = Object.assign(
      new Error('400: Bad Request: message thread not found'),
      {}
    )
    h.failWhen(extra => (extra?.message_thread_id === 70 ? gone : null))
    const deps = { ask: h.ask, now: () => now }
    expect(
      await answerAsAgent(h.ctx(msg(1, 'post?', DIMA, 70)), BLOGGER, deps)
    ).toBe(true)
    expect(h.calls.filter(c => c.method === 'createForumTopic')).toHaveLength(1)
    expect(h.sent[0].extra).toMatchObject({ message_thread_id: 99 })
    expect(setHiveTopic).toHaveBeenCalledWith(BLOGGER.botId, HIVE, 99)
    // The row now points at 99; a second loss inside the cooldown is not retried.
    h.failWhen(() => gone)
    now += SPEC.TOPIC_RECREATE_COOLDOWN_MS - 1
    await expect(
      answerAsAgent(h.ctx(msg(2, 'again?', DIMA, 99)), BLOGGER, deps)
    ).rejects.toThrow(/thread not found/)
    expect(h.calls.filter(c => c.method === 'createForumTopic')).toHaveLength(1)
  })

  it('another error is not a deleted topic', async () => {
    const h = harness(BLOGGER)
    h.failWhen(() => new Error('429: Too Many Requests'))
    await expect(
      answerAsAgent(h.ctx(msg(1, 'post?', DIMA, 70)), BLOGGER, { ask: h.ask })
    ).rejects.toThrow(/Too Many/)
    expect(h.calls.filter(c => c.method === 'createForumTopic')).toHaveLength(0)
  })
})

describe("the manager's commands", () => {
  function commands(ask = vi.fn(async () => 'the summary')) {
    const handlers = new Map<string, (ctx: any, next: () => any) => any>()
    const bot = {
      command: (name: string, fn: any) => handlers.set(name, fn),
    }
    installRoomCommands(bot as any, ask)
    const run = async (
      name: string,
      text: string,
      opts: { thread?: number; admin?: boolean; from?: object } = {}
    ) => {
      const replies: string[] = []
      const next = vi.fn()
      await handlers.get(name)!(
        {
          chat: { id: HIVE, type: 'supergroup' },
          from: opts.from ?? DIMA,
          message: {
            text,
            ...(opts.thread !== undefined
              ? { is_topic_message: true, message_thread_id: opts.thread }
              : {}),
          },
          telegram: {
            getChatMember: async () => ({
              status: opts.admin ? 'administrator' : 'member',
            }),
          },
          sendChatAction: async () => true,
          reply: async (t: string) => replies.push(t),
        },
        next
      )
      return { replies, next }
    }
    return { run, ask }
  }

  it('/stop and /mute are answered in a hive, passed on elsewhere', async () => {
    const c = commands()
    expect((await c.run('stop', '/stop')).replies[0]).toMatch(/stop/)
    expect(
      (await c.run('mute', '/mute @t27_coder_bot', { thread: 71 })).replies[0]
    ).toContain('@t27_coder_bot')
    clearAgentBots()
    const outside = await c.run('stop', '/stop')
    expect(outside.replies).toEqual([])
    expect(outside.next).toHaveBeenCalled()
  })

  it('/mute makes the agent need its tag', async () => {
    const c = commands()
    await c.run('mute', '/mute @t27_blogger_bot', { thread: 70 })
    const h = harness(BLOGGER)
    expect(
      await answerAsAgent(h.ctx(msg(1, 'post?', DIMA, 70)), BLOGGER, {
        ask: h.ask,
      })
    ).toBe(false)
  })

  it('/brief: admins only, bounded, "-" clears it, bare shows it', async () => {
    const c = commands()
    expect((await c.run('brief', '/brief be kind')).replies[0]).toMatch(
      /admins/
    )
    expect(briefs.get(HIVE)).toBeUndefined()
    const long = 'x'.repeat(SPEC.MAX_BRIEF_CHARS + 1)
    expect(
      (await c.run('brief', `/brief ${long}`, { admin: true })).replies[0]
    ).toMatch(/longer/)
    await c.run('brief', '/brief be kind', { admin: true, thread: 70 })
    expect(briefs.get(HIVE)?.get(70)).toBe('be kind')
    expect(
      (await c.run('brief', '/brief', { thread: 70 })).replies[0]
    ).toContain('be kind')
    await c.run('brief', '/brief -', { admin: true, thread: 70 })
    expect(briefs.get(HIVE)?.has(70)).toBe(false)
  })

  it('/summary reads the topic log, at most what was asked, in the asker’s name', async () => {
    const c = commands()
    const empty = await c.run('summary', '/summary', { thread: 70 })
    expect(empty.replies[0]).toMatch(/nothing/)
    const h = harness(BLOGGER)
    for (let i = 1; i <= 5; i++)
      await answerAsAgent(h.ctx(msg(i, `line ${i}`, ANNA, 70)), BLOGGER, {
        ask: h.ask,
      })
    // Five person lines and five answers were logged.
    expect(lastLines(HIVE, 70, 100)).toHaveLength(10)
    const out = await c.run('summary', '/summary 3', { thread: 70 })
    expect(out.replies).toEqual(['the summary'])
    const [identity, prompt, room] = c.ask.mock.calls[0] as unknown as string[]
    expect(identity).toBe(String(DIMA.id))
    expect(room).toBe(String(HIVE))
    expect(prompt).toContain('last 3 messages')
    expect(prompt).not.toContain('line 1')
  })
})
