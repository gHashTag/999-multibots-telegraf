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
  prepareTabsTable,
  setTopicTabsDbForTests,
  topicsEnabled,
} from '@/navigation/topics/tabs'
import { mybotMarkup, registerTabsCommand } from '@/navigation/topics/wire'

const topicMsg = (thread = 42, type = 'private') => ({
  message: {
    message_id: 1,
    chat: { id: 777, type },
    message_thread_id: thread,
    is_topic_message: true,
    text: 'hi',
  },
})

/**
 * An in-memory bot_topic_tabs that keeps the two unique keys the CREATE
 * statements declare: one row per thread, and one row per fixed tab kind.
 * Every query yields to the event loop first, so two /start handlers really
 * interleave, and every SELECT returns COPIES (Postgres does).
 */
function memoryDb() {
  const rows: any[] = []
  const ddl: string[] = []
  let selects = 0
  let inserts = 0
  const tick = () => new Promise(r => setTimeout(r, 0))
  const mine = (r: any, p: unknown[]) => r.bot === p[0] && r.tid === p[1]
  return {
    rows,
    ddl,
    get selects() {
      return selects
    },
    get inserts() {
      return inserts
    },
    async query(sql: string, p: unknown[] = []) {
      await tick()
      const q = sql.trim()
      if (q.startsWith('CREATE')) {
        ddl.push(q)
        return { rows: [] }
      }
      if (q.startsWith('SELECT')) {
        selects++
        return {
          rows: rows
            .filter(r => mine(r, p))
            .map(r => ({
              thread_id: r.thread_id,
              kind: r.kind,
              title: r.title,
              created_at: r.created_at,
            })),
        }
      }
      if (q.startsWith('INSERT')) {
        inserts++
        const [bot, tid, thread_id, kind, title] = p
        const clash = rows.some(
          r =>
            r.bot === bot &&
            r.tid === tid &&
            (r.thread_id === thread_id || (kind !== 'chat' && r.kind === kind))
        )
        if (clash) return { rows: [] }
        rows.push({ bot, tid, thread_id, kind, title, created_at: new Date() })
        return { rows: [{ thread_id }] }
      }
      if (q.startsWith('UPDATE') && /SET title = \$4 /.test(q)) {
        // spec v3 retitle: only the title moves, the thread stays.
        const r = rows.find(x => mine(x, p) && x.thread_id === p[2])
        if (r) r.title = p[3]
        return { rows: [] }
      }
      if (q.startsWith('UPDATE')) {
        const r = rows.find(x => mine(x, p) && x.thread_id === p[2])
        if (r) {
          r.thread_id = p[3]
          r.title = p[4]
        }
        return { rows: r ? [{ thread_id: p[3] }] : [] }
      }
      if (q.startsWith('DELETE')) {
        for (let i = rows.length - 1; i >= 0; i--)
          if (mine(rows[i], p) && rows[i].thread_id === p[2]) rows.splice(i, 1)
        return { rows: [] }
      }
      throw new Error('unexpected sql ' + q)
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
    await ensureTabs(a, 't27ai_bot', 777, false, t =>
      t.kind === 'mybot' ? { keyboard: [] } : undefined
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

/**
 * A Telegram that makes topics, and remembers which ones the person deleted.
 * The /tabs probe is editForumTopic with no name: a live topic answers
 * TOPIC_NOT_MODIFIED (nothing changed), a deleted one "thread not found".
 * A chat action is accepted either way, as the real one was.
 */
function telegram(opts: { deleted?: number[]; probeError?: string } = {}) {
  let next = 100
  const calls: any[] = []
  return {
    calls,
    made: () => calls.filter(c => c[0] === 'createForumTopic'),
    renames: () =>
      calls.filter(c => c[0] === 'editForumTopic' && 'name' in c[1]),
    async callApi(method: string, payload: any) {
      calls.push([method, payload])
      await new Promise(r => setTimeout(r, 0))
      if (method === 'createForumTopic')
        return { message_thread_id: next++, name: payload.name }
      if (method === 'editForumTopic' && !('name' in payload)) {
        if (opts.probeError) throw new Error(opts.probeError)
        if (opts.deleted?.includes(payload.message_thread_id)) {
          const e: any = new Error('400: Bad Request: message thread not found')
          e.response = { description: 'Bad Request: message thread not found' }
          throw e
        }
        const e: any = new Error('400: Bad Request: TOPIC_NOT_MODIFIED')
        e.response = { description: 'Bad Request: TOPIC_NOT_MODIFIED' }
        throw e
      }
      return true
    },
  }
}

describe('review of #3544: /tabs, two /start, an explicit null thread, no read per message', () => {
  let db: ReturnType<typeof memoryDb>
  beforeEach(() => {
    db = memoryDb()
    setTopicTabsDbForTests(db)
  })

  const tabsCommand = () => {
    let handler: any
    registerTabsCommand({
      command: (_: string, h: any) => (handler = h),
    } as any)
    return (tg: any) =>
      handler({
        chat: { id: 777, type: 'private' },
        from: { id: 777, language_code: 'en' },
        botInfo: { username: 'b', has_topics_enabled: true },
        telegram: tg,
        reply: async () => undefined,
        state: {},
      })
  }

  it('1. /tabs keeps every live tab and makes only the one the person deleted', async () => {
    const tg = telegram({ deleted: [102] })
    await ensureTabs(tg, 'b', 777, false)
    const before = db.rows.map(r => [r.kind, r.thread_id])
    await tabsCommand()(tg)
    expect(tg.made()).toHaveLength(TABS.length + 1)
    expect(tg.made().at(-1)![1].name).toBe(TABS[2].en)
    const after = new Map(db.rows.map(r => [r.kind, r.thread_id]))
    for (const [kind, thread] of before)
      if (kind !== TABS[2].kind) expect(after.get(kind)).toBe(thread)
    expect(after.get(TABS[2].kind)).toBe(106)
    expect(db.rows).toHaveLength(TABS.length)
    expect(tg.renames()).toEqual([])
  })

  it('1. /tabs twice makes nothing, and a network error forgets nothing', async () => {
    const tg = telegram()
    await ensureTabs(tg, 'b', 777, false)
    const written = db.inserts
    await tabsCommand()(tg)
    await tabsCommand()(tg)
    expect(tg.made()).toHaveLength(TABS.length)
    // a live stored tab is not even claimed again: no write, not just no make
    expect(db.inserts).toBe(written)
    const flaky = telegram({ probeError: 'ETIMEDOUT' })
    await tabsCommand()(flaky)
    expect(flaky.made()).toHaveLength(0)
    expect(db.rows).toHaveLength(TABS.length)
  })

  it('1. a topic whose Telegram name is a fixed tab is never renamed', async () => {
    const tg = telegram()
    const fixed = TABS[1].ru
    expect(await nameFreshTopic(tg, 'b', 777, 900, 'hello', fixed)).toBe('')
    expect(tg.renames()).toEqual([])
  })

  it('2. two /start at once make one set of tabs', async () => {
    const tg = telegram()
    await Promise.all([
      ensureTabs(tg, 'b', 777, true),
      ensureTabs(tg, 'b', 777, true),
      ensureTabs(tg, 'b', 777, true),
    ])
    expect(tg.made()).toHaveLength(TABS.length)
    expect(db.rows).toHaveLength(TABS.length)
    expect(db.rows.every(r => r.thread_id > 0)).toBe(true)
  })

  it('2. the CREATE declares the unique keys itself', async () => {
    await ensureTabs(telegram(), 'b', 777, true)
    const all = db.ddl.join('\n').replace(/\s+/g, ' ')
    expect(all).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS \w+ ON bot_topic_tabs \(bot_username, telegram_id, kind\) WHERE kind <> 'chat'/
    )
    expect(all).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS \w+ ON bot_topic_tabs \(bot_username, telegram_id, thread_id\)/
    )
  })

  it('2. a dead claim expires and a live one is respected', async () => {
    const old = new Date(Date.now() - 3 * 60_000)
    db.rows.push({
      bot: 'b',
      tid: 777,
      thread_id: -1,
      kind: TABS[0].kind,
      title: 'x',
      created_at: old,
    })
    db.rows.push({
      bot: 'b',
      tid: 777,
      thread_id: -2,
      kind: TABS[1].kind,
      title: 'x',
      created_at: new Date(),
    })
    const tg = telegram()
    await ensureTabs(tg, 'b', 777, false)
    const names = tg.made().map(c => c[1].name)
    expect(names).toContain(TABS[0].en)
    expect(names).not.toContain(TABS[1].en)
    expect(names).toHaveLength(TABS.length - 1)
  })

  it('3. a send that named its thread, even null, keeps it', () => {
    const n = threadPayload(
      'sendMessage',
      { chat_id: 777, message_thread_id: null },
      777,
      42
    )
    expect(n.message_thread_id).toBeNull()
    const u = threadPayload(
      'sendMessage',
      { chat_id: 777, message_thread_id: undefined },
      777,
      42
    )
    expect('message_thread_id' in u).toBe(true)
    expect(u.message_thread_id).toBeUndefined()
  })

  it('4. messages in a known tab cost no database read', async () => {
    const tg = telegram()
    await ensureTabs(tg, 'b', 777, true)
    await nameFreshTopic(tg, 'b', 777, 100, 'first')
    const warm = db.selects
    for (let i = 0; i < 5; i++) await nameFreshTopic(tg, 'b', 777, 100, 'more')
    expect(db.selects).toBe(warm)
    // a person's own topic: named once, then known without a read
    expect(await nameFreshTopic(tg, 'b', 777, 555, 'coffee reel')).toBe(
      'coffee reel'
    )
    const named = db.selects
    expect(await nameFreshTopic(tg, 'b', 777, 555, 'again')).toBe('')
    expect(db.selects).toBe(named)
    expect(tg.renames()).toHaveLength(1)
  })

  it('4. a make drops the cached tabs, so a new tab is known at once', async () => {
    const tg = telegram()
    expect(await nameFreshTopic(tg, 'b', 777, 100, 'early')).toBe('early')
    db.rows.length = 0
    setTopicTabsDbForTests(db)
    await nameFreshTopic(tg, 'b', 777, 999, '/start')
    await ensureTabs(tg, 'b', 777, true)
    expect(await nameFreshTopic(tg, 'b', 777, 101, 'hello')).toBe('')
  })
})

describe('review follow-ups: a slow maker, the naming window, the probe', () => {
  let db: ReturnType<typeof memoryDb>
  beforeEach(() => {
    db = memoryDb()
    setTopicTabsDbForTests(db)
  })

  it('A1. a maker slower than the claim lifetime keeps nothing and deletes its topic', async () => {
    const tg = telegram()
    let release: () => void = () => undefined
    const held = new Promise<void>(r => (release = r))
    let first = true
    const slow = {
      calls: tg.calls,
      async callApi(method: string, payload: any) {
        if (method === 'createForumTopic' && first) {
          first = false
          tg.calls.push([method, payload])
          await held
          return { message_thread_id: 900, name: payload.name }
        }
        return tg.callApi(method, payload)
      },
    }
    const a = ensureTabs(slow, 'b', 777, false)
    // let A claim its first tab and hang inside createForumTopic
    while (!tg.calls.some(c => c[0] === 'createForumTopic'))
      await new Promise(r => setTimeout(r, 0))
    // B comes three minutes later: A's claim is dead to it
    const b = await ensureTabs(tg, 'b', 777, false, undefined, {
      now: Date.now() + 3 * 60_000,
    })
    expect(b).toEqual(TABS.map(t => t.kind))
    release()
    const madeByA = await a
    expect(madeByA).toEqual([])
    // one row per tab, none of them A's late topic
    expect(db.rows).toHaveLength(TABS.length)
    expect(db.rows.every(r => r.thread_id > 0)).toBe(true)
    expect(db.rows.map(r => r.thread_id)).not.toContain(900)
    // A deleted the topic it made and wrote nothing into it
    expect(tg.calls.filter(c => c[0] === 'deleteForumTopic')).toEqual([
      ['deleteForumTopic', { chat_id: 777, message_thread_id: 900 }],
    ])
    const into900 = tg.calls.filter(
      c => c[0] === 'sendMessage' && c[1].message_thread_id === 900
    )
    expect(into900).toEqual([])
  })

  it("A1. a slow maker never takes over another attempt's claim", async () => {
    // B's claim is still pending (B is creating) when A's late answer comes
    const tg = telegram()
    let releaseA: () => void = () => undefined
    let releaseB: () => void = () => undefined
    const heldA = new Promise<void>(r => (releaseA = r))
    const heldB = new Promise<void>(r => (releaseB = r))
    let n = 0
    const api = {
      calls: tg.calls,
      async callApi(method: string, payload: any) {
        if (method === 'createForumTopic' && payload.name === TABS[0].en) {
          const mine = n++
          tg.calls.push([method, payload])
          await (mine === 0 ? heldA : heldB)
          return { message_thread_id: mine === 0 ? 900 : 901, name: 'x' }
        }
        return tg.callApi(method, payload)
      },
    }
    const a = ensureTabs(api, 'b', 777, false)
    while (n < 1) await new Promise(r => setTimeout(r, 0))
    const b = ensureTabs(api, 'b', 777, false, undefined, {
      now: Date.now() + 3 * 60_000,
    })
    while (n < 2) await new Promise(r => setTimeout(r, 0))
    releaseA()
    await new Promise(r => setTimeout(r, 5))
    releaseB()
    await Promise.all([a, b])
    const agent = db.rows.filter(r => r.kind === TABS[0].kind)
    expect(agent).toHaveLength(1)
    expect(agent[0].thread_id).toBe(901)
    expect(
      tg.calls.filter(c => c[0] === 'deleteForumTopic').map(c => c[1])
    ).toEqual([{ chat_id: 777, message_thread_id: 900 }])
  })

  it('A2. no topic is named while one of the tabs is being made', async () => {
    db.rows.push({
      bot: 'b',
      tid: 777,
      thread_id: -5,
      kind: TABS[3].kind,
      title: TABS[3].en,
      created_at: new Date(),
    })
    const tg = telegram()
    // thread 700 may be the tab being made right now: its row does not name it yet
    expect(await nameFreshTopic(tg, 'b', 777, 700, 'hello there')).toBe('')
    expect(tg.renames()).toEqual([])
    // a dead claim does not hold naming back
    db.rows[0].created_at = new Date(Date.now() - 3 * 60_000)
    expect(await nameFreshTopic(tg, 'b', 777, 701, 'coffee reel')).toBe(
      'coffee reel'
    )
  })

  it('A2. a claim made by another process is seen even with a warm cache', async () => {
    const tg = telegram()
    await ensureTabs(tg, 'b', 777, false)
    // warm the cache: a known tab costs no read
    expect(await nameFreshTopic(tg, 'b', 777, 100, 'hi')).toBe('')
    // another process (render's tabs_setup) claims a tab behind our back
    const agent = db.rows.find(r => r.kind === TABS[0].kind)!
    agent.thread_id = -77
    agent.created_at = new Date()
    expect(await nameFreshTopic(tg, 'b', 777, 800, 'hello')).toBe('')
    expect(tg.renames()).toEqual([])
  })

  it('A3. /tabs probes the topic itself: an edit that changes nothing', async () => {
    const tg = telegram()
    await ensureTabs(tg, 'b', 777, false)
    tg.calls.length = 0
    await ensureTabs(tg, 'b', 777, false, undefined, { probe: true })
    const probes = tg.calls.filter(c => c[0] === 'editForumTopic')
    expect(probes).toHaveLength(TABS.length)
    for (const [, p] of probes)
      expect(Object.keys(p).sort()).toEqual(['chat_id', 'message_thread_id'])
    expect(tg.calls.filter(c => c[0] === 'sendChatAction')).toEqual([])
    // TOPIC_NOT_MODIFIED is a live topic: nothing made, nothing forgotten
    expect(tg.made()).toEqual([])
    expect(db.rows).toHaveLength(TABS.length)
  })

  it('A3. known limit: a probe Telegram answers without an error keeps the tab', async () => {
    const tg = telegram()
    await ensureTabs(tg, 'b', 777, false)
    // a Telegram that accepted the no-op edit of a deleted topic would hide it
    const lenient = {
      calls: tg.calls,
      callApi: async (method: string, payload: any) =>
        method === 'editForumTopic' ? true : tg.callApi(method, payload),
    }
    await ensureTabs(lenient, 'b', 777, false, undefined, { probe: true })
    expect(tg.made()).toHaveLength(TABS.length)
  })
})

describe('B. the table is made at launch, not at the first /start', () => {
  it('a bot with topics on creates the table and its keys at startup', async () => {
    const db = memoryDb()
    setTopicTabsDbForTests(db)
    expect(await prepareTabsTable({ has_topics_enabled: true })).toBe('ready')
    expect(db.ddl.join('\n')).toMatch(
      /CREATE TABLE IF NOT EXISTS bot_topic_tabs/
    )
    expect(
      db.ddl.filter(q => q.startsWith('CREATE UNIQUE INDEX'))
    ).toHaveLength(2)
  })

  it('a bot without topics touches nothing; a refused CREATE is said, not thrown', async () => {
    const db = memoryDb()
    setTopicTabsDbForTests(db)
    expect(await prepareTabsTable({ has_topics_enabled: false })).toBe('off')
    expect(db.ddl).toEqual([])
    setTopicTabsDbForTests({
      query: async () => {
        throw new Error('permission denied for schema public')
      },
    })
    expect(await prepareTabsTable({ has_topics_enabled: true })).toBe('failed')
  })
})

/*
 * SPEC v3: TABS NAMED AFTER THEIR AGENTS, AND THE OLD NAMES RENAMED ONCE.
 *
 * Owner, 2026-10-08: "name the threads after the agents". Titles used to be
 * applied only when a tab was made, so everyone who already had tabs would
 * have kept "Reels", "Browser", "Hive" forever. A tab whose stored title is
 * not the table's current one is renamed on the next /start or /tabs, and its
 * row then holds the current title.
 */
describe('v3: a tab made under an older title is renamed to its agent', () => {
  let db: ReturnType<typeof memoryDb>
  beforeEach(() => {
    db = memoryDb()
    setTopicTabsDbForTests(db)
  })

  /** A Telegram where a named edit can be refused, or find the thread gone. */
  const tg = (named: { gone?: number[]; refuse?: string } = {}) => {
    let next = 100
    const calls: any[] = []
    return {
      calls,
      made: () => calls.filter(c => c[0] === 'createForumTopic'),
      renames: () =>
        calls.filter(c => c[0] === 'editForumTopic' && 'name' in c[1]),
      async callApi(method: string, payload: any) {
        calls.push([method, payload])
        if (method === 'createForumTopic')
          return { message_thread_id: next++, name: payload.name }
        if (method === 'editForumTopic' && 'name' in payload) {
          if (named.gone?.includes(payload.message_thread_id)) {
            const e: any = new Error(
              '400: Bad Request: message thread not found'
            )
            e.response = {
              description: 'Bad Request: message thread not found',
            }
            throw e
          }
          if (named.refuse) {
            const e: any = new Error(`400: Bad Request: ${named.refuse}`)
            e.response = { description: `Bad Request: ${named.refuse}` }
            throw e
          }
        }
        return true
      },
    }
  }

  /** Make the tabs, then age the given kinds back to their v2 titles. */
  const madeUnderV2 = async (api: any, kinds: Record<string, string>) => {
    await ensureTabs(api, 'b', 777, false)
    for (const r of db.rows) if (kinds[r.kind]) r.title = kinds[r.kind]
    api.calls.length = 0
  }

  it('the table names the agents, not the features', () => {
    expect(TABS.map(t => t.en)).toEqual([
      '🤖 Agent',
      '🎬 Director',
      '🌍 Navigator',
      '🛠 Builder',
      '💰 Treasurer',
      '🐝 Queen',
    ])
    expect(TABS.map(t => t.ru)).toEqual([
      '🤖 Агент', // cyrillic-ok: tab titles are interface text
      '🎬 Режиссёр', // cyrillic-ok: tab titles are interface text
      '🌍 Штурман', // cyrillic-ok: tab titles are interface text
      '🛠 Конструктор', // cyrillic-ok: tab titles are interface text
      '💰 Казначей', // cyrillic-ok: tab titles are interface text
      '🐝 Королева', // cyrillic-ok: tab titles are interface text
    ])
  })

  it('renames an old-titled tab once, in place, and then leaves it alone', async () => {
    const api = tg()
    await madeUnderV2(api, { reels: '🎬 Reels', hive: '🐝 Hive' })
    const threads = new Map(db.rows.map(r => [r.kind, r.thread_id]))

    expect(await ensureTabs(api, 'b', 777, false)).toEqual([])
    expect(api.made()).toEqual([])
    expect(api.renames().map(c => [c[1].message_thread_id, c[1].name])).toEqual(
      [
        [threads.get('reels'), '🎬 Director'],
        [threads.get('hive'), '🐝 Queen'],
      ]
    )
    // Same threads, current titles: the tab and its history stay.
    for (const r of db.rows) expect(r.thread_id).toBe(threads.get(r.kind))
    expect(db.rows.find(r => r.kind === 'reels')!.title).toBe('🎬 Director')

    api.calls.length = 0
    await ensureTabs(api, 'b', 777, false)
    expect(api.renames()).toEqual([])
  })

  it('a tab that already carries the current title is never edited', async () => {
    const api = tg()
    await madeUnderV2(api, {})
    await ensureTabs(api, 'b', 777, false)
    expect(api.renames()).toEqual([])
  })

  it('Telegram already showing the name only brings the row up to date', async () => {
    const api = tg({ refuse: 'TOPIC_NOT_MODIFIED' })
    await madeUnderV2(api, { browser: '🌍 Browser' })
    await ensureTabs(api, 'b', 777, false)
    expect(db.rows.find(r => r.kind === 'browser')!.title).toBe('🌍 Navigator')
  })

  it('a tab deleted behind our back is made again, not renamed', async () => {
    const first = tg()
    await madeUnderV2(first, { wallet: '💰 Balance & club' })
    const gone = db.rows.find(r => r.kind === 'wallet')!.thread_id
    const api = tg({ gone: [gone] })
    expect(await ensureTabs(api, 'b', 777, false)).toEqual(['wallet'])
    const wallet = db.rows.filter(r => r.kind === 'wallet')
    expect(wallet).toHaveLength(1)
    expect(wallet[0].thread_id).not.toBe(gone)
    expect(wallet[0].title).toBe('💰 Treasurer')
  })

  it('any other refused rename keeps the tab and its old row', async () => {
    const api = tg({ refuse: 'CHAT_ADMIN_REQUIRED' })
    await madeUnderV2(api, { mybot: '🛠 My bot' })
    expect(await ensureTabs(api, 'b', 777, false)).toEqual([])
    expect(api.made()).toEqual([])
    expect(db.rows.find(r => r.kind === 'mybot')!.title).toBe('🛠 My bot')
  })
})
