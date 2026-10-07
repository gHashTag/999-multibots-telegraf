/**
 * THE FIXED TABS OF THE PRIVATE CHAT, MADE ONCE PER PERSON.
 *
 * Spec: src/spec/bot-topic-tabs.t27 (gHashTag/t27#7388). The table (key,
 * English title, emoji, icon colour, app route), the name bound and every
 * rule below come from it; src/spec/bot-topic-tabs.test.ts runs each of its
 * tests against this file.
 *
 * When the bot has topics turned on in BotFather (getMe answers
 * `has_topics_enabled`), /start makes a small set of tabs in the person's
 * chat, each with one job. Every tab is a conversation with the same agent
 * under its own memory (threads.ts agentConversationFor), so a reel being
 * discussed in one tab does not spill into the balance question in another.
 *
 * IDEMPOTENT ACROSS DEPLOYS AND RACES: which tabs exist is kept in Postgres
 * (`bot_topic_tabs`), never in the session. Before `createForumTopic` the bot
 * inserts a CLAIM row (a negative thread id) under a unique key of
 * (bot, person, kind); only the insert that landed makes the tab, so two
 * /start at once make one set. The unique keys are declared by the CREATE
 * statements here, not trusted to a migration: the Railway cutover copied
 * tables without their unique indexes.
 *
 * /tabs never forgets a tab on its own: it asks Telegram about each stored
 * tab (a chat action into its thread) and forgets only the ones Telegram says
 * are gone, then makes just those.
 *
 * Topics the PERSON opens ("New Thread") are rows too, kind `chat`: the first
 * message names the topic (editForumTopic) so the tab column reads as a list
 * of subjects instead of a column of "New Thread". Which threads are known is
 * kept in memory per person, so a message in a tab costs no database read.
 */
import { Pool } from 'pg'
import { logger } from '@/utils/logger'
import { topicTitleFrom } from './threads'
import type { AppRoute } from '@/navigation/helpers/appLinks'
import * as SPEC from '@/spec/bot-topic-tabs.gen'

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

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

/** Interface text only; key, emoji, colour and route come from the spec. */
const TEXT: Record<TabKind, { ru: string; introRu: string; introEn: string }> =
  {
    agent: {
      ru: 'Агент',
      introRu:
        'Здесь главный разговор с агентом. Пишите или говорите голосом — он видит все свои инструменты.',
      introEn:
        'Your main conversation with the agent. Write or send a voice note; every tool is here.',
    },
    reels: {
      ru: 'Рилсы',
      introRu:
        'Рилсы, липсинк, фото. Пришлите фото или опишите ролик — агент сделает его в этой вкладке.',
      introEn:
        'Reels, lip-sync, photos. Send a photo or describe the video; the agent makes it in this tab.',
    },
    browser: {
      ru: 'Браузер',
      introRu:
        'Ваш браузер на сервере. Скажите, что открыть и сделать; пароли вводите только сами.',
      introEn:
        'Your own browser on the server. Say what to open and do; passwords are typed by you only.',
    },
    mybot: {
      ru: 'Мой бот',
      introRu:
        'Ваш собственный бот-агент. Кнопка ниже откроет окно Telegram для создания бота, или попросите агента здесь — он сделает это сам. /mybot покажет ваших ботов.',
      introEn:
        "Your own agent bot. The button below opens Telegram's bot creation sheet, or ask the agent here and it will do it. /mybot lists your bots.",
    },
    wallet: {
      ru: 'Баланс и клуб',
      introRu:
        'Баланс токенов, пополнение и клуб. Спросите «какой у меня баланс?» или нажмите /club.',
      introEn:
        'Token balance, top-up and the club. Ask "what is my balance?" or send /club.',
    },
    hive: {
      ru: 'Улей',
      introRu: 'Улей: задачи, доска и пчёлы. Спросите, что сейчас в работе.',
      introEn:
        'The Hive: tasks, the board and the bees. Ask what is in progress.',
    },
  }

/** Order is the order of the tab column (the spec's order). */
export const TABS: readonly TabSpec[] = SPEC.TAB_KEYS.map((kind, i) => {
  const emoji = String.fromCodePoint(SPEC.TAB_EMOJI[i])
  return {
    kind,
    ru: `${emoji} ${TEXT[kind].ru}`,
    en: `${emoji} ${SPEC.TAB_TITLES_EN[i]}`,
    color: SPEC.TAB_COLORS[i],
    route: SPEC.TAB_ROUTES[i] as AppRoute,
    introRu: TEXT[kind].introRu,
    introEn: TEXT[kind].introEn,
  }
})

/** Every fixed title, in both languages: a topic so named is never renamed. */
const FIXED_NAMES: ReadonlySet<string> = new Set(
  TABS.flatMap(t => [t.ru, t.en])
)

// ---- the spec's rules, one function each (bot-topic-tabs.t27) ----

export function colorAllowed(c: number): boolean {
  return (SPEC.ICON_COLORS as readonly number[]).includes(c)
}

export function tableColorsAllowed(
  table: readonly { color: number }[] = TABS
): boolean {
  return table.every(t => colorAllowed(t.color))
}

export function tableColorsDistinct(
  table: readonly { color: number }[] = TABS
): boolean {
  return new Set(table.map(t => t.color)).size === table.length
}

/** Characters of a name as Telegram counts them (code points). */
export function nameChars(name: string): number {
  return [...name].length
}

export function nameFits(chars: number): boolean {
  return chars > 0 && chars <= SPEC.TOPIC_NAME_MAX
}

export function makeTab(stored: boolean, alive: boolean): boolean {
  return !stored || !alive
}

export function forgetRow(
  probeFailed: boolean,
  threadMissing: boolean
): boolean {
  return probeFailed && threadMissing
}

export function claimWon(insertedRows: number): boolean {
  return insertedRows === 1
}

export function claimStale(ageMs: number): boolean {
  return ageMs >= SPEC.CLAIM_STALE_MS
}

export function mayRename(
  known: boolean,
  fixedName: boolean,
  isCommand: boolean
): boolean {
  return !known && !fixedName && !isCommand
}

export function readsDb(cached: boolean): boolean {
  return !cached
}

export function evicts(entries: number): boolean {
  return entries >= SPEC.TAB_CACHE_MAX
}

/** Telegram's own word that a thread is gone (not a network error). */
export function threadMissing(error: unknown): boolean {
  const e = error as any
  const said = String(
    e?.response?.description ?? e?.description ?? e?.message ?? ''
  )
  return /thread not found|topic_id_invalid|topic_deleted|topic not found/i.test(
    said
  )
}

export const TOPIC_TABS_TABLE = `CREATE TABLE IF NOT EXISTS bot_topic_tabs (
  bot_username text NOT NULL,
  telegram_id bigint NOT NULL,
  thread_id bigint NOT NULL,
  kind text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_username, telegram_id, thread_id)
)`

/**
 * The unique keys, declared here so a table copied without its indexes gets
 * them back on the first query: one row per thread (ON CONFLICT needs it),
 * and one row per fixed tab -- the key the claim lands on.
 */
export const TOPIC_TABS_INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS bot_topic_tabs_thread
  ON bot_topic_tabs (bot_username, telegram_id, thread_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS bot_topic_tabs_fixed_kind
  ON bot_topic_tabs (bot_username, telegram_id, kind) WHERE kind <> 'chat'`,
] as const

let pool: Pool | null = null
let injected: Db | null = null
let schemaReady: Promise<void> | null = null

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

export function setTopicTabsDbForTests(d: Db | null): void {
  injected = d
  schemaReady = null
  cache.clear()
}

async function run(sql: string, params: unknown[]): Promise<any[] | null> {
  const d = db()
  if (!d) return null
  if (!schemaReady) {
    schemaReady = (async () => {
      await d.query(TOPIC_TABS_TABLE)
      for (const index of TOPIC_TABS_INDEXES) await d.query(index)
    })().catch(e => {
      schemaReady = null
      throw e
    })
  }
  await schemaReady
  return (await d.query(sql, params)).rows ?? []
}

export interface TabRow {
  /** Negative while a claim is being made into a tab. */
  thread_id: number
  kind: string
  title: string | null
  created_at?: Date | null
}

/** The person's rows, straight from the database. */
export async function tabsOf(
  bot: string,
  telegramId: number
): Promise<TabRow[] | null> {
  const rows = await run(
    'SELECT thread_id, kind, title, created_at FROM bot_topic_tabs WHERE bot_username = $1 AND telegram_id = $2',
    [bot, telegramId]
  )
  return (
    rows?.map(r => ({
      thread_id: Number(r.thread_id),
      kind: String(r.kind),
      title: r.title ?? null,
      created_at: r.created_at ? new Date(r.created_at) : null,
    })) ?? null
  )
}

// ---- the in-memory copy: a message in a tab costs no read ----

/** bot:person -> rows, oldest first (a Map keeps insertion order). */
const cache = new Map<string, TabRow[]>()
const keyOf = (bot: string, telegramId: number) => `${bot}:${telegramId}`

function dropCached(bot: string, telegramId: number): void {
  cache.delete(keyOf(bot, telegramId))
}

export function tabCacheSize(): number {
  return cache.size
}

/** The person's rows, from memory when we have them. */
export async function knownTabs(
  bot: string,
  telegramId: number
): Promise<TabRow[] | null> {
  const key = keyOf(bot, telegramId)
  const held = cache.get(key)
  if (!readsDb(held !== undefined)) {
    cache.delete(key)
    cache.set(key, held!)
    return held!
  }
  const rows = await tabsOf(bot, telegramId)
  if (rows === null) return null
  while (evicts(cache.size)) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  cache.set(key, rows)
  return rows
}

/** Insert a row unless a unique key says it exists; true when it landed. */
async function claimRow(
  bot: string,
  telegramId: number,
  threadId: number,
  kind: string,
  title: string
): Promise<boolean> {
  const rows = await run(
    `INSERT INTO bot_topic_tabs (bot_username, telegram_id, thread_id, kind, title)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING thread_id`,
    [bot, telegramId, threadId, kind, title]
  )
  dropCached(bot, telegramId)
  return claimWon(rows?.length ?? 0)
}

async function forgetRowAt(
  bot: string,
  telegramId: number,
  threadId: number
): Promise<void> {
  await run(
    'DELETE FROM bot_topic_tabs WHERE bot_username = $1 AND telegram_id = $2 AND thread_id = $3',
    [bot, telegramId, threadId]
  )
  dropCached(bot, telegramId)
}

async function settleClaim(
  bot: string,
  telegramId: number,
  claimId: number,
  threadId: number,
  title: string
): Promise<void> {
  await run(
    `UPDATE bot_topic_tabs SET thread_id = $4, title = $5
     WHERE bot_username = $1 AND telegram_id = $2 AND thread_id = $3`,
    [bot, telegramId, claimId, threadId, title]
  )
  dropCached(bot, telegramId)
}

/** The part of the Telegram client this file uses. */
export interface TopicApi {
  callApi(method: string, payload: any): Promise<any>
}

/** True when the bot can keep tabs in private chats (Bot API 9.3/9.4). */
export function topicsEnabled(botInfo: any): boolean {
  return botInfo?.has_topics_enabled === true
}

/** Is the stored tab still there? Only Telegram's "thread not found" says no. */
async function stillThere(
  api: TopicApi,
  chatId: number,
  threadId: number
): Promise<boolean> {
  try {
    await api.callApi('sendChatAction', {
      chat_id: chatId,
      message_thread_id: threadId,
      action: 'typing',
    })
    return true
  } catch (e) {
    return !forgetRow(true, threadMissing(e))
  }
}

export interface EnsureOptions {
  /** /tabs: ask Telegram about every stored tab and remake the gone ones. */
  probe?: boolean
  now?: number
}

/**
 * Make every fixed tab this person does not have yet. Returns the kinds made.
 * Without a database nothing is made: a tab nobody remembers would be made
 * again on the next /start, which is the duplication this file prevents.
 * A tab that fails to be made is logged and skipped; the rest still go.
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
  const have = await tabsOf(bot, chatId)
  if (have === null) {
    logger.warn('[topic-tabs] no database, tabs not made', { bot })
    return []
  }
  const now = opts.now ?? Date.now()
  const made: TabKind[] = []
  for (const [index, tab] of TABS.entries()) {
    const name = isRu ? tab.ru : tab.en
    try {
      let row = have.find(r => r.kind === tab.kind)
      if (row && row.thread_id < 0) {
        // Somebody's claim: respected while it is fresh, dropped when dead.
        const age = now - (row.created_at?.getTime() ?? now)
        if (!claimStale(age)) continue
        await forgetRowAt(bot, chatId, row.thread_id)
        row = undefined
      }
      let alive = true
      if (row && opts.probe) {
        alive = await stillThere(api, chatId, row.thread_id)
        if (!alive) await forgetRowAt(bot, chatId, row.thread_id)
      }
      if (!makeTab(row !== undefined, alive)) continue

      const claimId = -(index + 1)
      if (!(await claimRow(bot, chatId, claimId, tab.kind, name))) continue
      let threadId = NaN
      try {
        const topic = await api.callApi('createForumTopic', {
          chat_id: chatId,
          name,
          icon_color: tab.color,
        })
        threadId = Number(topic?.message_thread_id)
      } finally {
        if (!Number.isInteger(threadId) || threadId <= 0) {
          await forgetRowAt(bot, chatId, claimId)
        }
      }
      if (!Number.isInteger(threadId) || threadId <= 0) continue
      await settleClaim(bot, chatId, claimId, threadId, name)
      made.push(tab.kind)
      const markup = markupFor(tab)
      await api.callApi('sendMessage', {
        chat_id: chatId,
        message_thread_id: threadId,
        text: isRu ? tab.introRu : tab.introEn,
        ...(markup ? { reply_markup: markup } : {}),
      })
    } catch (e) {
      logger.warn('[topic-tabs] tab not made', {
        bot,
        kind: tab.kind,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return made
}

/**
 * A topic the person opened: name it from its first message, once.
 * Returns the new name, or '' when nothing was done (a known topic, a topic
 * named like a fixed tab, a command, no database, a lost race, or Telegram
 * refusing the edit).
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
  const title = topicTitleFrom(firstText)
  const isCommand = title === ''
  const fixedName = topicName !== undefined && FIXED_NAMES.has(topicName)
  if (isCommand || fixedName) return ''
  const have = await knownTabs(bot, chatId)
  if (have === null) return ''
  const known = have.some(r => r.thread_id === threadId)
  if (!mayRename(known, fixedName, isCommand)) return ''
  // Remember first: a refused edit must not be retried on every message,
  // and of two messages at once only the one whose row landed renames.
  if (!(await claimRow(bot, chatId, threadId, 'chat', title))) return ''
  // The row is ours: keep it in memory too, so the next message reads nothing.
  // (A stale copy is harmless: a known thread's insert conflicts and lands not.)
  cache.set(keyOf(bot, chatId), [
    ...have,
    { thread_id: threadId, kind: 'chat', title, created_at: null },
  ])
  try {
    await api.callApi('editForumTopic', {
      chat_id: chatId,
      message_thread_id: threadId,
      name: title,
    })
    return title
  } catch (e) {
    logger.warn('[topic-tabs] topic not renamed', {
      bot,
      error: e instanceof Error ? e.message : String(e),
    })
    return ''
  }
}
