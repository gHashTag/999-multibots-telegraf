/**
 * THE TOPIC-TAB ENGINE, SHARED BY THE BOT AND THE RENDER SERVER.
 *
 * Spec: bot-topic-tabs.t27 (gHashTag/t27#7388, v2 in #7451). The bot makes a
 * person's tabs on /start; the render server makes the same tabs when an
 * agent calls tabs_setup. Both write the same `bot_topic_tabs` rows under the
 * same claim protocol, so the protocol must be ONE piece of code.
 *
 * This file is kept byte-identical in two places, because the render image
 * is built from apps/vibee-editor and cannot import the bot's src/:
 *   src/navigation/topics/engine.ts               (the bot)
 *   apps/vibee-editor/render/src/topic-tabs-engine.ts  (the render server)
 * src/__tests__/navigation/topicTabsEngineParity.test.ts fails on any drift.
 * That is why it imports nothing: the spec's numbers, the database, the log
 * and the topic-name rule are handed in by each host.
 *
 * IDEMPOTENT ACROSS DEPLOYS, RACES AND PROCESSES: before createForumTopic a
 * CLAIM row (a negative thread id, random per attempt) is inserted under the
 * unique key (bot, person, kind); only the insert that landed makes the tab.
 * The claim is turned into the tab only if that very row is still there: a
 * maker slower than CLAIM_STALE_MS whose claim was dropped and taken by
 * another keeps nothing and deletes the topic it made.
 *
 * /tabs asks Telegram about each stored tab with an edit that changes
 * nothing (PROBE_METHOD) and forgets only the ones Telegram says are gone.
 * Known limit: the Bot API does not document the answer for a deleted topic;
 * an answer other than "thread not found" keeps the tab.
 */

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

/** The part of bot-topic-tabs.gen.ts the engine reads. */
export interface TopicTabsSpec {
  readonly TAB_KEYS: readonly string[]
  readonly TAB_TITLES_EN: readonly string[]
  readonly TAB_EMOJI: readonly number[]
  readonly TAB_COLORS: readonly number[]
  readonly TAB_ROUTES: readonly string[]
  readonly ICON_COLORS: readonly number[]
  readonly TOPIC_NAME_MAX: number
  readonly CLAIM_STALE_MS: number
  readonly TAB_CACHE_MAX: number
  readonly PROBE_METHOD: string
  /** v4: a refused rename never remakes a tab. */
  readonly RENAME_REMAKES: boolean
  /** v5: a topic's name never opens with its emoji. */
  readonly NAME_CARRIES_EMOJI: boolean
  /** v5: the icon is set by a second call, after the topic exists. */
  readonly ICON_AFTER_CREATE: boolean
}

export interface TopicTabsLog {
  warn(message: string, meta?: Record<string, unknown>): void
}

export interface TopicTabsDeps {
  spec: TopicTabsSpec
  /** The database, or null when none is configured (then nothing is made). */
  db: () => Db | null
  log: TopicTabsLog
  /** A topic's name from its first message; '' for a command. */
  titleFrom?: (text: string | undefined) => string
  /** A fresh negative claim id; injectable for tests. */
  newClaimId?: () => number
}

export interface TabSpec {
  kind: string
  /** The member's label on buttons and in text: emoji and name. */
  ru: string
  en: string
  /**
   * The topic's own name: words only (spec v5 NAME_CARRIES_EMOJI). Telegram
   * draws the first character of a name inside a topic's icon, so an emoji
   * here would be shown twice.
   */
  topicRu: string
  topicEn: string
  /** The tab's emoji, set as the topic icon when Telegram's icon set has it. */
  emoji: string
  /** One of the colours Telegram accepts for a topic icon (spec ICON_COLORS). */
  color: number
  /** The mini-app screen the tab's first message opens. */
  route: string
  introRu: string
  introEn: string
}

export interface TabRow {
  /** Negative while a claim is being made into a tab. */
  thread_id: number
  kind: string
  title: string | null
  created_at?: Date | null
}

/** The part of a Telegram client the engine uses. */
export interface TopicApi {
  callApi(method: string, payload: any): Promise<any>
}

export interface EnsureOptions {
  /** /tabs: ask Telegram about every stored tab and remake the gone ones. */
  probe?: boolean
  now?: number
  /**
   * The kinds that may join now (bot-agent-team.t27 tended): a tab the person
   * has no row for is made only when its kind is here. A stored tab is always
   * looked after. Absent, every fixed tab may be made.
   */
  only?: readonly string[]
}

/**
 * Interface text only; key, emoji, colour and route come from the spec.
 *
 * Each tab is named after the agent who works in it (spec v3, owner
 * 2026-10-08: "name the threads after the agents"), and its intro is that
 * agent introducing itself.
 */
export const TAB_TEXT: Record<
  string,
  { ru: string; introRu: string; introEn: string }
> = {
  agent: {
    ru: 'Агент',
    introRu:
      'Здесь главный разговор с агентом. Пишите или говорите голосом — он видит все свои инструменты. Ниже — ваша команда: позовите агента, и у него появится своя вкладка.',
    introEn:
      'Your main conversation with the agent. Write or send a voice note; every tool is here. Below is your team: call an agent and it gets a tab of its own.',
  },
  reels: {
    ru: 'Режиссёр',
    introRu:
      'Я режиссёр: рилсы, липсинк, фото. Пришлите фото или опишите ролик — сделаю его в этой вкладке.',
    introEn:
      "I'm the director: reels, lip-sync, photos. Send a photo or describe the video; I make it in this tab.",
  },
  browser: {
    ru: 'Штурман',
    introRu:
      'Я штурман: веду ваш браузер на сервере. Скажите, что открыть и сделать; пароли вводите только сами.',
    introEn:
      "I'm the navigator: I drive your own browser on the server. Say what to open and do; passwords are typed by you only.",
  },
  mybot: {
    ru: 'Конструктор',
    introRu:
      'Я конструктор: собираю ваш собственный бот-агент. Кнопка ниже откроет окно Telegram для создания бота, или попросите здесь — сделаю сам. /mybot покажет ваших ботов.',
    introEn:
      "I'm the builder: I make your own agent bot. The button below opens Telegram's bot creation sheet, or ask here and I'll do it. /mybot lists your bots.",
  },
  wallet: {
    ru: 'Казначей',
    introRu:
      'Я казначей: баланс токенов, пополнение и клуб. Спросите «какой у меня баланс?» или нажмите /club.',
    introEn:
      'I\'m the treasurer: token balance, top-up and the club. Ask "what is my balance?" or send /club.',
  },
  hive: {
    ru: 'Королева',
    introRu:
      'Я королева улья: задачи, доска и пчёлы. Спросите, что сейчас в работе.',
    introEn:
      "I'm the Queen of the hive: tasks, the board and the bees. Ask what is in progress.",
  },
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

/** A short, token-free line for a log: never a URL, never a payload. */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot<token>').slice(0, 200)
}

/** A random negative id: two attempts at the same tab never share a claim. */
export function randomClaimId(): number {
  return -(1 + Math.floor(Math.random() * 2 ** 47))
}

export function createTopicTabs(deps: TopicTabsDeps) {
  const SPEC = deps.spec
  const newClaimId = deps.newClaimId ?? randomClaimId

  /** Order is the order of the tab column (the spec's order). */
  const TABS: readonly TabSpec[] = SPEC.TAB_KEYS.map((kind, i) => {
    const emoji = String.fromCodePoint(SPEC.TAB_EMOJI[i])
    const text = TAB_TEXT[kind]
    return {
      kind,
      ru: `${emoji} ${text.ru}`,
      en: `${emoji} ${SPEC.TAB_TITLES_EN[i]}`,
      topicRu: SPEC.NAME_CARRIES_EMOJI ? `${emoji} ${text.ru}` : text.ru,
      topicEn: SPEC.NAME_CARRIES_EMOJI
        ? `${emoji} ${SPEC.TAB_TITLES_EN[i]}`
        : SPEC.TAB_TITLES_EN[i],
      emoji,
      color: SPEC.TAB_COLORS[i],
      route: SPEC.TAB_ROUTES[i],
      introRu: text.introRu,
      introEn: text.introEn,
    }
  })

  /**
   * Every fixed title, in both languages, current and pre-v5 (emoji first):
   * a topic so named is never renamed from its first message.
   */
  const FIXED_NAMES: ReadonlySet<string> = new Set(
    TABS.flatMap(t => [t.ru, t.en, t.topicRu, t.topicEn])
  )

  // ---- the spec's rules, one function each (bot-topic-tabs.t27) ----

  const colorAllowed = (c: number): boolean => SPEC.ICON_COLORS.includes(c)
  const tableColorsAllowed = (
    table: readonly { color: number }[] = TABS
  ): boolean => table.every(t => colorAllowed(t.color))
  const tableColorsDistinct = (
    table: readonly { color: number }[] = TABS
  ): boolean => new Set(table.map(t => t.color)).size === table.length
  /** Characters of a name as Telegram counts them (code points). */
  const nameChars = (name: string): number => [...name].length
  const nameFits = (chars: number): boolean =>
    chars > 0 && chars <= SPEC.TOPIC_NAME_MAX
  const makeTab = (stored: boolean, alive: boolean): boolean =>
    !stored || !alive
  const forgetRow = (probeFailed: boolean, missing: boolean): boolean =>
    probeFailed && missing
  const claimWon = (insertedRows: number): boolean => insertedRows === 1
  const settleWon = (updatedRows: number): boolean => updatedRows === 1
  const claimStale = (ageMs: number): boolean => ageMs >= SPEC.CLAIM_STALE_MS
  const mayRename = (
    known: boolean,
    fixedName: boolean,
    isCommand: boolean,
    claimPending: boolean
  ): boolean => !known && !fixedName && !isCommand && !claimPending
  const maySetUp = (own: boolean, keeper: boolean): boolean => own || keeper
  const readsDb = (cached: boolean): boolean => !cached
  const evicts = (entries: number): boolean => entries >= SPEC.TAB_CACHE_MAX
  const retitle = (storedIsCurrent: boolean): boolean => !storedIsCurrent
  /** spec v4 clears_old: a remade tab's old thread is deleted first. */
  const clearsOld = (remaking: boolean, hadThread: boolean): boolean =>
    remaking && hadThread
  /** spec v5 name_ok: a topic's name does not open with an emoji. */
  const nameOk = (opensWithEmoji: boolean): boolean =>
    !opensWithEmoji || SPEC.NAME_CARRIES_EMOJI
  /** spec v5 sets_icon: only a topic that exists, only an emoji Telegram lists. */
  const setsIcon = (topicExists: boolean, inIconSet: boolean): boolean =>
    topicExists && inIconSet

  // ---- the icon (spec v5) ----

  /** Telegram's topic icon set, emoji -> custom emoji id; read once per process. */
  let iconSet: Promise<Map<string, string>> | null = null
  const bare = (emoji: string) => emoji.replace(/\uFE0F/g, '')

  async function iconIdFor(
    api: TopicApi,
    emoji: string
  ): Promise<string | undefined> {
    if (!iconSet) {
      iconSet = api
        .callApi('getForumTopicIconStickers', {})
        .then((stickers: any[]) => {
          const ids = new Map<string, string>()
          for (const s of Array.isArray(stickers) ? stickers : []) {
            if (s?.emoji && s?.custom_emoji_id)
              ids.set(bare(String(s.emoji)), String(s.custom_emoji_id))
          }
          return ids
        })
        .catch(e => {
          // Read again next time: the set is the same for every bot.
          iconSet = null
          deps.log.warn('[topic-tabs] icon set not read', {
            error: errorText(e),
          })
          return new Map<string, string>()
        })
    }
    return (await iconSet).get(bare(emoji))
  }

  /**
   * Give a made topic its tab's emoji as the icon. Never throws and never
   * costs the tab: a refused icon leaves Telegram's coloured circle.
   */
  async function setIcon(
    api: TopicApi,
    bot: string,
    chatId: number,
    threadId: number,
    tab: TabSpec
  ): Promise<void> {
    try {
      const id = await iconIdFor(api, tab.emoji)
      if (!setsIcon(threadId > 0, id !== undefined)) return
      await api.callApi('editForumTopic', {
        chat_id: chatId,
        message_thread_id: threadId,
        icon_custom_emoji_id: id,
      })
    } catch (e) {
      if (/not.?modified/i.test(errorText(e))) return
      deps.log.warn('[topic-tabs] icon not set', {
        bot,
        kind: tab.kind,
        error: errorText(e),
      })
    }
  }

  // ---- the database ----

  let schemaReady: Promise<void> | null = null

  /** Create the table and its keys once per process; a failure is retried. */
  async function ensureSchema(): Promise<boolean> {
    const d = deps.db()
    if (!d) return false
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
    return true
  }

  async function run(sql: string, params: unknown[]): Promise<any[] | null> {
    const d = deps.db()
    if (!d) return null
    await ensureSchema()
    return (await d.query(sql, params)).rows ?? []
  }

  function toRow(r: any): TabRow {
    return {
      thread_id: Number(r.thread_id),
      kind: String(r.kind),
      title: r.title ?? null,
      created_at: r.created_at ? new Date(r.created_at) : null,
    }
  }

  /** The person's rows, straight from the database. */
  async function tabsOf(bot: string, telegramId: number) {
    const rows = await run(
      'SELECT thread_id, kind, title, created_at FROM bot_topic_tabs WHERE bot_username = $1 AND telegram_id = $2',
      [bot, telegramId]
    )
    return rows?.map(toRow) ?? null
  }

  /** The person's rows under every bot: what tabs_status reports. */
  async function rowsOf(
    telegramId: number
  ): Promise<(TabRow & { bot: string })[] | null> {
    const rows = await run(
      'SELECT bot_username, thread_id, kind, title, created_at FROM bot_topic_tabs WHERE telegram_id = $1 ORDER BY bot_username, created_at',
      [telegramId]
    )
    return (
      rows?.map(r => ({ ...toRow(r), bot: String(r.bot_username) })) ?? null
    )
  }

  // ---- the in-memory copy: a message in a known tab costs no read ----

  /** bot:person -> rows, oldest first (a Map keeps insertion order). */
  const cache = new Map<string, TabRow[]>()
  const keyOf = (bot: string, telegramId: number) => `${bot}:${telegramId}`

  function keep(key: string, rows: TabRow[]): void {
    cache.delete(key)
    while (evicts(cache.size)) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      cache.delete(oldest)
    }
    cache.set(key, rows)
  }

  /** The person's rows from memory when held; `fresh` when just read. */
  async function held(
    bot: string,
    telegramId: number
  ): Promise<{ rows: TabRow[]; fresh: boolean } | null> {
    const key = keyOf(bot, telegramId)
    const have = cache.get(key)
    if (!readsDb(have !== undefined)) {
      keep(key, have!)
      return { rows: have!, fresh: false }
    }
    const rows = await tabsOf(bot, telegramId)
    if (rows === null) return null
    keep(key, rows)
    return { rows, fresh: true }
  }

  async function knownTabs(bot: string, telegramId: number) {
    return (await held(bot, telegramId))?.rows ?? null
  }

  const drop = (bot: string, telegramId: number) =>
    cache.delete(keyOf(bot, telegramId))

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
    drop(bot, telegramId)
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
    drop(bot, telegramId)
  }

  /** Turn OUR claim into the tab; false when the claim is no longer ours. */
  async function settleClaim(
    bot: string,
    telegramId: number,
    claimId: number,
    threadId: number,
    title: string
  ): Promise<boolean> {
    const rows = await run(
      `UPDATE bot_topic_tabs SET thread_id = $4, title = $5
     WHERE bot_username = $1 AND telegram_id = $2 AND thread_id = $3
     RETURNING thread_id`,
      [bot, telegramId, claimId, threadId, title]
    )
    drop(bot, telegramId)
    return settleWon(rows?.length ?? 0)
  }

  /** Is the stored tab still there? Only Telegram's "thread not found" says no. */
  async function stillThere(
    api: TopicApi,
    chatId: number,
    threadId: number
  ): Promise<boolean> {
    try {
      // No name, no icon: an edit that changes nothing, so it must find the topic.
      await api.callApi(SPEC.PROBE_METHOD, {
        chat_id: chatId,
        message_thread_id: threadId,
      })
      return true
    } catch (e) {
      return !forgetRow(true, threadMissing(e))
    }
  }

  /**
   * Give a stored fixed tab the table's current title (spec v3 retitle).
   * Returns true when Telegram says the thread is gone: the row is then
   * forgotten and the caller makes the tab again. A refused rename of any
   * other kind keeps the tab and its old name -- a name is a convenience.
   */
  async function retitleRow(
    api: TopicApi,
    bot: string,
    chatId: number,
    threadId: number,
    name: string,
    tab: TabSpec
  ): Promise<boolean> {
    const kind = tab.kind
    try {
      await api.callApi('editForumTopic', {
        chat_id: chatId,
        message_thread_id: threadId,
        name,
      })
    } catch (e) {
      if (threadMissing(e)) {
        // spec v4 RENAME_REMAKES: only the probe of /tabs decides a tab is
        // gone. A rename that says "thread not found" -- the farm's own Bot API
        // server has said so for topics that were there -- keeps the tab, or
        // the person would see it twice.
        if (!SPEC.RENAME_REMAKES) {
          deps.log.warn('[topic-tabs] rename found no thread; tab kept', {
            bot,
            kind,
          })
          return false
        }
        await forgetRowAt(bot, chatId, threadId)
        return true
      }
      // Telegram already shows this name (an earlier rename whose row update
      // was lost): only the row is behind, so it is brought up to date below.
      if (!/not.?modified/i.test(errorText(e))) {
        deps.log.warn('[topic-tabs] tab not renamed', {
          bot,
          kind,
          error: errorText(e),
        })
        return false
      }
    }
    await run(
      'UPDATE bot_topic_tabs SET title = $4 WHERE bot_username = $1 AND telegram_id = $2 AND thread_id = $3',
      [bot, chatId, threadId, name]
    )
    drop(bot, chatId)
    // The tab lost its emoji from the name (v5): it gets it as the icon now.
    await setIcon(api, bot, chatId, threadId, tab)
    return false
  }

  /** A fresh claim of the person's: a tab is being made right now. */
  const claimPending = (rows: readonly TabRow[], now: number) =>
    rows.some(
      r =>
        r.thread_id < 0 && !claimStale(now - (r.created_at?.getTime() ?? now))
    )

  /**
   * Make every fixed tab this person does not have yet. Returns the kinds made.
   * Without a database nothing is made: a tab nobody remembers would be made
   * again on the next /start, which is the duplication this engine prevents.
   * A tab that fails to be made is logged and skipped; the rest still go.
   */
  async function ensureTabs(
    api: TopicApi,
    bot: string,
    chatId: number,
    isRu: boolean,
    /** Extra markup for a tab's first message (the route button, /mybot). */
    markupFor: (tab: TabSpec) => unknown = () => undefined,
    opts: EnsureOptions = {}
  ): Promise<string[]> {
    const have = await tabsOf(bot, chatId)
    if (have === null) {
      deps.log.warn('[topic-tabs] no database, tabs not made', { bot })
      return []
    }
    const now = opts.now ?? Date.now()
    const made: string[] = []
    for (const tab of TABS) {
      const name = isRu ? tab.topicRu : tab.topicEn
      try {
        let row = have.find(r => r.kind === tab.kind)
        // Not on the team and not joining now: nothing is made behind the
        // person's back (bot-agent-team.t27 tended).
        if (!row && opts.only && !opts.only.includes(tab.kind)) continue
        if (row && row.thread_id < 0) {
          // Somebody's claim: respected while it is fresh, dropped when dead.
          const age = now - (row.created_at?.getTime() ?? now)
          if (!claimStale(age)) continue
          await forgetRowAt(bot, chatId, row.thread_id)
          row = undefined
        }
        let alive = true
        /** The thread a remade tab replaces: deleted before the new one (v4). */
        let oldThread: number | undefined
        if (row && opts.probe) {
          alive = await stillThere(api, chatId, row.thread_id)
          if (!alive) {
            oldThread = row.thread_id
            await forgetRowAt(bot, chatId, row.thread_id)
          }
        }
        // A tab the bot named under an older title gets the current one, once:
        // the row then holds the current title, so the next /start does nothing.
        if (row && alive && retitle(row.title === name)) {
          if (await retitleRow(api, bot, chatId, row.thread_id, name, tab)) {
            oldThread = row.thread_id
            row = undefined
            alive = false
          }
        }
        if (!makeTab(row !== undefined, alive)) continue

        const claimId = newClaimId()
        if (!(await claimRow(bot, chatId, claimId, tab.kind, name))) continue
        /*
         * NEVER THE SAME TAB TWICE (spec v4 clears_old). The thread the row
         * named is deleted before the new tab is made: really gone, the call
         * is refused and costs nothing; only called gone by the server, it
         * goes now instead of staying beside its twin. Only the winner of the
         * claim does it. The tab's conversation is keyed by its kind
         * (bot-agent-memory.t27), so nothing the agent knows is lost.
         */
        if (clearsOld(true, oldThread !== undefined)) {
          await api
            .callApi('deleteForumTopic', {
              chat_id: chatId,
              message_thread_id: oldThread,
            })
            .catch(() => undefined)
        }
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
            // Ours only: a claim under our own id, never another attempt's.
            await forgetRowAt(bot, chatId, claimId)
          }
        }
        if (!Number.isInteger(threadId) || threadId <= 0) continue
        if (!(await settleClaim(bot, chatId, claimId, threadId, name))) {
          // Our claim went stale and another attempt took the tab: the topic
          // we just made is a duplicate. Take it away, write nothing into it.
          deps.log.warn('[topic-tabs] claim lost, duplicate topic deleted', {
            bot,
            kind: tab.kind,
          })
          await api
            .callApi('deleteForumTopic', {
              chat_id: chatId,
              message_thread_id: threadId,
            })
            .catch(e =>
              deps.log.warn('[topic-tabs] duplicate not deleted', {
                bot,
                kind: tab.kind,
                error: errorText(e),
              })
            )
          continue
        }
        made.push(tab.kind)
        // spec v5 ICON_AFTER_CREATE: the topic exists before its icon is asked.
        await setIcon(api, bot, chatId, threadId, tab)
        const markup = markupFor(tab)
        await api.callApi('sendMessage', {
          chat_id: chatId,
          message_thread_id: threadId,
          text: isRu ? tab.introRu : tab.introEn,
          ...(markup ? { reply_markup: markup } : {}),
        })
      } catch (e) {
        deps.log.warn('[topic-tabs] tab not made', {
          bot,
          kind: tab.kind,
          error: errorText(e),
        })
      }
    }
    return made
  }

  /**
   * A topic the person opened: name it from its first message, once.
   * Returns the new name, or '' when nothing was done (a known topic, a topic
   * named like a fixed tab, a command, a tab being made, no database, a lost
   * race, or Telegram refusing the edit).
   */
  async function nameFreshTopic(
    api: TopicApi,
    bot: string,
    chatId: number,
    threadId: number,
    firstText: string | undefined,
    /** The topic's current name, when the update carries it. */
    topicName?: string,
    now: number = Date.now()
  ): Promise<string> {
    const title = deps.titleFrom ? deps.titleFrom(firstText) : ''
    const isCommand = title === ''
    const fixedName = topicName !== undefined && FIXED_NAMES.has(topicName)
    if (isCommand || fixedName) return ''
    let got = await held(bot, chatId)
    if (got === null) return ''
    let known = got.rows.some(r => r.thread_id === threadId)
    if (!known && !got.fresh) {
      // An unknown thread is rare (once per topic): read again, because the
      // copy in memory misses tabs another process (tabs_setup) is making.
      drop(bot, chatId)
      got = await held(bot, chatId)
      if (got === null) return ''
      known = got.rows.some(r => r.thread_id === threadId)
    }
    const have = got.rows
    if (!mayRename(known, fixedName, isCommand, claimPending(have, now)))
      return ''
    // Remember first: a refused edit must not be retried on every message,
    // and of two messages at once only the one whose row landed renames.
    if (!(await claimRow(bot, chatId, threadId, 'chat', title))) return ''
    // The row is ours: keep it in memory too, so the next message reads nothing.
    // (A stale copy is harmless: a known thread's insert conflicts and lands not.)
    keep(keyOf(bot, chatId), [
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
      deps.log.warn('[topic-tabs] topic not renamed', {
        bot,
        error: errorText(e),
      })
      return ''
    }
  }

  /** Tests only: forget the schema promise and the cache. */
  function resetForTests(): void {
    schemaReady = null
    iconSet = null
    cache.clear()
  }

  return {
    TABS,
    FIXED_NAMES,
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
    clearsOld,
    nameOk,
    setsIcon,
    ensureSchema,
    tabsOf,
    rowsOf,
    knownTabs,
    ensureTabs,
    nameFreshTopic,
    tabCacheSize: () => cache.size,
    resetForTests,
  }
}

export type TopicTabs = ReturnType<typeof createTopicTabs>
