/**
 * THE FIXED TABS OF THE PRIVATE CHAT, MADE ONCE PER PERSON.
 *
 * Spec: src/spec/bot-topic-tabs.t27 (gHashTag/t27#7388, v2 #7451). The table
 * (key, English title, emoji, icon colour, app route), the name bound and
 * every rule come from it; src/spec/bot-topic-tabs.test.ts runs each of its
 * tests against this file.
 *
 * When the bot has topics turned on in BotFather (getMe answers
 * `has_topics_enabled`), /start makes a small set of tabs in the person's
 * chat, each with one job. The Agent tab speaks in the person's base
 * conversation, the one the mini-app shows; every other tab keeps its own
 * memory under its kind (memory.ts, spec bot-agent-memory.t27), so a reel
 * being discussed in one tab does not spill into the balance question in
 * another.
 *
 * The claim protocol, the probe and the naming of a person's own topics live
 * in ./engine.ts, which the render server keeps a byte-identical copy of
 * (its tabs_setup tool makes the same tabs without /start). This file hands
 * the engine the bot's database, log and spec module.
 */
import { Pool } from 'pg'
import { logger } from '@/utils/logger'
import { topicTitleFrom } from './threads'
import type { AppRoute } from '@/navigation/helpers/appLinks'
import * as SPEC from '@/spec/bot-topic-tabs.gen'
import {
  createTopicTabs,
  type Db,
  type EnsureOptions,
  type TabRow,
  type TopicApi,
} from './engine'

export { threadMissing, TOPIC_TABS_TABLE, TOPIC_TABS_INDEXES } from './engine'
export type { Db, EnsureOptions, TabRow, TopicApi } from './engine'

export type TabKind = (typeof SPEC.TAB_KEYS)[number]

export interface TabSpec {
  kind: TabKind
  ru: string
  en: string
  /** One of the colours Telegram accepts for a topic icon (SPEC.ICON_COLORS). */
  color: number
  /** The mini-app screen the tab's first message opens. */
  route: AppRoute
  introRu: string
  introEn: string
}

let pool: Pool | null = null
let injected: Db | null = null

function db(): Db | null {
  if (injected) return injected
  if (pool) return pool
  const url =
    process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''
  if (!url) return null
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 5_000,
  })
  pool.on('error', error => {
    logger.error('[topic-tabs] pool error', { error: error.message })
  })
  return pool
}

const engine = createTopicTabs({
  spec: SPEC,
  db,
  log: logger,
  titleFrom: topicTitleFrom,
})

/** Order is the order of the tab column (the spec's order). */
export const TABS = engine.TABS as readonly TabSpec[]

export const {
  colorAllowed,
  tableColorsAllowed,
  tableColorsDistinct,
  nameChars,
  nameFits,
  makeTab,
  forgetRow,
  claimWon,
  settleWon,
  claimStale,
  mayRename,
  maySetUp,
  readsDb,
  evicts,
  retitle,
  tabsOf,
  knownTabs,
  tabCacheSize,
} = engine

export function setTopicTabsDbForTests(d: Db | null): void {
  injected = d
  engine.resetForTests()
}

/**
 * Create the table at startup, so a bot with topics on has it after a deploy
 * rather than after the first /start, and a database it cannot write to is
 * said in the deploy's log instead of in a person's silent /start.
 * Never throws: a launch does not depend on it.
 */
export async function prepareTabsTable(
  botInfo: any
): Promise<'off' | 'no-database' | 'ready' | 'failed'> {
  if (!topicsEnabled(botInfo)) return 'off'
  try {
    return (await engine.ensureSchema()) ? 'ready' : 'no-database'
  } catch (e) {
    logger.error('[topic-tabs] table not created', {
      bot: botInfo?.username,
      error: e instanceof Error ? e.message : String(e),
    })
    return 'failed'
  }
}

/** True when the bot can keep tabs in private chats (Bot API 9.3/9.4). */
export function topicsEnabled(botInfo: any): boolean {
  return botInfo?.has_topics_enabled === true
}

/**
 * Make every fixed tab this person does not have yet. Returns the kinds made.
 * Without a database nothing is made: a tab nobody remembers would be made
 * again on the next /start, which is the duplication this file prevents.
 */
export async function ensureTabs(
  api: TopicApi,
  bot: string,
  chatId: number,
  isRu: boolean,
  /** Extra markup for a tab's first message (the route button, /mybot). */
  markupFor: (tab: TabSpec) => unknown = () => undefined,
  opts: EnsureOptions = {}
): Promise<TabKind[]> {
  return (await engine.ensureTabs(
    api,
    bot,
    chatId,
    isRu,
    tab => markupFor(tab as TabSpec),
    opts
  )) as TabKind[]
}

/**
 * A topic the person opened: name it from its first message, once.
 * Returns the new name, or '' when nothing was done.
 */
export async function nameFreshTopic(
  api: TopicApi,
  bot: string,
  chatId: number,
  threadId: number,
  firstText: string | undefined,
  /** The topic's current name, when the update carries it. */
  topicName?: string
): Promise<string> {
  return engine.nameFreshTopic(api, bot, chatId, threadId, firstText, topicName)
}
