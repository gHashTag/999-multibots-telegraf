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
 * with @playom all landed in the same list. The owner asked for a separate
 * CRM per client. `'self'` is the pre-existing personal thread (the default
 * everywhere, so no caller changes); `'client:<id>'` is the owner's thread
 * ABOUT one client. Spec: t27 specs/automation/crm-client-workspace.t27.
 */
export const SELF_THREAD = 'self'

/** A client is a numeric Telegram id, like everywhere else in this service. */
export const CLIENT_ID_RE = /^\d{5,15}$/

export function clientThread(clientId: string): string {
  return `client:${clientId}`
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
  await pool.query(
    `INSERT INTO agent_messages (telegram_id, role, content, surface, thread)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      String(telegramId),
      реплика.role,
      текст.slice(0, МАКС_ДЛИНА),
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
  const n = Math.max(1, Math.min(500, Math.floor(предел) || РЕПЛИК_ПО_УМОЛЧАНИЮ))
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
export function собратьОтвет(события: Array<{ тип?: string; текст?: string }>): string {
  return события
    .filter(е => е.тип === 'текст' && typeof е.текст === 'string')
    .map(е => е.текст as string)
    .join('')
    .trim()
}
