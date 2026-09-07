/**
 * НОМЕР, КОТОРЫМ ЧЕЛОВЕК САМ ПОДЕЛИЛСЯ ЧЕРЕЗ TELEGRAM.
 *
 * Заведено 07.09.2026 по просьбе владельца: «заполни телефон из телеграм, если
 * открыт, чтобы руками не писать».
 *
 * ── ПОЧЕМУ ЭТО ОТДЕЛЬНОЕ ХРАНИЛИЩЕ, А НЕ ПОЛЕ `tg_sessions.phone` ──────────
 *
 * В `tg_sessions` номер появляется ПОСЛЕ успешного входа в MTProto — то есть
 * после того, как человек уже набрал его руками. Для подсказки он бесполезен:
 * к моменту, когда он там есть, вводить уже нечего.
 *
 * Здесь номер появляется РАНЬШЕ и другим путём: человек нажал в Telegram
 * «поделиться номером», и платформа передала его боту.
 *
 * ── ОТКУДА ОН МОЖЕТ ВЗЯТЬСЯ, А ОТКУДА НЕТ ─────────────────────────────────
 *
 *   чат с ботом      — кнопка «поделиться номером» (`request_contact`);
 *   мини-апп         — `WebApp.requestContact()`, окно согласия самого Telegram;
 *   приложение на iPhone — НИОТКУДА. Apple не даёт приложению читать номер
 *                      устройства, а телефон аккаунта Telegram сторонним
 *                      приложениям не отдаёт вовсе. Поэтому на телефоне
 *                      подсказка возможна ТОЛЬКО из этого хранилища.
 *
 * ── ЧЕСТНОСТЬ ──────────────────────────────────────────────────────────────
 *
 * Мы начинаем ХРАНИТЬ номер, а экран подключения до сих пор обещал «телефон,
 * код и пароль не сохраняются». Обещание пришлось поправить в обоих клиентах:
 * номер сохраняется, чтобы не вводить его снова; код и пароль — нет.
 *
 * Молча начать хранить то, про что написано «не храним», — это ровно тот
 * случай, когда экран превращается в ложь, а мы этого даже не замечаем.
 */

export interface ПулДляНомера {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

let таблицаГотова = false

async function таблица(pool: ПулДляНомера): Promise<void> {
  if (таблицаГотова) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS tg_known_phones (
       telegram_id text PRIMARY KEY,
       phone text NOT NULL,
       источник text NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  )
  таблицаГотова = true
}

/** Только для проверок: сбросить память о том, что таблица уже создана. */
export function забытьТаблицу(): void {
  таблицаГотова = false
}

/**
 * Привести номер к виду, который принимает Telegram: только цифры и ведущий +.
 *
 * Telegram отдаёт номер по-разному — «79991234567», «+7 999 123-45-67» — и
 * человек тоже. Разный вид одного номера у двух клиентов выглядел бы как два
 * разных номера.
 */
export function нормализоватьНомер(сырое: unknown): string | null {
  const цифры = String(сырое ?? '').replace(/[^\d]/g, '')
  if (цифры.length < 7 || цифры.length > 15) return null
  return `+${цифры}`
}

export async function запомнитьНомер(
  pool: ПулДляНомера,
  { telegramId, phone, источник }: { telegramId: string; phone: unknown; источник: string }
): Promise<'сохранён' | 'не похоже на номер'> {
  const номер = нормализоватьНомер(phone)
  if (!номер) return 'не похоже на номер'
  await таблица(pool)
  await pool.query(
    `INSERT INTO tg_known_phones (telegram_id, phone, источник)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id) DO UPDATE
       SET phone = EXCLUDED.phone,
           источник = EXCLUDED.источник,
           updated_at = now()`,
    [String(telegramId), номер, String(источник).slice(0, 40)]
  )
  return 'сохранён'
}

/** Номер этого человека, если он им делился. `null` — не делился. */
export async function узнатьНомер(
  pool: ПулДляНомера,
  telegramId: string
): Promise<string | null> {
  await таблица(pool)
  const r = await pool.query(
    `SELECT phone FROM tg_known_phones WHERE telegram_id = $1 LIMIT 1`,
    [String(telegramId)]
  )
  const номер = r.rows?.[0]?.phone
  return номер ? String(номер) : null
}

/**
 * Забыть номер. Зовётся при отключении Telegram.
 *
 * Иначе выходит нечестно: человек нажал «Отключить», а его номер остался у
 * нас — при том что единственная причина его хранить была «чтобы не вводить
 * снова при подключении».
 */
export async function забытьНомер(
  pool: ПулДляНомера,
  telegramId: string
): Promise<void> {
  await таблица(pool)
  await pool.query(`DELETE FROM tg_known_phones WHERE telegram_id = $1`, [
    String(telegramId),
  ])
}
