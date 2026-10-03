import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  agentConversationFor,
  privateTopicOf,
  threadPayload,
  threadedTelegram,
  topicThreadMiddleware,
  topicTitleFrom,
} from '@/navigation/topics/threads'
import {
  TABS,
  ensureTabs,
  nameFreshTopic,
  setTopicTabsDbForTests,
  topicsEnabled,
} from '@/navigation/topics/tabs'
import { mybotMarkup } from '@/navigation/topics/wire'

const topicMsg = (thread = 42, type = 'private') => ({
  message: {
    message_id: 1,
    chat: { id: 777, type },
    message_thread_id: thread,
    is_topic_message: true,
    text: 'hi',
  },
})

/** An in-memory bot_topic_tabs. */
function memoryDb() {
  const rows: any[] = []
  return {
    rows,
    async query(sql: string, p: unknown[] = []) {
      if (sql.startsWith('CREATE')) return { rows: [] }
      if (sql.startsWith('SELECT'))
        return {
          rows: rows.filter(r => r.bot === p[0] && r.tid === p[1]),
        }
      if (sql.startsWith('INSERT')) {
        if (
          !rows.some(
            r => r.bot === p[0] && r.tid === p[1] && r.thread_id === p[2]
          )
        )
          rows.push({
            bot: p[0],
            tid: p[1],
            thread_id: p[2],
            kind: p[3],
            title: p[4],
          })
        return { rows: [] }
      }
      if (sql.startsWith('DELETE')) {
        for (let i = rows.length - 1; i >= 0; i--)
          if (
            rows[i].bot === p[0] &&
            rows[i].tid === p[1] &&
            rows[i].kind !== 'chat'
          )
            rows.splice(i, 1)
        return { rows: [] }
      }
      throw new Error('unexpected sql ' + sql)
    },
  }
}

describe('private topics: the answer goes back into the tab', () => {
  it('reads the topic of a private message and of a pressed button', () => {
    expect(privateTopicOf(topicMsg(42))).toBe(42)
    expect(
      privateTopicOf({ callback_query: { message: topicMsg(9).message } })
    ).toBe(9)
  })

  it('ignores groups and messages outside a topic', () => {
    expect(privateTopicOf(topicMsg(42, 'supergroup'))).toBeUndefined()
    const m = topicMsg(42)
    ;(m.message as any).is_topic_message = false
    expect(privateTopicOf(m)).toBeUndefined()
  })

  it('adds the thread only to sends aimed at this chat that named none', () => {
    expect(
      threadPayload('sendMessage', { chat_id: 777, text: 'x' }, 777, 42)
    ).toEqual({ chat_id: 777, text: 'x', message_thread_id: 42 })
    // another chat
    expect(
      threadPayload('sendMessage', { chat_id: 1, text: 'x' }, 777, 42)
    ).not.toHaveProperty('message_thread_id')
    // explicit thread wins
    expect(
      threadPayload(
        'sendMessage',
        { chat_id: 777, message_thread_id: 5 },
        777,
        42
      ).message_thread_id
    ).toBe(5)
    // not a send
    expect(
      threadPayload('editMessageText', { chat_id: 777 }, 777, 42)
    ).not.toHaveProperty('message_thread_id')
    // a business-connection send
    expect(
      threadPayload(
        'sendMessage',
        { chat_id: 777, business_connection_id: 'b' },
        777,
        42
      )
    ).not.toHaveProperty('message_thread_id')
    expect(
      threadPayload(
        'sendChatAction',
        { chat_id: '777', action: 'typing' },
        777,
        42
      ).message_thread_id
    ).toBe(42)
  })

  it('threads a direct ctx.telegram.sendMessage without touching the shared client', async () => {
    const calls: any[] = []
    class Client {
      async callApi(method: string, payload: any) {
        calls.push([method, payload])
        return true
      }
      sendMessage(chat_id: number, text: string) {
        return this.callApi('sendMessage', { chat_id, text })
      }
    }
    const shared = new Client()
    const ctx: any = {
      update: topicMsg(42),
      chat: { id: 777, type: 'private' },
      telegram: shared,
      state: {},
    }
    await topicThreadMiddleware(ctx, async () => {
      await ctx.telegram.sendMessage(777, 'answer')
    })
    await shared.sendMessage(777, 'from another update')
    expect(calls[0][1].message_thread_id).toBe(42)
    expect(calls[1][1]).not.toHaveProperty('message_thread_id')
    expect(ctx.state.topicThreadId).toBe(42)
  })

  it('leaves an update without a topic exactly as it was', async () => {
    const shared = { callApi: vi.fn() }
    const ctx: any = {
      update: { message: { chat: { id: 1, type: 'private' } } },
      chat: { id: 1, type: 'private' },
      telegram: shared,
      state: {},
    }
    await topicThreadMiddleware(ctx, async () => undefined)
    expect(ctx.telegram).toBe(shared)
    expect(threadedTelegram(shared, 1, 2)).not.toBe(shared)
  })

  it('each tab is its own agent conversation', () => {
    expect(agentConversationFor(42)).toBe('topic42')
    expect(agentConversationFor(undefined)).toBeUndefined()
    expect(agentConversationFor(1)).toBe('topic1')
  })

  it('names a topic from its first line', () => {
    expect(topicTitleFrom('  make me\na reel ')).toBe('make me a reel')
    expect(topicTitleFrom('/start')).toBe('')
    expect(topicTitleFrom('x'.repeat(50)).length).toBe(32)
  })
})

describe('fixed tabs: made once per person', () => {
  let db: ReturnType<typeof memoryDb>
  beforeEach(() => {
    db = memoryDb()
    setTopicTabsDbForTests(db)
  })

  const api = () => {
    let next = 100
    const calls: any[] = []
    return {
      calls,
      async callApi(method: string, payload: any) {
        calls.push([method, payload])
        if (method === 'createForumTopic')
          return { message_thread_id: next++, name: payload.name }
        return true
      },
    }
  }

  it('topicsEnabled reads getMe', () => {
    expect(topicsEnabled({ has_topics_enabled: true })).toBe(true)
    expect(topicsEnabled({})).toBe(false)
  })

  it('a second /start makes no second set of tabs', async () => {
    const a = api()
    const first = await ensureTabs(a, 't27ai_bot', 777, true)
    expect(first).toEqual(TABS.map(t => t.kind))
    const second = await ensureTabs(a, 't27ai_bot', 777, true)
    expect(second).toEqual([])
    expect(a.calls.filter(c => c[0] === 'createForumTopic')).toHaveLength(
      TABS.length
    )
  })

  it('the intro of each tab is sent INTO that tab', async () => {
    const a = api()
    await ensureTabs(a, 't27ai_bot', 777, false, k =>
      k === 'mybot' ? { keyboard: [] } : undefined
    )
    const intros = a.calls.filter(c => c[0] === 'sendMessage').map(c => c[1])
    expect(intros.map(p => p.message_thread_id)).toEqual(
      TABS.map((_, i) => 100 + i)
    )
    expect(
      intros[TABS.findIndex(t => t.kind === 'mybot')].reply_markup
    ).toEqual({ keyboard: [] })
  })

  it('without a database no tab is made (it could not be remembered)', async () => {
    setTopicTabsDbForTests(null)
    const prev = [
      process.env.TOKENS_DATABASE_URL,
      process.env.RENDER_DATABASE_URL,
    ]
    delete process.env.TOKENS_DATABASE_URL
    delete process.env.RENDER_DATABASE_URL
    const a = api()
    expect(await ensureTabs(a, 'b', 1, true)).toEqual([])
    expect(a.calls).toHaveLength(0)
    if (prev[0]) process.env.TOKENS_DATABASE_URL = prev[0]
    if (prev[1]) process.env.RENDER_DATABASE_URL = prev[1]
  })

  it("a person's New Thread is named once from the first message; fixed tabs never", async () => {
    const a = api()
    await ensureTabs(a, 'b', 777, true)
    expect(await nameFreshTopic(a, 'b', 777, 100, 'hello')).toBe('')
    expect(await nameFreshTopic(a, 'b', 777, 555, 'Сделай рилс про кофе')).toBe(
      'Сделай рилс про кофе'
    )
    expect(await nameFreshTopic(a, 'b', 777, 555, 'second message')).toBe('')
    const edits = a.calls.filter(c => c[0] === 'editForumTopic')
    expect(edits).toEqual([
      [
        'editForumTopic',
        { chat_id: 777, message_thread_id: 555, name: 'Сделай рилс про кофе' },
      ],
    ])
  })

  it('the My bot tab carries the managed-bot creation button only when allowed', () => {
    const ctx = {
      botInfo: { can_manage_bots: true },
      from: { id: 5, first_name: 'A', username: 'alice' },
    }
    const m: any = mybotMarkup(ctx, 'mybot', false)
    expect(m.keyboard[0][0].request_managed_bot.suggested_username).toBe(
      'alice_agent_bot'
    )
    expect(mybotMarkup(ctx, 'reels', false)).toBeUndefined()
    expect(mybotMarkup({ ...ctx, botInfo: {} }, 'mybot', false)).toBeUndefined()
  })
})
