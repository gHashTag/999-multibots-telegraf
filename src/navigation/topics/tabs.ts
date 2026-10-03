/**
 * THE FIXED TABS OF THE PRIVATE CHAT, MADE ONCE PER PERSON.
 *
 * When the bot has topics turned on in BotFather (getMe answers
 * `has_topics_enabled`), /start makes a small set of tabs in the person's
 * chat, each with one job. Every tab is a conversation with the same agent
 * under its own memory (threads.ts agentConversationFor), so a reel being
 * discussed in one tab does not spill into the balance question in another.
 *
 * IDEMPOTENT ACROSS DEPLOYS: which tabs exist is kept in Postgres
 * (`bot_topic_tabs`, keyed by bot + person + tab), never in the session --
 * a second /start, a redeploy or a Redis flush must not make a second
 * "Reels" tab. A tab the person deleted is made again only by /tabs, which
 * forgets the rows first.
 *
 * Topics the PERSON opens ("New Thread") are rows too, kind `chat`: the first
 * message names the topic (editForumTopic) so the tab column reads as a list
 * of subjects instead of a column of "New Thread".
 */
import { Pool } from 'pg'
import { logger } from '@/utils/logger'
import { topicTitleFrom } from './threads'

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export type TabKind =
  | 'agent'
  | 'reels'
  | 'browser'
  | 'mybot'
  | 'wallet'
  | 'hive'

export interface TabSpec {
  kind: TabKind
  ru: string
  en: string
  /** One of the six colours Telegram accepts for a topic icon. */
  color: number
  introRu: string
  introEn: string
}

/** Order is the order of the tab column. */
export const TABS: readonly TabSpec[] = [
  {
    kind: 'agent',
    ru: '🤖 Агент',
    en: '🤖 Agent',
    color: 0x6fb9f0,
    introRu:
      'Здесь главный разговор с агентом. Пишите или говорите голосом — он видит все свои инструменты.',
    introEn:
      'Your main conversation with the agent. Write or send a voice note; every tool is here.',
  },
  {
    kind: 'reels',
    ru: '🎬 Рилсы',
    en: '🎬 Reels',
    color: 0xff93b2,
    introRu:
      'Рилсы, липсинк, фото. Пришлите фото или опишите ролик — агент сделает его в этой вкладке.',
    introEn:
      'Reels, lip-sync, photos. Send a photo or describe the video; the agent makes it in this tab.',
  },
  {
    kind: 'browser',
    ru: '🌍 Браузер',
    en: '🌍 Browser',
    color: 0x8ee186,
    introRu:
      'Ваш браузер на сервере. Скажите, что открыть и сделать; пароли вводите только сами.',
    introEn:
      'Your own browser on the server. Say what to open and do; passwords are typed by you only.',
  },
  {
    kind: 'mybot',
    ru: '🛠 Мой бот',
    en: '🛠 My bot',
    color: 0xffb119,
    introRu:
      'Ваш собственный бот-агент. Кнопка ниже откроет окно Telegram для создания бота, или попросите агента здесь — он сделает это сам. /mybot покажет ваших ботов.',
    introEn:
      "Your own agent bot. The button below opens Telegram's bot creation sheet, or ask the agent here and it will do it. /mybot lists your bots.",
  },
  {
    kind: 'wallet',
    ru: '💰 Баланс и клуб',
    en: '💰 Balance & club',
    color: 0xfb6e4e,
    introRu:
      'Баланс токенов, пополнение и клуб. Спросите «какой у меня баланс?» или нажмите /club.',
    introEn:
      'Token balance, top-up and the club. Ask "what is my balance?" or send /club.',
  },
  {
    kind: 'hive',
    ru: '🐝 Улей',
    en: '🐝 Hive',
    color: 0x7322dd,
    introRu: 'Улей: задачи, доска и пчёлы. Спросите, что сейчас в работе.',
    introEn:
      'The Hive: tasks, the board and the bees. Ask what is in progress.',
  },
]

export const TOPIC_TABS_TABLE = `CREATE TABLE IF NOT EXISTS bot_topic_tabs (
  bot_username text NOT NULL,
  telegram_id bigint NOT NULL,
  thread_id bigint NOT NULL,
  kind text NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_username, telegram_id, thread_id)
)`

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
}

async function run(sql: string, params: unknown[]): Promise<any[] | null> {
  const d = db()
  if (!d) return null
  if (!schemaReady) {
    schemaReady = d
      .query(TOPIC_TABS_TABLE)
      .then(() => undefined)
      .catch(e => {
        schemaReady = null
        throw e
      })
  }
  await schemaReady
  return (await d.query(sql, params)).rows ?? []
}

export interface TabRow {
  thread_id: number
  kind: string
  title: string | null
}

export async function tabsOf(
  bot: string,
  telegramId: number
): Promise<TabRow[] | null> {
  const rows = await run(
    'SELECT thread_id, kind, title FROM bot_topic_tabs WHERE bot_username = $1 AND telegram_id = $2',
    [bot, telegramId]
  )
  return (
    rows?.map(r => ({
      thread_id: Number(r.thread_id),
      kind: String(r.kind),
      title: r.title ?? null,
    })) ?? null
  )
}

async function rememberTab(
  bot: string,
  telegramId: number,
  threadId: number,
  kind: string,
  title: string
): Promise<void> {
  await run(
    `INSERT INTO bot_topic_tabs (bot_username, telegram_id, thread_id, kind, title)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (bot_username, telegram_id, thread_id) DO NOTHING`,
    [bot, telegramId, threadId, kind, title]
  )
}

export async function forgetFixedTabs(
  bot: string,
  telegramId: number
): Promise<void> {
  await run(
    "DELETE FROM bot_topic_tabs WHERE bot_username = $1 AND telegram_id = $2 AND kind <> 'chat'",
    [bot, telegramId]
  )
}

/** The part of the Telegram client this file uses. */
export interface TopicApi {
  callApi(method: string, payload: any): Promise<any>
}

/** True when the bot can keep tabs in private chats (Bot API 9.3/9.4). */
export function topicsEnabled(botInfo: any): boolean {
  return botInfo?.has_topics_enabled === true
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
  /** Extra markup for a tab's first message (the /mybot creation button). */
  markupFor: (kind: TabKind) => unknown = () => undefined
): Promise<TabKind[]> {
  const have = await tabsOf(bot, chatId)
  if (have === null) {
    logger.warn('[topic-tabs] no database, tabs not made', { bot })
    return []
  }
  const present = new Set(have.map(r => r.kind))
  const made: TabKind[] = []
  for (const tab of TABS) {
    if (present.has(tab.kind)) continue
    const name = isRu ? tab.ru : tab.en
    try {
      const topic = await api.callApi('createForumTopic', {
        chat_id: chatId,
        name,
        icon_color: tab.color,
      })
      const threadId = Number(topic?.message_thread_id)
      if (!Number.isInteger(threadId) || threadId <= 0) continue
      await rememberTab(bot, chatId, threadId, tab.kind, name)
      made.push(tab.kind)
      const markup = markupFor(tab.kind)
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
 * Returns the new name, or '' when nothing was done (a fixed tab, a known
 * topic, a command, no database, or Telegram refusing the edit).
 */
export async function nameFreshTopic(
  api: TopicApi,
  bot: string,
  chatId: number,
  threadId: number,
  firstText: string | undefined
): Promise<string> {
  const title = topicTitleFrom(firstText)
  if (!title) return ''
  const have = await tabsOf(bot, chatId)
  if (have === null || have.some(r => r.thread_id === threadId)) return ''
  // Remember first: a refused edit must not be retried on every message.
  await rememberTab(bot, chatId, threadId, 'chat', title)
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
