/**
 * Spec bot-agent-team.t27 (gHashTag/t27#7855), every test block run against
 * the bot's code in navigation/topics/team.ts, then the behaviour: the first
 * /start makes the Agent alone (and the member the link named), the Agent
 * tab offers the rest, a hire press makes that one tab, /tabs makes nobody
 * new. The render's half (each member's trade, every tool) is bound in
 * apps/vibee-editor/render/src/spec/bot-agent-team.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from './bot-agent-team.gen'
import {
  mayRetry,
  mayStart,
  mayWait,
  retryPauseMs,
} from '@/services/personTurns'
import { TAB_KEYS } from './bot-topic-tabs.gen'
import {
  addressed,
  appHireMakesTab,
  appLists,
  hasTrade,
  hireRows,
  hireable,
  joinsAtStart,
  labelled,
  moneyButtonsHere,
  leadsWith,
  offered,
  speaker,
  offeredKinds,
  startingKinds,
  tended,
  toolShown,
} from '@/navigation/topics/team'
import { setTopicTabsDbForTests } from '@/navigation/topics/tabs'
import {
  ensureTabsQuietly,
  keptRows,
  registerTabsCommand,
  teamMarkup,
  teamText,
} from '@/navigation/topics/wire'

describe('spec bot-agent-team.t27', () => {
  it('the Agent is on every team from the first start; the others join by the link the person came by', () => {
    expect(joinsAtStart(0, false)).toBe(true)
    expect(joinsAtStart(0, true)).toBe(true)
    expect(joinsAtStart(1, false)).toBe(false)
    expect(joinsAtStart(1, true)).toBe(true)
    expect(joinsAtStart(5, false)).toBe(false)
    expect(joinsAtStart(5, true)).toBe(true)
  })

  it('a tab the person has is looked after; one that does not join is never made', () => {
    expect(tended(true, false)).toBe(true)
    expect(tended(true, true)).toBe(true)
    expect(tended(false, true)).toBe(true)
    expect(tended(false, false)).toBe(false)
  })

  it('every member not yet on the team is offered, the core never', () => {
    expect(offered(0, false)).toBe(false)
    expect(offered(0, true)).toBe(false)
    expect(offered(1, false)).toBe(true)
    expect(offered(1, true)).toBe(false)
    expect(offered(5, false)).toBe(true)
    expect(offered(6, false)).toBe(false)
  })

  it('one team in the bot and the app: a member is listed when on the team, or every member without tabs', () => {
    expect(SPEC.APP_CHAT_IS_TAB).toBe(true)
    expect(appLists(true, true)).toBe(true)
    expect(appLists(false, true)).toBe(false)
    expect(appLists(false, false)).toBe(true)
    expect(appLists(true, false)).toBe(true)
    expect(appHireMakesTab(true, true)).toBe(true)
    expect(appHireMakesTab(false, true)).toBe(false)
    expect(appHireMakesTab(true, false)).toBe(false)
  })

  it('every member is in every channel: a member named first speaks, the channel keeps its memory', () => {
    expect(speaker(4, 1)).toBe(4)
    expect(speaker(SPEC.TEAM_SIZE, 1)).toBe(1)
    expect(speaker(SPEC.TEAM_SIZE - 1, 0)).toBe(SPEC.TEAM_SIZE - 1)
    expect(speaker(0, 3)).toBe(0)
    expect(addressed(true, true)).toBe(true)
    expect(addressed(false, true)).toBe(false)
    expect(addressed(true, false)).toBe(false)
    expect(SPEC.GUEST_KEEPS_CHANNEL_MEMORY).toBe(true)
    expect(labelled(4, 1)).toBe(true)
    expect(labelled(1, 1)).toBe(false)
  })

  it('every member is shown every tool; its trade is what it leads with', () => {
    expect(SPEC.EVERY_TOOL_FOR_EVERY_MEMBER).toBe(true)
    expect(toolShown(SPEC.EVERY_TOOL_FOR_EVERY_MEMBER, false)).toBe(true)
    expect(toolShown(SPEC.EVERY_TOOL_FOR_EVERY_MEMBER, true)).toBe(true)
    expect(toolShown(false, true)).toBe(true)
    expect(toolShown(false, false)).toBe(false)
    expect(leadsWith(false, true)).toBe(true)
    expect(leadsWith(false, false)).toBe(false)
    expect(leadsWith(true, true)).toBe(false)
  })

  it("only a fixed tab other than the Agent's has a trade", () => {
    expect(hasTrade(true, false)).toBe(true)
    expect(hasTrade(true, true)).toBe(false)
    expect(hasTrade(false, false)).toBe(false)
    expect(hasTrade(false, true)).toBe(false)
  })

  it('six members, one core, two hire buttons a row', () => {
    expect(SPEC.TEAM_SIZE).toBe(6)
    expect(SPEC.TEAM_CORE).toBe(1)
    expect(SPEC.HIRE_BUTTONS_PER_ROW).toBe(2)
    expect(joinsAtStart(SPEC.TEAM_CORE - 1, false)).toBe(true)
    expect(joinsAtStart(SPEC.TEAM_CORE, false)).toBe(false)
    expect(offered(SPEC.TEAM_SIZE - 1, false)).toBe(true)
    expect(offered(SPEC.TEAM_SIZE, false)).toBe(false)
    // The team is the tab table (bot-topic-tabs.t27), member for member.
    expect(TAB_KEYS).toHaveLength(SPEC.TEAM_SIZE)
    expect(SPEC.TEAM_LEAD_TOOLS).toHaveLength(SPEC.TEAM_SIZE)
  })

  it("a person's turns run one at a time, and a refused one is tried again with a growing pause", () => {
    expect(mayStart(0)).toBe(true)
    expect(mayStart(1)).toBe(false)
    expect(mayWait(SPEC.TURNS_WAITING_MAX - 1)).toBe(true)
    expect(mayWait(SPEC.TURNS_WAITING_MAX)).toBe(false)
    expect(retryPauseMs(0)).toBe(4000)
    expect(retryPauseMs(1)).toBe(8000)
    expect(retryPauseMs(2)).toBe(16000)
    expect(mayRetry(SPEC.LIMIT_RETRIES - 1)).toBe(true)
    expect(mayRetry(SPEC.LIMIT_RETRIES)).toBe(false)
    expect(SPEC.NAMES_ITSELF_FIRST).toBe(true)
  })

  it("the pay buttons live in the Treasurer's tab, or everywhere in a chat without tabs", () => {
    expect(moneyButtonsHere(true, true)).toBe(true)
    expect(moneyButtonsHere(true, false)).toBe(false)
    expect(moneyButtonsHere(false, false)).toBe(true)
    expect(moneyButtonsHere(false, true)).toBe(true)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(2)
  })
})

describe('who joins, who is offered', () => {
  it('the first /start makes the Agent; a link to a screen brings its member', () => {
    expect(startingKinds(null)).toEqual(['agent'])
    expect(startingKinds('story')).toEqual(['agent', 'reels'])
    expect(startingKinds('club')).toEqual(['agent', 'wallet'])
    expect(startingKinds('chat')).toEqual(['agent'])
    expect(startingKinds('nowhere')).toEqual(['agent'])
  })

  it('the rest is offered in tab order, two to a row', () => {
    expect(offeredKinds(['agent'])).toEqual(TAB_KEYS.slice(1))
    expect(offeredKinds(['agent', 'reels', 'hive'])).toEqual([
      'browser',
      'mybot',
      'wallet',
    ])
    const rows = hireRows(['reels', 'browser', 'mybot'], k => k)
    expect(rows.map(r => r.length)).toEqual([2, 1])
    expect(rows[0][0]).toEqual({ text: '+ reels', callback_data: 'team:reels' })
    expect(hireable('reels')).toBe(true)
    expect(hireable('agent')).toBe(false)
    expect(hireable('nobody')).toBe(false)
  })

  it('a whole team gets no keyboard (Telegram refuses an empty one)', () => {
    expect(teamMarkup(new Set(TAB_KEYS), false)).toEqual({})
    expect(teamText(new Set(TAB_KEYS), false)).toMatch(/whole team/)
    expect(
      teamMarkup(new Set(['agent']), false).reply_markup.inline_keyboard
    ).toHaveLength(3)
  })

  it('a hire edit keeps the card’s other buttons', () => {
    expect(
      keptRows({
        inline_keyboard: [
          [{ text: '+ a', callback_data: 'team:reels' }],
          [{ text: 'App', web_app: { url: 'u' } }],
        ],
      })
    ).toEqual([[{ text: 'App', web_app: { url: 'u' } }]])
  })
})

/** An in-memory bot_topic_tabs, enough for the claim protocol. */
function memoryDb() {
  const rows: any[] = []
  const mine = (r: any, p: unknown[]) => r.bot === p[0] && r.tid === p[1]
  return {
    rows,
    async query(sql: string, p: unknown[] = []) {
      const q = sql.trim()
      if (q.startsWith('CREATE')) return { rows: [] }
      if (q.startsWith('SELECT'))
        return { rows: rows.filter(r => mine(r, p)).map(r => ({ ...r })) }
      if (q.startsWith('INSERT')) {
        const [bot, tid, thread_id, kind, title] = p
        if (rows.some(r => r.bot === bot && r.tid === tid && r.kind === kind))
          return { rows: [] }
        rows.push({ bot, tid, thread_id, kind, title, created_at: new Date() })
        return { rows: [{ thread_id }] }
      }
      if (q.startsWith('UPDATE') && /SET title = \$4 /.test(q))
        return { rows: [] }
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

describe('the team in the private chat', () => {
  let db: ReturnType<typeof memoryDb>
  beforeEach(() => {
    db = memoryDb()
    setTopicTabsDbForTests(db)
  })

  const person = (botName = 'b') => {
    let next = 100
    const calls: any[] = []
    const telegram = {
      async callApi(method: string, payload: any) {
        calls.push([method, payload])
        if (method === 'createForumTopic')
          return { message_thread_id: next++, name: payload.name }
        return true
      },
    }
    const ctx: any = {
      chat: { id: 777, type: 'private' },
      from: { id: 777, language_code: 'en' },
      botInfo: { username: botName, has_topics_enabled: true },
      telegram,
      state: {},
      replies: [] as any[],
      edits: [] as any[],
      reply: async (text: string, extra: any) =>
        ctx.replies.push([text, extra]),
      answerCbQuery: async () => true,
      editMessageReplyMarkup: async (m: any) => ctx.edits.push(m),
    }
    const made = () =>
      calls.filter(c => c[0] === 'createForumTopic').map(c => c[1].name)
    return { ctx, calls, made }
  }

  it('the first /start makes the Agent alone, and its card offers the five others', async () => {
    const { ctx, calls, made } = person()
    expect(await ensureTabsQuietly(ctx)).toEqual(['agent'])
    expect(made()).toHaveLength(1)
    const intro = calls.find(c => c[0] === 'sendMessage')![1]
    const hire = intro.reply_markup.inline_keyboard
      .flat()
      .filter((b: any) => String(b.callback_data ?? '').startsWith('team:'))
    expect(hire.map((b: any) => b.callback_data)).toEqual(
      TAB_KEYS.slice(1).map(k => `team:${k}`)
    )
  })

  it('a link to the reels screen brings the Director at once', async () => {
    const { ctx } = person()
    expect(await ensureTabsQuietly(ctx, {}, 'story')).toEqual([
      'agent',
      'reels',
    ])
  })

  it('a hire press makes that one tab, and the card stops offering it', async () => {
    const { ctx, made } = person()
    await ensureTabsQuietly(ctx)
    const handlers: Record<string, any> = {}
    let action: any
    registerTabsCommand({
      command: (name: string, h: any) => (handlers[name] = h),
      action: (_: RegExp, h: any) => (action = h),
    } as any)
    ctx.match = ['team:reels', 'reels']
    ctx.callbackQuery = {
      message: {
        reply_markup: { inline_keyboard: [[{ text: 'App', url: 'u' }]] },
      },
    }
    await action(ctx)
    expect(made()).toHaveLength(2)
    expect(db.rows.map(r => r.kind).sort()).toEqual(['agent', 'reels'])
    const offeredNow = ctx.edits[0].inline_keyboard
      .flat()
      .map((b: any) => b.callback_data)
    expect(offeredNow).not.toContain('team:reels')
    expect(offeredNow).toContain('team:browser')
    // The card's door to the app stays.
    expect(ctx.edits[0].inline_keyboard.at(-1)).toEqual([
      { text: 'App', url: 'u' },
    ])

    // /team now names both members and offers the four others.
    await handlers.team(ctx)
    const [text, extra] = ctx.replies.at(-1)
    expect(text).toMatch(/Agent.*Director/)
    expect(extra.reply_markup.inline_keyboard.flat()).toHaveLength(4)
  })

  it('a press naming the core or nobody makes nothing', async () => {
    const { ctx, made } = person()
    await ensureTabsQuietly(ctx)
    let action: any
    registerTabsCommand({
      command: () => undefined,
      action: (_: RegExp, h: any) => (action = h),
    } as any)
    for (const kind of ['agent', 'nobody']) {
      ctx.match = [`team:${kind}`, kind]
      await action(ctx)
    }
    expect(made()).toHaveLength(1)
  })

  it('the core is never hired by a press, even when its tab is missing', async () => {
    const { ctx, made } = person()
    let action: any
    registerTabsCommand({
      command: () => undefined,
      action: (_: RegExp, h: any) => (action = h),
    } as any)
    ctx.match = ['team:agent', 'agent']
    await action(ctx)
    expect(made()).toHaveLength(0)
  })

  it('/tabs looks after the team and makes nobody new', async () => {
    const { ctx, made } = person()
    await ensureTabsQuietly(ctx)
    const handlers: Record<string, any> = {}
    registerTabsCommand({
      command: (name: string, h: any) => (handlers[name] = h),
      action: () => undefined,
    } as any)
    await handlers.tabs(ctx)
    expect(made()).toHaveLength(1)
  })
})
