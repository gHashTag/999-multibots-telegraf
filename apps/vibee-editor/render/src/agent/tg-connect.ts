/**
 * ПОДКЛЮЧЕНИЕ СВОЕГО TELEGRAM — ТРИ ШАГА, И НИ ОДНОГО ЛИШНЕГО.
 *
 * Владелец: «надо чтобы бот прямо в телеграм запрашивал доступ, чтобы там вся
 * настройка у клиентов».
 *
 * ── ПОЧЕМУ НЕ В ЧАТЕ БОТА ───────────────────────────────────────────────────
 *
 * Код входа, отправленный СООБЩЕНИЕМ внутри Telegram, Telegram аннулирует. Это
 * не наша предосторожность, а поведение платформы: так она защищает людей от
 * самой распространённой кражи аккаунта — «пришлите мне код». Бот, просящий
 * код в чат, во-первых не сработает, во-вторых учит человека делать ровно то,
 * от чего его предупреждает каждое служебное сообщение Telegram.
 *
 * Поэтому код вводится в ФОРМУ мини-приложения. Для человека это по-прежнему
 * «всё внутри Telegram»: кнопка в боте открывает экран. Но код не проходит
 * через переписку, и подделать такую форму под чужого бота нельзя — она живёт
 * на нашем домене.
 *
 * ── ЧТО ХРАНИТСЯ И ЧТО НЕТ ──────────────────────────────────────────────────
 *
 * Телефон, код и пароль двухфакторной защиты НЕ СОХРАНЯЮТСЯ НИГДЕ. Они живут
 * ровно один запрос и уходят в Telegram. Сохраняется только строка сессии — и
 * она никогда не возвращается клиенту.
 *
 * Строка сессии СИЛЬНЕЕ ПАРОЛЯ: она не спрашивает второй фактор. Поэтому
 * лежит она в базе, привязанная к telegram_id владельца, а не в переменной
 * окружения, общей на всех.
 *
 * ── ПОЧЕМУ СОСТОЯНИЕ В ПАМЯТИ ───────────────────────────────────────────────
 *
 * Между «отправить код» и «ввести код» должен жить ПОЛУОТКРЫТЫЙ клиент
 * MTProto: у Telegram это одна непрерывная попытка входа. Класть его в базу
 * бессмысленно — он не сериализуется, — поэтому он держится в памяти процесса
 * с коротким сроком жизни. Перезапуск сервиса рвёт незаконченный вход, и это
 * честнее, чем притворяться, будто он переживёт что угодно: человек начнёт
 * заново и потеряет минуту, а не поймёт молча, почему код «не тот».
 */

import { узнатьНомер, забытьНомер } from './known-phone'

/** Сколько живёт незаконченный вход. Дольше и не нужно: код Telegram тоже. */
const ЖИЗНЬ_ПОПЫТКИ_МС = 10 * 60 * 1000

/** Сколько попыток входа держим одновременно — предохранитель от накопления. */
const МАКС_ПОПЫТОК = 200

export interface Пул {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

interface Попытка {
  telegramId: string
  phone: string
  phoneCodeHash: string
  client: any
  создана: number
}

const попытки = new Map<string, Попытка>()

function убратьПротухшие(): void {
  const сейчас = Date.now()
  for (const [ключ, п] of попытки) {
    if (сейчас - п.создана > ЖИЗНЬ_ПОПЫТКИ_МС) {
      попытки.delete(ключ)
      void п.client?.disconnect?.().catch?.(() => {})
    }
  }
}

/** Только для проверок. */
export function забытьПопытки(): void {
  попытки.clear()
}

export function числоПопыток(): number {
  return попытки.size
}

let таблицаГотова = false

async function убедитьсяВТаблице(pool: Пул): Promise<void> {
  if (таблицаГотова) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS tg_sessions (
       telegram_id text PRIMARY KEY,
       session text NOT NULL,
       phone text,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  )
  таблицаГотова = true
}

export function забытьТаблицуСессий(): void {
  таблицаГотова = false
}

/**
 * Сохранить сессию человека.
 *
 * `ON CONFLICT` по владельцу: повторное подключение заменяет прежнюю сессию, а
 * не плодит вторую. Две живые сессии на один аккаунт — это две двери, о
 * второй из которых человек не знает.
 */
export async function сохранитьСессию(
  pool: Пул,
  telegramId: string,
  session: string,
  phone?: string
): Promise<void> {
  if (!telegramId || !session) throw new Error('нужны telegram_id и сессия')
  await убедитьсяВТаблице(pool)
  await pool.query(
    `INSERT INTO tg_sessions (telegram_id, session, phone)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id)
     DO UPDATE SET session = $2, phone = $3, updated_at = now()`,
    [String(telegramId), session, phone ?? null]
  )
}

/** Прочитать сессию — ТОЛЬКО свою. */
export async function прочитатьСессию(
  pool: Пул,
  telegramId: string
): Promise<string | null> {
  if (!telegramId) return null
  await убедитьсяВТаблице(pool)
  const r = await pool.query(
    `SELECT session FROM tg_sessions WHERE telegram_id = $1`,
    [String(telegramId)]
  )
  const s = r.rows?.[0]?.session
  return typeof s === 'string' && s ? s : null
}

/**
 * Отключить аккаунт.
 *
 * Забыть строку у себя — половина дела: сама сессия в Telegram останется
 * живой. Поэтому сначала выходим в Telegram (logOut), и только потом удаляем
 * запись. Порядок важен: удалив первыми, мы потеряли бы возможность выйти и
 * оставили бы висеть сеанс, которого человек уже не видит у себя в списке.
 */
export async function отключитьСессию(
  pool: Пул,
  telegramId: string,
  выйтиВTelegram: (session: string) => Promise<void>
): Promise<{ забыто: boolean; вышли: boolean }> {
  const сессия = await прочитатьСессию(pool, telegramId)
  if (!сессия) return { забыто: false, вышли: false }
  let вышли = false
  try {
    await выйтиВTelegram(сессия)
    вышли = true
  } catch {
    // Не смогли выйти — всё равно забываем у себя: держать строку, которой
    // человек больше не доверяет, хуже, чем не закрыть чужой сеанс.
  }
  await pool.query(`DELETE FROM tg_sessions WHERE telegram_id = $1`, [
    String(telegramId),
  ])
  return { забыто: true, вышли }
}

/** Телефон в виде, который принимает Telegram: цифры и ведущий плюс. */
export function нормализоватьТелефон(сырой: string): string {
  const т = String(сырой ?? '').replace(/[^\d+]/g, '')
  const без = т.startsWith('+') ? т.slice(1) : т
  if (!/^\d{7,15}$/.test(без)) {
    throw new Error(
      'телефон должен быть в международном виде, например +79991234567'
    )
  }
  return `+${без}`
}

/** Код из Telegram: пять цифр, без пробелов и дефисов, которые люди вставляют. */
export function нормализоватьКод(сырой: string): string {
  const к = String(сырой ?? '').replace(/\D/g, '')
  if (!/^\d{4,7}$/.test(к)) throw new Error('код состоит из цифр')
  return к
}

/**
 * Шаг 1: отправить код.
 *
 * `создатьКлиент` внедряется, чтобы модуль проверялся без обращения к
 * Telegram: сеть в тесте — это не проверка логики, а проверка сети.
 */
export async function начатьВход(
  telegramId: string,
  сыройТелефон: string,
  создатьКлиент: () => Promise<any>,
  случайныйКлюч: () => string
): Promise<{ handle: string; phone: string; viaApp: boolean }> {
  убратьПротухшие()
  if (попытки.size >= МАКС_ПОПЫТОК) {
    throw new Error(
      'слишком много незаконченных входов — попробуйте через минуту'
    )
  }
  const phone = нормализоватьТелефон(сыройТелефон)
  const client = await создатьКлиент()
  /*
   * `isCodeViaApp` DECIDES WHERE THE PERSON WILL LOOK FOR THE CODE.
   *
   * Telegram sends the code either as a message inside Telegram itself (the
   * "Telegram" service chat) or as an SMS -- the platform chooses, not us. The
   * screen has been ASSERTING "the code was sent to Telegram". When an SMS
   * arrives instead, the person spends ten minutes scrolling chats and decides
   * the login is broken.
   *
   * GramJS hands the value back; nothing here needed inventing, only asking.
   */
  const { phoneCodeHash, isCodeViaApp } = await client.sendCode(
    { apiId: client.apiId, apiHash: client.apiHash },
    phone
  )
  const handle = случайныйКлюч()
  попытки.set(handle, {
    telegramId: String(telegramId),
    phone,
    phoneCodeHash,
    client,
    создана: Date.now(),
  })
  return { handle, phone, viaApp: !!isCodeViaApp }
}

/**
 * Шаг 2: код. Возвращает либо готовую сессию, либо «нужен пароль».
 *
 * Попытка ПРИНАДЛЕЖИТ человеку: handle сам по себе не пропуск. Иначе
 * подобранный или подсмотренный handle позволил бы завершить чужой вход.
 */
export async function подтвердитьКод(
  telegramId: string,
  handle: string,
  сыройКод: string
): Promise<{ сессия?: string; нуженПароль?: boolean; phone: string }> {
  убратьПротухшие()
  const п = попытки.get(handle)
  if (!п) throw new Error('вход не начат или истёк — начните заново')
  if (п.telegramId !== String(telegramId)) {
    throw new Error('этот вход начат другим человеком')
  }
  const код = нормализоватьКод(сыройКод)
  try {
    /*
     * A REAL `Api.auth.SignIn`, NOT A PLAIN OBJECT.
     *
     * This line used to pass `{ _: 'auth.signIn', ... }`. GramJS checks
     * `classType === 'request'` before serialising and refuses anything else
     * with "You can only invoke MTProtoRequests" -- exactly what the owner saw
     * on screen after typing a correct code. Every sign-in was impossible;
     * nothing about the code or the phone was ever wrong.
     *
     * The field name was wrong too: Telegram wants `phoneNumber`, so even a
     * lenient client would have signed in nobody.
     *
     * Imported here rather than at the top so the module stays loadable
     * without `telegram` present -- the same reason the client is injected.
     */
    const { Api } = await import('telegram')
    await п.client.invoke(
      // cyrillic-ok: pre-existing local name
      new Api.auth.SignIn({
        phoneNumber: п.phone, // cyrillic-ok: pre-existing local name
        phoneCodeHash: п.phoneCodeHash, // cyrillic-ok: pre-existing local name
        phoneCode: код, // cyrillic-ok: pre-existing local name
      })
    )
  } catch (e) {
    const текст = String(e)
    if (/SESSION_PASSWORD_NEEDED/i.test(текст)) {
      return { нуженПароль: true, phone: п.phone }
    }
    throw e
  }
  const сессия = String(п.client.session.save())
  попытки.delete(handle)
  return { сессия, phone: п.phone }
}

/** Шаг 3: пароль двухфакторной защиты, если он включён. */
export async function подтвердитьПароль(
  telegramId: string,
  handle: string,
  пароль: string
): Promise<{ сессия: string; phone: string }> {
  убратьПротухшие()
  const п = попытки.get(handle)
  if (!п) throw new Error('вход не начат или истёк — начните заново')
  if (п.telegramId !== String(telegramId)) {
    throw new Error('этот вход начат другим человеком')
  }
  if (!пароль) throw new Error('пароль пустой')
  await п.client.signInWithPassword(
    { apiId: п.client.apiId, apiHash: п.client.apiHash },
    {
      password: async () => пароль,
      onError: (e: unknown) => {
        throw e
      },
    }
  )
  const сессия = String(п.client.session.save())
  попытки.delete(handle)
  return { сессия, phone: п.phone }
}

/**
 * ── HTTP: пять маршрутов, которыми пользуется экран ─────────────────────────
 *
 * ЛИЧНОСТЬ ЗДЕСЬ СТРОЖЕ, ЧЕМ У ОСТАЛЬНЫХ МАРШРУТОВ. Подключение аккаунта —
 * действие человека над своим аккаунтом, поэтому серверный ключ с явным
 * telegram_id тут НЕ принимается, хотя он принят у чата и у ленты. Иначе
 * владелец ключа мог бы начать вход за кого угодно, а Telegram прислал бы
 * код ничего не подозревающему человеку.
 *
 * Так что подпись мини-аппа или сессия приложения — и ничего кроме.
 */
export interface ЗависимостиМаршрута {
  getPool: () => Promise<Пул>
  /** Кто спрашивает: только подпись/сессия, без серверного ключа. */
  личность: (req: unknown) => string | null
  readBody: (req: unknown) => Promise<string>
  создатьКлиент: () => Promise<any>
  случайныйКлюч: () => string
  выйтиВTelegram: (session: string) => Promise<void>
}

/** Пути, которые обслуживает этот модуль. */
export const ПУТИ_ПОДКЛЮЧЕНИЯ = [
  '/api/tg/connect/start',
  '/api/tg/connect/code',
  '/api/tg/connect/password',
  '/api/tg/connect/status',
  '/api/tg/connect',
] as const

export function этоПутьПодключения(путь: string): boolean {
  return (ПУТИ_ПОДКЛЮЧЕНИЯ as readonly string[]).includes(путь)
}

interface Ответ {
  код: number
  тело: Record<string, unknown>
}

/**
 * Обработать запрос подключения.
 *
 * Возвращает код и тело, а не пишет в сокет: так модуль проверяется без
 * поднятого сервера, а сервер остаётся одной строчкой.
 */
export async function обработатьПодключение(
  req: { url?: string; method?: string },
  зав: ЗависимостиМаршрута
): Promise<Ответ> {
  const путь = (req.url || '').split('?')[0]
  const кто = зав.личность(req)
  if (!кто) {
    return {
      код: 401,
      тело: {
        ok: false,
        /*
         * НАЗЫВАЕМ ОБА СПОСОБА, А НЕ ОДИН.
         *
         * Здесь стояло «требует вашей подписи Telegram — откройте экран из
         * приложения». Личность берётся через `chatIdentity`, а он принимает
         * И подпись мини-аппа, И сессию приложения. Для человека, который
         * стоит в приложении на iPhone с протухшей сессией, прежний текст был
         * прямым ложным советом: он УЖЕ в приложении, и «откройте экран из
         * приложения» отправляет его по кругу.
         */
        error:
          'нужно назвать себя: подпись Telegram (мини-апп) или вход в приложении по коду',
      },
    }
  }

  const pool = await зав.getPool()

  if (путь === '/api/tg/connect/status' && req.method === 'GET') {
    const есть = await прочитатьСессию(pool, кто)
    /*
     * ПОДСКАЗКА НОМЕРА ЕДЕТ ВМЕСТЕ СО СТАТУСОМ, А НЕ ОТДЕЛЬНЫМ ЗАПРОСОМ.
     *
     * Владелец 07.09.2026: «заполни телефон из телеграм, чтобы руками не
     * писать». Прочитать номер у Telegram нельзя — платформа не отдаёт его
     * ботам ни при каком входе, — но если человек им однажды поделился
     * (кнопка «Поделиться номером»), мы его знаем.
     *
     * Экран и так спрашивает статус при открытии. Второй запрос ради одной
     * строки — лишний круг сети ровно там, где человек ждёт форму.
     */
    const номер = await узнатьНомер(pool, кто)
    return { код: 200, тело: { ok: true, подключено: !!есть, phone: номер } }
  }

  if (путь === '/api/tg/connect' && req.method === 'DELETE') {
    const r = await отключитьСессию(pool, кто, зав.выйтиВTelegram)
    /*
     * Отключил — забываем и номер.
     *
     * Единственная причина хранить его — «чтобы не вводить снова при
     * подключении». После отключения причины нет, а номер остался бы лежать:
     * так и получается хранение без основания, которого человек не заказывал.
     */
    await забытьНомер(pool, кто)
    return { код: 200, тело: { ok: true, ...r } }
  }

  if (req.method !== 'POST') {
    return { код: 405, тело: { ok: false, error: 'метод не поддерживается' } }
  }

  let тело: any = {}
  try {
    тело = JSON.parse((await зав.readBody(req)) || '{}')
  } catch {
    return {
      код: 400,
      тело: { ok: false, error: 'тело не разобрано как JSON' },
    }
  }

  try {
    if (путь === '/api/tg/connect/start') {
      const r = await начатьВход(
        кто,
        String(тело.phone ?? ''),
        зав.создатьКлиент,
        зав.случайныйКлюч
      )
      // Телефон возвращаем ЧЕЛОВЕКУ, чтобы он видел, куда ушёл код, и заметил
      // опечатку до того, как начнёт ждать сообщение впустую.
      return {
        код: 200, // cyrillic-ok: pre-existing response shape
        тело: { ok: true, handle: r.handle, phone: r.phone, viaApp: r.viaApp }, // cyrillic-ok
      }
    }

    if (путь === '/api/tg/connect/code') {
      const r = await подтвердитьКод(
        кто,
        String(тело.handle ?? ''),
        String(тело.code ?? '')
      )
      if (r.нуженПароль) {
        return { код: 200, тело: { ok: true, нужен_пароль: true } }
      }
      await сохранитьСессию(pool, кто, r.сессия as string, r.phone)
      // Сама строка сессии НЕ возвращается: она сильнее пароля, и клиенту
      // она не нужна ни для чего.
      return { код: 200, тело: { ok: true, подключено: true } }
    }

    if (путь === '/api/tg/connect/password') {
      const r = await подтвердитьПароль(
        кто,
        String(тело.handle ?? ''),
        String(тело.password ?? '')
      )
      await сохранитьСессию(pool, кто, r.сессия, r.phone)
      return { код: 200, тело: { ok: true, подключено: true } }
    }
  } catch (e) {
    /*
     * Причина отказа доходит до человека ЦЕЛИКОМ: «неверный код» и «слишком
     * много попыток» он исправляет по-разному, а общее «не получилось»
     * оставляет его гадать. Текст Telegram при этом короткий и без секретов.
     */
    return { код: 400, тело: { ok: false, error: String(e).slice(0, 300) } }
  }

  return { код: 404, тело: { ok: false, error: 'нет такого пути' } }
}
