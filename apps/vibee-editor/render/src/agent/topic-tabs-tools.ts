/**
 * A PERSON'S TOPIC TABS, READ AND SET UP BY AN AGENT -- WITHOUT /start.
 *
 * Spec: src/spec/bot-topic-tabs.t27 (gHashTag/t27#7388, v2 #7451). The bot
 * makes a person's private-chat tabs on /start and /tabs. These two tools let
 * an agent do the same from outside the chat:
 *
 *   tabs_status  which fixed tabs the person has under each bot, from the
 *                same `bot_topic_tabs` rows the bot reads
 *   tabs_setup   make the missing ones and remake the deleted ones, through
 *                the Bot API directly (the bot service is not asked)
 *
 * ONE PROTOCOL, NOT TWO: the claim, the probe and the tab table are
 * ../topic-tabs-engine.ts, a byte-identical copy of the bot's
 * src/navigation/topics/engine.ts; a test fails on any drift. So a tabs_setup
 * racing a /start makes one set of tabs, not two, exactly as two /start do.
 *
 * WHO: the caller is ctx.telegramId (set by the authenticated dispatcher,
 * never by an argument). Its own tabs any caller may; somebody else's only
 * the platform owner or a keeper (spec may_set_up). tabs_setup writes into a
 * person's chat, so it is DIRECT_CALL_ONLY in tools.ts: an app or an MCP
 * agent calls it, a sentence in somebody's message cannot.
 *
 * NO TOKEN LEAVES: a bot's token builds the Bot API URL and nothing else;
 * errors are Telegram's description or an HTTP status, never the URL.
 */

import type { AgentTool, ToolContext } from './tools'
import * as SPEC from '../spec/bot-topic-tabs.gen'
import * as TEAM from '../spec/bot-agent-team.gen'
import {
  TAB_CONVERSATION_PREFIX,
  appHireMakesTab,
  appLists,
  offered,
} from './profession'
import {
  createTopicTabs,
  errorText,
  type Db,
  type TabSpec,
  type TopicApi,
  type TopicTabs,
} from '../topic-tabs-engine'
import { botNameOf, tokenForBot } from './bot-farm'
import { telegramApiFor } from '../telegram-api'
import { appLinkFor, type AppRoute } from '../app-links'
import { isOwnerOrKeeper } from './telegram-tools'
import {
  requestManagedBotKeyboard,
  suggestBotName,
  suggestBotUsername,
} from '../managed-bots-protocol'

/** The farm bot a person is set up under when neither they nor a row name one. */
export const DEFAULT_TABS_BOT = 't27ai_bot'

export interface TabsToolDeps {
  /** A Bot API client bound to this farm bot, or null without a token for it. */
  botApi(bot: string): Promise<TopicApi | null>
  /** The farm bot the person belongs to (users.bot_name), or null. */
  homeBot(telegramId: string): Promise<string | null>
  /** The platform owner or a hive keeper. */
  isKeeper(telegramId: string): boolean
}

/** A Bot API caller that throws Telegram's own words, never the URL. */
export function botApiOver(base: string, fetchImpl: typeof fetch = fetch) {
  return {
    async callApi(method: string, payload: any): Promise<any> {
      let j: any
      let status = 0
      try {
        const r = await fetchImpl(`${base}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
        })
        status = r.status
        j = await r.json().catch(() => ({}))
      } catch {
        // The thrown error may carry the URL, which carries the token.
        throw new Error('network error')
      }
      if (j?.ok) return j.result
      const description = String(j?.description ?? `HTTP ${status}`)
      const e: any = new Error(description)
      e.response = { description }
      throw e
    },
  }
}

const defaultDeps: TabsToolDeps = {
  async botApi(bot) {
    const farm = await tokenForBot(bot)
    return farm ? botApiOver(telegramApiFor(farm.token)) : null
  },
  homeBot: id => botNameOf(id),
  isKeeper: id => isOwnerOrKeeper(id),
}

const quiet = { warn: () => undefined }

/** One engine per database handle: its schema promise and cache are per pool. */
const engines = new WeakMap<object, TopicTabs>()
function engineFor(pool: Db): TopicTabs {
  let e = engines.get(pool)
  if (!e) {
    e = createTopicTabs({ spec: SPEC, db: () => pool, log: quiet })
    engines.set(pool, e)
  }
  return e
}

/** The tab table alone (no database), for descriptions and status. */
const TABLE = createTopicTabs({ spec: SPEC, db: () => null, log: quiet })

type Who =
  | { ok: true; target: string; own: boolean }
  | { ok: false; state: string; error: string }

function whoIsAsked(
  args: Record<string, any>,
  ctx: ToolContext,
  deps: TabsToolDeps
): Who {
  const caller = String(ctx?.telegramId ?? '').trim()
  const asked = String(args?.telegram_id ?? caller).trim()
  if (!/^\d{5,15}$/.test(asked))
    return {
      ok: false,
      state: 'bad_person',
      error: 'telegram_id must be a Telegram user id (digits).',
    }
  const own = asked === caller
  if (!TABLE.maySetUp(own, deps.isKeeper(caller)))
    return {
      ok: false,
      state: 'forbidden',
      error:
        "Another person's tabs are read and set up only by the platform owner or a keeper.",
    }
  return { ok: true, target: asked, own }
}

function tabMarkup(
  tab: TabSpec,
  bot: string,
  isRu: boolean,
  me: any,
  target: string
): unknown {
  if (tab.kind === 'mybot' && me?.can_manage_bots === true) {
    return requestManagedBotKeyboard(
      isRu ? '🤖 Создать моего бота' : '🤖 Create my bot', // cyrillic-ok: button label
      {
        username: suggestBotUsername({ id: Number(target) }),
        name: suggestBotName('', isRu),
      }
    )
  }
  const link = appLinkFor(bot, tab.route as AppRoute, {
    mainWebApp: me?.has_main_web_app === true,
  })
  return link
    ? { inline_keyboard: [[{ text: isRu ? tab.ru : tab.en, url: link }]] }
    : undefined
}

/** What the person has under one bot, in the spec's tab order. */
function tabsView(
  rows: readonly {
    thread_id: number
    kind: string
    created_at?: Date | null
  }[],
  now: number
) {
  const tabs = TABLE.TABS.map(t => {
    const row = rows.find(r => r.kind === t.kind)
    const state = !row
      ? 'missing'
      : row.thread_id > 0
        ? 'present'
        : TABLE.claimStale(now - (row.created_at?.getTime() ?? now))
          ? 'stale_claim'
          : 'being_made'
    return {
      kind: t.kind,
      title: t.en,
      state,
      ...(row && row.thread_id > 0 ? { thread_id: row.thread_id } : {}),
    }
  })
  return {
    tabs,
    missing: tabs.filter(t => t.state !== 'present').map(t => t.kind),
    own_topics: rows.filter(r => r.kind === 'chat').length,
  }
}

export function makeTabsTools(deps: TabsToolDeps = defaultDeps): AgentTool[] {
  const status: AgentTool = {
    name: 'tabs_status',
    description:
      "Which private-chat topic tabs a person has in each bot (Agent, Reels, Browser, My bot, Balance & club, Hive): present, missing or being made, plus how many of the person's own topics were named. Read from the bot's own records; it does not ask Telegram, so a tab the person deleted shows as present until tabs_setup or /tabs repairs it. Your own tabs by default; another person's only for the owner or a keeper.",
    parameters: {
      type: 'object',
      properties: {
        telegram_id: {
          type: 'string',
          description: 'Whose tabs. Default: the caller.',
        },
        bot: {
          type: 'string',
          description: 'Only this bot (username). Default: every bot.',
        },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const who = whoIsAsked(args, ctx, deps)
      if (!who.ok) return who
      const rows = await engineFor(ctx.pool).rowsOf(Number(who.target))
      if (rows === null)
        return { ok: false, state: 'no_database', error: 'No database.' }
      const only = String(args?.bot ?? '')
        .trim()
        .replace(/^@/, '')
        .toLowerCase()
      const now = Date.now()
      const bots = [...new Set(rows.map(r => r.bot))].filter(
        b => !only || b.toLowerCase() === only
      )
      return {
        ok: true,
        telegram_id: who.target,
        bots: bots.map(bot => ({
          bot,
          ...tabsView(
            rows.filter(r => r.bot === bot),
            now
          ),
        })),
        ...(bots.length === 0
          ? {
              note: 'No tabs recorded. tabs_setup makes them, or the person presses /start in a bot with topics on.',
            }
          : {}),
      }
    },
  }

  const setup: AgentTool = {
    name: 'tabs_setup',
    description:
      "Make a person's private-chat topic tabs in a bot without them pressing /start: creates the missing tabs, and with repair (default) asks Telegram about each stored tab and remakes the ones the person deleted. Idempotent: a second call makes nothing, and a call racing /start makes one set. Needs the bot's topics turned on in BotFather and the person to have started the bot. Your own tabs by default; another person's only for the owner or a keeper.",
    parameters: {
      type: 'object',
      properties: {
        telegram_id: {
          type: 'string',
          description: 'Whose tabs. Default: the caller.',
        },
        bot: {
          type: 'string',
          description: `Bot username. Default: the person's own bot, else @${DEFAULT_TABS_BOT}.`,
        },
        lang: { type: 'string', enum: ['ru', 'en'] },
        repair: {
          type: 'boolean',
          description:
            'Probe stored tabs and remake deleted ones (like /tabs). Default true.',
        },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const who = whoIsAsked(args, ctx, deps)
      if (!who.ok) return who
      const asked = String(args?.bot ?? '')
        .trim()
        .replace(/^@/, '')
      const bot = asked || (await deps.homeBot(who.target)) || DEFAULT_TABS_BOT
      const api = await deps.botApi(bot)
      if (!api)
        return {
          ok: false,
          state: 'bot_unavailable',
          error: `The render holds no token for @${bot}.`,
        }
      let me: any
      try {
        me = await api.callApi('getMe', {})
      } catch (e) {
        return {
          ok: false,
          state: 'bot_unreachable',
          error: `getMe for @${bot} failed: ${errorText(e)}`,
        }
      }
      if (me?.has_topics_enabled !== true)
        return {
          ok: false,
          state: 'topics_off',
          error: `@${bot} has topics turned off (getMe.has_topics_enabled is false): the bot owner turns on threaded mode for it in @BotFather.`,
        }
      const username = String(me?.username ?? bot)
      const isRu = args?.lang === 'ru'
      const engine = engineFor(ctx.pool)
      const made = await engine.ensureTabs(
        api,
        username,
        Number(who.target),
        isRu,
        tab => tabMarkup(tab, username, isRu, me, who.target),
        { probe: args?.repair !== false }
      )
      const rows = await engine.tabsOf(username, Number(who.target))
      const view = tabsView(rows ?? [], Date.now())
      return {
        ok: view.missing.length === 0,
        state: view.missing.length === 0 ? 'ready' : 'incomplete',
        bot: username,
        telegram_id: who.target,
        made,
        ...view,
        ...(view.missing.length
          ? {
              note: 'Some tabs were not made. Most often the person has not started this bot yet, or blocked it; ask them to open it once.',
            }
          : {}),
      }
    },
  }

  return [status, setup]
}

export const TABS_TOOLS: AgentTool[] = makeTabsTools()

/*
 * THE SAME TEAM IN THE MINI-APP (bot-agent-team.t27, owner 2026-10-08: "the
 * same logic in the mini-app"). The team is the person's tabs in their bot:
 * the app reads it here, and a hire in the app makes the member's tab in the
 * bot -- one act, wherever it is pressed. A member's chat in the app is its
 * tab's conversation (`tab<kind>`), so the bot tab and the app chat are one
 * memory with one trade (profession.ts).
 */

export interface TeamMember {
  kind: string
  title: string
  /** The conversation of the member's chat; null for the Agent (the base). */
  conversation: string | null
  onTeam: boolean
  /** Shown in the app's team row (spec app_lists). */
  listed: boolean
  /** A hire button is offered (spec offered). */
  offered: boolean
}

/** The bot whose tabs are the person's team: their own bot, else the one they have tabs in. */
async function teamBot(
  rows: readonly { bot: string; thread_id: number }[],
  telegramId: string,
  deps: TabsToolDeps
): Promise<string> {
  const home = await deps.homeBot(telegramId)
  const withTabs = [
    ...new Set(rows.filter(r => r.thread_id > 0).map(r => r.bot)),
  ]
  if (home && withTabs.includes(home)) return home
  return withTabs[0] ?? home ?? DEFAULT_TABS_BOT
}

export async function teamView(
  pool: Db,
  telegramId: string,
  isRu: boolean,
  deps: TabsToolDeps = defaultDeps
): Promise<{ bot: string; botHasTabs: boolean; members: TeamMember[] }> {
  const rows = (await engineFor(pool).rowsOf(Number(telegramId))) ?? []
  const bot = await teamBot(rows, telegramId, deps)
  const kinds = new Set(
    rows.filter(r => r.bot === bot && r.thread_id > 0).map(r => r.kind)
  )
  const botHasTabs = kinds.size > 0
  const members = TABLE.TABS.map((t, i) => {
    const core = i < TEAM.TEAM_CORE
    const onTeam = core || kinds.has(t.kind)
    return {
      kind: t.kind,
      title: isRu ? t.ru : t.en,
      conversation: core ? null : `${TAB_CONVERSATION_PREFIX}${t.kind}`,
      onTeam,
      listed: appLists(onTeam, botHasTabs),
      offered: botHasTabs && offered(i, onTeam),
    }
  })
  return { bot, botHasTabs, members }
}

/**
 * Hire a member from the app: its tab is made in the bot when the person has
 * tabs there and the member is offered (spec app_hire_makes_tab). Either way
 * the app opens the member's chat; `made` says whether a tab appeared.
 */
export async function hireFromApp(
  pool: Db,
  telegramId: string,
  kind: string,
  isRu: boolean,
  deps: TabsToolDeps = defaultDeps
): Promise<{
  ok: boolean
  made: string[]
  conversation?: string | null
  error?: string
}> {
  const view = await teamView(pool, telegramId, isRu, deps)
  const member = view.members.find(m => m.kind === kind)
  if (!member) return { ok: false, made: [], error: 'no such member' }
  if (!appHireMakesTab(member.offered, view.botHasTabs))
    return { ok: true, made: [], conversation: member.conversation }
  const api = await deps.botApi(view.bot)
  if (!api) return { ok: true, made: [], conversation: member.conversation }
  let me: any = null
  try {
    me = await api.callApi('getMe', {})
  } catch {
    return { ok: true, made: [], conversation: member.conversation }
  }
  const username = String(me?.username ?? view.bot)
  const made = await engineFor(pool).ensureTabs(
    api,
    username,
    Number(telegramId),
    isRu,
    tab => tabMarkup(tab, username, isRu, me, telegramId),
    { only: [kind] }
  )
  return { ok: true, made, conversation: member.conversation }
}
