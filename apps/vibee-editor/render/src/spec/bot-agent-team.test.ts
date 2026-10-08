/**
 * Spec bot-agent-team.t27 (gHashTag/t27#7855), every test block run against
 * the render's code in agent/profession.ts, then the behaviour: a fixed tab's
 * conversation makes the turn that member's, its prompt names its trade and
 * the tools it leads with, and it is still shown every tool. The bot's half
 * (who joins, the hire buttons) is bound in src/spec/bot-agent-team.test.ts.
 */
import { describe, expect, it } from 'vitest'
import * as SPEC from './bot-agent-team.gen'
import {
  mayRetry,
  mayStart,
  mayWait,
  moneyButtonsHere,
  retryPauseMs,
} from '../agent/profession'
import { TAB_KEYS } from './bot-topic-tabs.gen'
import {
  addressed,
  appHireMakesTab,
  appLists,
  hasTrade,
  inTrade,
  joinsAtStart,
  labelled,
  leadTools,
  leadsWith,
  memberOfConversation,
  offered,
  speaker,
  professionSection,
  shownTools,
  tended,
  toolShown,
} from '../agent/profession'
import { TOOLS } from '../agent/tools'
import { addressedMember, speakerFor, speakerLabel } from '../agent/profession'
import { teamSection } from '../agent/chat'

const NAMES = TOOLS.map(t => t.name)

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
    // On the registry itself: every member is shown all of it.
    for (let i = 0; i < SPEC.TEAM_SIZE; i++)
      expect(shownTools(i, NAMES)).toEqual(NAMES)
  })

  it("only a fixed tab other than the Agent's has a trade", () => {
    expect(hasTrade(true, false)).toBe(true)
    expect(hasTrade(true, true)).toBe(false)
    expect(hasTrade(false, false)).toBe(false)
    expect(hasTrade(false, true)).toBe(false)
    expect(memberOfConversation('tabreels')).toBe(1)
    expect(memberOfConversation('tabhive')).toBe(5)
    expect(memberOfConversation('tabagent')).toBe(-1)
    expect(memberOfConversation('c1a2b3')).toBe(-1)
    expect(memberOfConversation(undefined)).toBe(-1)
  })

  it('six members, one core, two hire buttons a row', () => {
    expect(SPEC.TEAM_SIZE).toBe(6)
    expect(SPEC.TEAM_CORE).toBe(1)
    expect(SPEC.HIRE_BUTTONS_PER_ROW).toBe(2)
    expect(joinsAtStart(SPEC.TEAM_CORE - 1, false)).toBe(true)
    expect(joinsAtStart(SPEC.TEAM_CORE, false)).toBe(false)
    expect(offered(SPEC.TEAM_SIZE - 1, false)).toBe(true)
    expect(offered(SPEC.TEAM_SIZE, false)).toBe(false)
    expect(TAB_KEYS).toHaveLength(SPEC.TEAM_SIZE)
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

describe("each member's trade", () => {
  it('every word of every trade names a tool the registry has', () => {
    for (const scope of SPEC.TEAM_LEAD_TOOLS) {
      if (scope === SPEC.TOOL_SCOPE_ALL) continue
      for (const word of scope.split(' ').filter(Boolean))
        expect(
          NAMES.some(n => inTrade(n, word)),
          word
        ).toBe(true)
    }
  })

  it('a name matches itself, a prefix its family, nothing else', () => {
    expect(inTrade('browser_click', 'browser_ web_read')).toBe(true)
    expect(inTrade('web_read', 'browser_ web_read')).toBe(true)
    expect(inTrade('web_readers', 'browser_ web_read')).toBe(false)
    expect(inTrade('tg_send', 'browser_ web_read')).toBe(false)
    expect(inTrade('anything', SPEC.TOOL_SCOPE_ALL)).toBe(true)
  })

  it('the Director leads with reels, the Navigator with the browser, the Agent with none', () => {
    expect(leadTools(1, NAMES)).toContain('lipsync_generate')
    expect(leadTools(1, NAMES)).not.toContain('browser_click')
    expect(leadTools(2, NAMES)).toContain('browser_click')
    expect(leadTools(0, NAMES)).toEqual([])
  })

  it("a member's prompt names its trade, its lead tools and the spec bank; the generalist's has none", () => {
    const director = professionSection('tabreels', NAMES)
    expect(director).toMatch(/РЕЖИСС/) // cyrillic-ok: prompt copy under test
    expect(director).toContain('lipsync_generate')
    expect(director).toContain('t27_specs')
    expect(professionSection('tabwallet', NAMES)).toContain('tokens_invoice')
    // The generalist has no trade; it names itself and its team (v2).
    expect(professionSection('tabagent', NAMES)).toContain(speakerLabel(1))
    expect(professionSection(undefined, NAMES)).not.toContain(
      'lipsync_generate'
    )
    expect(professionSection('c1a2b3', NAMES)).toContain('ГЛАВНЫЙ') // cyrillic-ok: prompt copy under test
  })
})

/** bot_topic_tabs in memory, enough for the engine's statements. */
function memoryPool() {
  const rows: any[] = []
  const mine = (r: any, p: any[]) => r.bot === p[0] && r.tid === p[1]
  return {
    rows,
    async query(sql: string, p: any[] = []) {
      const q = sql.trim()
      if (q.startsWith('CREATE')) return { rows: [] }
      if (q.startsWith('SELECT bot_username'))
        return {
          rows: rows
            .filter(r => r.tid === p[0])
            .map(r => ({ ...r, bot_username: r.bot })),
        }
      if (q.startsWith('SELECT'))
        return { rows: rows.filter(r => mine(r, p)).map(r => ({ ...r })) }
      if (q.startsWith('INSERT')) {
        const [bot, tid, thread_id, kind, title] = p
        if (rows.some(r => r.bot === bot && r.tid === tid && r.kind === kind))
          return { rows: [] }
        rows.push({ bot, tid, thread_id, kind, title, created_at: new Date() })
        return { rows: [{ thread_id }] }
      }
      if (q.startsWith('UPDATE')) {
        const r = rows.find(x => mine(x, p) && x.thread_id === p[2])
        if (r) {
          r.thread_id = p[3]
          r.title = p[4]
        }
        return { rows: r ? [{ thread_id: p[3] }] : [] }
      }
      if (q.startsWith('DELETE')) return { rows: [] }
      throw new Error('unexpected sql ' + q)
    },
  }
}

describe('the same team in the mini-app', () => {
  const PERSON = '900000002'
  const bot = () => {
    let next = 200
    const calls: any[] = []
    return {
      calls,
      made: () => calls.filter(c => c[0] === 'createForumTopic').length,
      async callApi(method: string, payload: any) {
        calls.push([method, payload])
        if (method === 'getMe')
          return { username: 't27ai_bot', has_topics_enabled: true }
        if (method === 'createForumTopic')
          return { message_thread_id: next++, name: payload.name }
        return true
      },
    }
  }
  const depsWith = (api: any) => ({
    botApi: async () => api,
    homeBot: async () => 't27ai_bot',
    isKeeper: () => false,
  })

  it('a person with the Agent tab sees the Agent as a chat and the five others to hire', async () => {
    const { teamView } = await import('../agent/topic-tabs-tools')
    const pool = memoryPool()
    pool.rows.push({
      bot: 't27ai_bot',
      tid: Number(PERSON),
      thread_id: 11,
      kind: 'agent',
      title: 'x',
      created_at: new Date(),
    })
    const view = await teamView(pool as any, PERSON, false, depsWith(bot()))
    expect(view.botHasTabs).toBe(true)
    expect(view.members.filter(m => m.listed).map(m => m.kind)).toEqual([
      'agent',
    ])
    expect(view.members.filter(m => m.offered).map(m => m.kind)).toEqual(
      TAB_KEYS.slice(1)
    )
    expect(view.members[0].conversation).toBeNull()
    expect(view.members[1].conversation).toBe('tabreels')
  })

  it('without tabs in the bot every member is a chat and nobody is offered', async () => {
    const { teamView } = await import('../agent/topic-tabs-tools')
    const view = await teamView(
      memoryPool() as any,
      PERSON,
      true,
      depsWith(bot())
    )
    expect(view.botHasTabs).toBe(false)
    expect(view.members.every(m => m.listed && !m.offered)).toBe(true)
  })

  it('a hire in the app makes the tab in the bot and opens its chat', async () => {
    const { hireFromApp, teamView } = await import('../agent/topic-tabs-tools')
    const pool = memoryPool()
    pool.rows.push({
      bot: 't27ai_bot',
      tid: Number(PERSON),
      thread_id: 11,
      kind: 'agent',
      title: 'x',
      created_at: new Date(),
    })
    const api = bot()
    const r = await hireFromApp(
      pool as any,
      PERSON,
      'reels',
      false,
      depsWith(api)
    )
    expect(r).toMatchObject({
      ok: true,
      made: ['reels'],
      conversation: 'tabreels',
    })
    expect(api.made()).toBe(1)
    const view = await teamView(pool as any, PERSON, false, depsWith(api))
    expect(view.members.find(m => m.kind === 'reels')).toMatchObject({
      listed: true,
      offered: false,
    })
    // A second press makes nothing; the core and strangers are never hired.
    expect(
      (await hireFromApp(pool as any, PERSON, 'reels', false, depsWith(api)))
        .made
    ).toEqual([])
    expect(
      (await hireFromApp(pool as any, PERSON, 'agent', false, depsWith(api)))
        .made
    ).toEqual([])
    expect(
      (await hireFromApp(pool as any, PERSON, 'nobody', false, depsWith(api)))
        .ok
    ).toBe(false)
    expect(api.made()).toBe(1)
  })

  it('without tabs a hire makes no tab and still opens the chat', async () => {
    const { hireFromApp } = await import('../agent/topic-tabs-tools')
    const api = bot()
    const r = await hireFromApp(
      memoryPool() as any,
      PERSON,
      'browser',
      true,
      depsWith(api)
    )
    expect(r).toMatchObject({ ok: true, made: [], conversation: 'tabbrowser' })
    expect(api.made()).toBe(0)
  })
})

describe('the neuro-office: every member in every channel', () => {
  it('a member named first takes the turn; a name in passing does not', () => {
    expect(addressedMember('Казначей, хватит на рилс?')).toBe(4) // cyrillic-ok: a person's words under test
    expect(addressedMember('  @navigator open hh.ru')).toBe(2)
    expect(addressedMember('режиссер сделай рилс')).toBe(1) // cyrillic-ok: a person's words under test
    expect(addressedMember('спроси казначея потом')).toBe(SPEC.TEAM_SIZE) // cyrillic-ok: a person's words under test
    expect(addressedMember('Казначейство закрыто')).toBe(SPEC.TEAM_SIZE) // cyrillic-ok: a person's words under test
    expect(addressedMember('')).toBe(SPEC.TEAM_SIZE)
    expect(speakerFor('tabreels', 'Казначей, сколько?')).toBe(4) // cyrillic-ok: a person's words under test
    expect(speakerFor('tabreels', 'сделай рилс')).toBe(1) // cyrillic-ok: a person's words under test
    expect(speakerFor(undefined, 'Штурман, открой hh')).toBe(2) // cyrillic-ok: a person's words under test
    expect(speakerFor(undefined, 'привет')).toBe(0) // cyrillic-ok: a person's words under test
  })

  it("a guest answers in the channel's conversation, opening with its name", () => {
    const guest = professionSection(
      'tabreels',
      NAMES,
      'Казначей, сколько у меня?'
    ) // cyrillic-ok: a person's words under test
    expect(guest).toContain('КАЗНАЧЕЙ') // cyrillic-ok: prompt copy under test
    expect(guest).toContain(speakerLabel(4))
    expect(guest).toContain(speakerLabel(1))
    expect(guest).toContain('tokens_invoice')
    // The Agent named in its own channel names itself and its team (v2).
    expect(professionSection(undefined, NAMES, 'Агент, привет')).toContain(
      'ГЛАВНЫЙ'
    ) // cyrillic-ok: a person's words under test
    // Named in a member's channel, the Agent is a guest there too.
    expect(professionSection('tabwallet', NAMES, 'Агент, привет')).toContain(
      speakerLabel(0)
    ) // cyrillic-ok: a person's words under test
  })

  it("only the person's own turns in the bot and the app: never a client, the Queen or a specialist", () => {
    const said = [{ role: 'user' as const, content: 'Казначей, сколько?' }] // cyrillic-ok: a person's words under test
    expect(teamSection({ surface: 'bot' }, said)).toContain('КАЗНАЧЕЙ') // cyrillic-ok: prompt copy under test
    expect(
      teamSection({ surface: 'miniapp', profession: 'tabreels' }, said)
    ).toContain('КАЗНАЧЕЙ') // cyrillic-ok: prompt copy under test
    expect(teamSection({ surface: 'business' }, said)).toBe('')
    expect(teamSection({ surface: 'bot', client: '555' }, said)).toBe('')
    expect(teamSection({ surface: 'bot', supervisor: true }, said)).toBe('')
    expect(
      teamSection({ surface: 'miniapp', marketplaceAgent: 'blogger' }, said)
    ).toBe('')
  })
})
