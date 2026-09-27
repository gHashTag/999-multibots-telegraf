/**
 * ХРАНИЛИЩЕ РАЗГОВОРА С АГЕНТОМ — НА СЕРВЕРЕ, А НЕ В БРАУЗЕРЕ.
 *
 * Владелец: «чат бота и чат в мини аппе в агента должен быть
 * синхронизирован». Оказалось, что синхронизировать нечего: хранилища не
 * существовало.
 *
 * Как было (проверено 06.09.2026):
 *
 *  - переписка мини-аппа жила ЦЕЛИКОМ в localStorage браузера
 *    (`atomWithStorage`, ключ `vibee-agent-chat`), потолок 100 сообщений, при
 *    переполнении молча выбрасывалось НАЧАЛО разговора;
 *  - сервер не хранил ничего: клиент присылал всю переписку каждым запросом
 *    (`routes.ts`: `body.messages`), и единственным обращением к базе внутри
 *    агента был `SELECT content FROM user_soul`;
 *  - таблицы сообщений не было вовсе.
 *
 * Следствие, которое видел человек: почистил браузер, сменил устройство или
 * открыл мини-апп из другого клиента Telegram — разговора нет. И никто на
 * сервере не знает, что он был.
 *
 * ── ПОЧЕМУ ХРАНИМ, ХОТЯ ПРЕЖНЕЕ РЕШЕНИЕ БЫЛО ОСОЗНАННЫМ ─────────────────────
 *
 * В chat.ts написано прямо: «История передаётся целиком: серверная сессия
 * пережила бы перезапуск хуже, чем клиент переживёт повторную отправку». Для
 * ОДНОЙ поверхности это верно и дёшево. Но поверхностей теперь две — бот и
 * мини-апп, — и у них нет общего браузера. Общая память обязана лежать там,
 * где обе стороны её видят.
 *
 * Клиент при этом продолжает присылать историю: сервер её ЗАПИСЫВАЕТ, но не
 * начинает ей единолично распоряжаться. Это оставляет прежнюю живучесть
 * (перезапуск сервера не рвёт разговор) и добавляет общую память.
 */

// The thread keys and the client id's shape are the spec's: gHashTag/t27
// specs/automation/crm-client-workspace.t27, vendored with its `t27c gen-ts` output.
import * as WS from '../spec/crm-client-workspace.gen'

/** Минимальная форма пула, чтобы модуль проверялся без настоящей базы. */
export interface Пул {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export type РольРеплики = 'user' | 'assistant'

/**
 * THREAD: which conversation a turn belongs to.
 *
 * Until 2026-09-13 one person had exactly one thread, keyed by telegram_id,
 * and the owner's talk about client A, the invoice for client B and the duet
 * with a connected buyer all landed in the same list. The owner asked for a separate
 * CRM per client. `'self'` is the pre-existing personal thread (the default
 * everywhere, so no caller changes); `'client:<id>'` is the owner's thread
 * ABOUT one client. Spec: t27 specs/automation/crm-client-workspace.t27.
 */
export const SELF_THREAD = WS.THREAD_SELF

/** A client is a numeric Telegram id, like everywhere else in this service. */
export const CLIENT_ID_RE = new RegExp(
  `^\\d{${WS.CLIENT_ID_MIN_DIGITS},${WS.CLIENT_ID_MAX_DIGITS}}$`
)

export function clientThread(clientId: string): string {
  return `${WS.THREAD_CLIENT_PREFIX}${clientId}`
}

/** The Queen's supervision of one client: beside the agent's thread, never inside it. */
export function supervisorThread(clientId: string): string {
  return `${clientThread(clientId)}${WS.THREAD_SUPERVISOR_SUFFIX}`
}

/**
 * A ROOM HAS ITS OWN MEMORY, AND THAT IS THE WHOLE POINT.
 *
 * Until this existed, a turn in a group was keyed by the PERSON who wrote
 * (`спроситьАгента(ctx.from.id, …)` in the bot). So an answer in a shared room
 * was composed with that person's private correspondence in context, and the
 * group turn was written back into their personal history. Issue #2644 named
 * it and put "do not call the agent in the room" out of scope for exactly this
 * reason: it is their DMs read out in front of everybody else.
 *
 * A room thread is keyed by the CHAT. The people in it are identified as
 * themselves -- tools, wallet and rights stay personal -- but the memory of
 * the conversation belongs to the room, which is what a person in that room
 * would assume it does.
 *
 * Telegram group ids are negative, which is why this is not `clientThread`:
 * `CLIENT_ID_RE` accepts positive digits only, and a group would have been
 * refused as a bad client -- the trap the same issue wrote down.
 */
export const ROOM_ID_RE = /^-\d{5,20}$/

export function roomThread(chatId: string): string {
  return `room:${chatId}`
}

/** A hired specialist never shares memory with the general assistant. */
export function marketplaceAgentThread(agentId: string): string {
  return `agent:${agentId}`
}

/**
 * SEVERAL CONVERSATIONS WITH ONE AGENT (owner, 2026-09-26: "so I can keep
 * several chats going").
 *
 * The person's own thread and each specialist's thread used to be ONE
 * conversation forever: a second task meant clearing the first. A
 * conversation is the base thread plus `~<id>` -- `self~k3x9`,
 * `agent:rtl~a1b2` -- so every existing turn stays where it is (the base
 * thread is the first conversation) and nothing is migrated.
 *
 * Only the person's own thread and a specialist's split: a client's thread is
 * one conversation about one person, and a room's belongs to the room.
 *
 * Spec: t27 specs/automation/agent-conversations.t27 -- the gate order
 * (base thread first, then the id), which threads split, and one stream per
 * conversation, all as compiler-checked assertions.
 */
export const CONVERSATION_RE = /^[a-z0-9]{4,24}$/
export const CONVERSATION_SEP = '~'

export function conversationThread(base: string, conversation: string): string {
  return `${base}${CONVERSATION_SEP}${conversation}`
}

/** A thread that may be split into conversations. Pure. */
export function splittable(thread: string): boolean {
  if (thread.includes(CONVERSATION_SEP)) return false
  return thread === SELF_THREAD || /^agent:[a-z0-9_-]+$/.test(thread)
}

export interface ConversationRow {
  /** null for the base thread: the conversation that was there first. */
  conversation: string | null
  title: string | null
  turns: number
  lastAt: string
  preview: string
}

const TITLE_MAX = 80
const PREVIEW_MAX = 140

let titlesReady = false
async function ensureTitles(
  pool: Пул // cyrillic-ok: pre-existing pool type
): Promise<void> {
  if (titlesReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS agent_conversation_titles (
       telegram_id text NOT NULL,
       thread text NOT NULL,
       title text NOT NULL,
       PRIMARY KEY (telegram_id, thread)
     )`
  )
  titlesReady = true
}

export function forgetTitlesTableForTests(): void {
  titlesReady = false
}

const oneLine = (text: string, max: number): string => {
  const flat = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * The conversations under one base thread, most recent first. The title is
 * the one the person gave, else the first thing they asked there.
 */
export async function listConversations(
  pool: Пул, // cyrillic-ok: pre-existing type name
  telegramId: string,
  base: string,
  limit = 50
): Promise<ConversationRow[]> {
  if (!telegramId || !splittable(base)) return []
  await убедитьсяВТаблице(pool) // cyrillic-ok: pre-existing function name
  await ensureTitles(pool)
  const prefix = `${base}${CONVERSATION_SEP}`
  const r = await pool.query(
    `SELECT thread, count(*)::int AS turns, max(created_at)::text AS last_at,
            (array_agg(content ORDER BY id) FILTER (WHERE role = 'user'))[1] AS first_user,
            (array_agg(content ORDER BY id DESC))[1] AS last_text
       FROM agent_messages
      WHERE telegram_id = $1
        AND (thread = $2 OR left(thread, length($3)) = $3)
      GROUP BY thread
      ORDER BY max(id) DESC
      LIMIT $4`,
    [String(telegramId), base, prefix, Math.max(1, Math.min(200, limit))]
  )
  const titles = await pool.query(
    `SELECT thread, title FROM agent_conversation_titles
      WHERE telegram_id = $1 AND (thread = $2 OR left(thread, length($3)) = $3)`,
    [String(telegramId), base, prefix]
  )
  const named = new Map<string, string>(
    (titles.rows || []).map(t => [String(t.thread), String(t.title)])
  )
  return (r.rows || []).map(row => {
    const thread = String(row.thread)
    const conversation =
      thread === base ? null : thread.slice(prefix.length) || null
    const first = row.first_user
      ? oneLine(String(row.first_user), TITLE_MAX)
      : ''
    return {
      conversation,
      title: named.get(thread) ?? (first || null),
      turns: Number(row.turns) || 0,
      lastAt: String(row.last_at || ''),
      preview: oneLine(String(row.last_text || ''), PREVIEW_MAX),
    }
  })
}

/** Name a conversation; an empty name goes back to the first question. */
export async function renameConversation(
  pool: Пул, // cyrillic-ok: pre-existing type name
  telegramId: string,
  thread: string,
  title: string
): Promise<void> {
  await ensureTitles(pool)
  const name = oneLine(title, TITLE_MAX)
  if (!name) {
    await pool.query(
      `DELETE FROM agent_conversation_titles WHERE telegram_id = $1 AND thread = $2`,
      [String(telegramId), thread]
    )
    return
  }
  await pool.query(
    `INSERT INTO agent_conversation_titles (telegram_id, thread, title)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id, thread) DO UPDATE SET title = EXCLUDED.title`,
    [String(telegramId), thread, name]
  )
}

/** A deleted conversation takes its name with it. */
export async function forgetConversationTitle(
  pool: Пул, // cyrillic-ok: pre-existing type name
  telegramId: string,
  thread: string
): Promise<void> {
  await ensureTitles(pool)
  await pool.query(
    `DELETE FROM agent_conversation_titles WHERE telegram_id = $1 AND thread = $2`,
    [String(telegramId), thread]
  )
}

export interface Реплика {
  /*
   * НОМЕР ОТДАЁТСЯ КЛИЕНТУ, иначе удаление одной реплики невозможно.
   *
   * Маршрут удаления принимает `?id=`, а история его не возвращала — то есть
   * возможность была написана, покрыта тестами и недостижима. Найдено при
   * попытке убрать собственные проверочные реплики из разговора владельца.
   */
  id?: number
  role: РольРеплики
  content: string
  /** Откуда пришла: чтобы в общем разговоре было видно, где человек писал. */
  surface: string
  created_at?: string
  /** 'self' or 'client:<id>'; always present on what is read back. */
  thread?: string
}

/**
 * Сколько реплик отдаём по умолчанию.
 *
 * Не «всё»: разговор растёт без предела, а в подсказку модели всё равно
 * влезает ограниченное окно. Сотня — тот же порядок, что и прежний потолок
 * localStorage, чтобы поведение не изменилось скачком.
 */
export const РЕПЛИК_ПО_УМОЛЧАНИЮ = 100

/** Потолок одной реплики. Длинные ответы модели режем, а не теряем строку. */
const МАКС_ДЛИНА = 20000

let таблицаГотова = false

/**
 * Таблица создаётся по требованию — тем же приёмом, что `user_tokens` и
 * `star_payments` в этом же сервисе. Отдельной миграции здесь нет, и заводить
 * её ради одной таблицы значило бы завести второй способ менять схему.
 */
async function убедитьсяВТаблице(pool: Пул): Promise<void> {
  if (таблицаГотова) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS agent_messages (
       id bigserial PRIMARY KEY,
       telegram_id text NOT NULL,
       role text NOT NULL,
       content text NOT NULL,
       surface text NOT NULL DEFAULT 'unknown',
       created_at timestamptz NOT NULL DEFAULT now()
     )`
  )
  // Читаем всегда по владельцу и по времени — без индекса это полный проход
  // по чужим разговорам на каждом открытии чата.
  await pool.query(
    `CREATE INDEX IF NOT EXISTS agent_messages_owner_time
       ON agent_messages (telegram_id, id)`
  )
  // The thread column arrives by ALTER so existing rows keep working: every
  // old turn is 'self', which is exactly what it was before threads existed.
  await pool.query(
    `ALTER TABLE agent_messages
       ADD COLUMN IF NOT EXISTS thread text NOT NULL DEFAULT 'self'`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS agent_messages_owner_thread_time
       ON agent_messages (telegram_id, thread, id)`
  )
  таблицаГотова = true
}

/** Только для проверок: сбросить память о созданной таблице. */
export function забытьТаблицу(): void {
  таблицаГотова = false
}

/**
 * Записать реплику.
 *
 * Пустое НЕ пишем: агент иногда заканчивает ход одними вызовами инструментов,
 * без текста, и пустая строка в истории выглядела бы как молчание в ответ на
 * вопрос.
 *
 * THE SAME TURN TWICE IN A ROW IS NEVER A SECOND TURN (added 21.09.2026).
 *
 * Measured in a live client's transcript, 20.09: one
 * three-letter word of hers stands there twice, at 17:07:45 and 17:11:10,
 * with nothing between them. She typed it once. The bot retries a turn the
 * render dropped,
 * and a retry resends the SAME `messages` array, so the arrival write in
 * `handleAgentChat` stored her question again. Every retry that day cost the
 * conversation one turn of its 40-turn window, and the window is the whole of
 * what the agent remembers.
 *
 * The rule is deliberately the narrowest one that fixes it: identical role,
 * identical text, and nothing written since. A person who really repeats
 * themselves after an answer keeps both lines, because the answer is in
 * between. A person who repeats themselves with nothing in between has told
 * the transcript nothing it does not already hold.
 */
export async function записатьРеплику(
  pool: Пул,
  telegramId: string,
  реплика: Реплика,
  thread: string = SELF_THREAD
): Promise<boolean> {
  const текст = (реплика.content || '').trim()
  if (!telegramId || !текст) return false
  await убедитьсяВТаблице(pool)
  const saved = текст.slice(0, МАКС_ДЛИНА) // cyrillic-ok: pre-existing locals
  const role = реплика.role // cyrillic-ok: pre-existing parameter
  const previous = await pool.query(
    `SELECT role, content FROM agent_messages
      WHERE telegram_id = $1 AND thread = $2
      ORDER BY id DESC LIMIT 1`,
    [String(telegramId), thread || SELF_THREAD]
  )
  const last = (previous.rows || [])[0]
  if (last && last.role === role && String(last.content) === saved) return false
  await pool.query(
    `INSERT INTO agent_messages (telegram_id, role, content, surface, thread)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      String(telegramId),
      role,
      saved,
      реплика.surface || 'unknown',
      thread || SELF_THREAD,
    ]
  )
  return true
}

/**
 * Прочитать хвост разговора В ХРОНОЛОГИЧЕСКОМ порядке.
 *
 * Выбираем последние N по убыванию и переворачиваем: `ORDER BY id ASC LIMIT N`
 * отдал бы НАЧАЛО переписки, то есть ровно не то, что нужно для продолжения
 * разговора.
 */
export async function прочитатьРазговор(
  pool: Пул,
  telegramId: string,
  предел = РЕПЛИК_ПО_УМОЛЧАНИЮ,
  thread: string = SELF_THREAD
): Promise<Реплика[]> {
  if (!telegramId) return []
  await убедитьсяВТаблице(pool)
  const n = Math.max(
    1,
    Math.min(500, Math.floor(предел) || РЕПЛИК_ПО_УМОЛЧАНИЮ)
  )
  const threadKey = thread || SELF_THREAD
  const r = await pool.query(
    `SELECT id, role, content, surface, thread, created_at::text AS created_at
       FROM agent_messages
      WHERE telegram_id = $1 AND thread = $3
      ORDER BY id DESC
      LIMIT $2`,
    [String(telegramId), n, threadKey]
  )
  return (r.rows || []).reverse().map(row => ({
    id: row.id == null ? undefined : Number(row.id),
    role: row.role as РольРеплики,
    content: String(row.content),
    surface: String(row.surface || 'unknown'),
    created_at: row.created_at,
    thread: String(row.thread || threadKey),
  }))
}

/**
 * Удалить ОДНУ реплику — только свою.
 *
 * `telegram_id` в условии не для красоты: без него знание чужого id
 * превращалось бы в право стирать чужую переписку. Возвращаем, сколько строк
 * удалилось, чтобы вызывающий отличал «удалил» от «такой реплики нет».
 */
export async function удалитьРеплику(
  pool: Пул,
  telegramId: string,
  id: number,
  thread: string = SELF_THREAD
): Promise<number> {
  if (!telegramId || !Number.isFinite(id)) return 0
  await убедитьсяВТаблице(pool)
  const r: any = await pool.query(
    `DELETE FROM agent_messages WHERE id = $1 AND telegram_id = $2 AND thread = $3`,
    [id, String(telegramId), thread || SELF_THREAD]
  )
  return r?.rowCount ?? 0
}

/**
 * Очистить разговор целиком.
 *
 * Нужно кнопке «Новый разговор»: раньше она стирала только память браузера, и
 * общий разговор на сервере оставался — человек нажимал «начать заново», а
 * агент продолжал помнить всё. Обещание, которого интерфейс не выполнял.
 */
export async function очиститьРазговор(
  pool: Пул,
  telegramId: string,
  thread: string = SELF_THREAD
): Promise<number> {
  if (!telegramId) return 0
  await убедитьсяВТаблице(pool)
  // One thread at a time: a client thread's "new conversation" must never
  // take the owner's own thread with it, and the other way round.
  const r: any = await pool.query(
    `DELETE FROM agent_messages WHERE telegram_id = $1 AND thread = $2`,
    [String(telegramId), thread || SELF_THREAD]
  )
  return r?.rowCount ?? 0
}

/**
 * Собрать текст ответа агента из потока событий.
 *
 * Ответ приходит кусками (`тип: 'текст'`), а размышление — отдельным типом и
 * в историю НЕ идёт: это черновик мысли, а не сказанное человеку. Ошибку тоже
 * не пишем ответом: иначе следующий виток разговора прочитал бы её как слова
 * агента и начал бы на них опираться.
 */
export function собратьОтвет(
  события: Array<{ тип?: string; текст?: string }>
): string {
  return события
    .filter(е => е.тип === 'текст' && typeof е.текст === 'string')
    .map(е => е.текст as string)
    .join('')
    .trim()
}
