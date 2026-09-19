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
import { hangUp } from './hang-up'
import { ingestAfterConnect } from './crm-ingest-on-connect'
import {
  requestCode,
  requestResend,
  type CodeDelivery,
} from './tg-code-delivery'
import {
  accountOf,
  advanceQr,
  beginQr,
  loginUrl,
  type QrAccount,
  type QrState,
} from './tg-qr-login'

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
  /** Present for a QR login: no number, no hash, a token on screen instead. */
  qr?: QrState
}

const попытки = new Map<string, Попытка>()

function убратьПротухшие(): void {
  const сейчас = Date.now()
  for (const [ключ, п] of попытки) {
    if (сейчас - п.создана > ЖИЗНЬ_ПОПЫТКИ_МС) {
      попытки.delete(ключ)
      void hangUp(п.client)
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
): Promise<{ handle: string; phone: string; viaApp: boolean } & CodeDelivery> {
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
   *
   * 2026-09-17: "app or SMS" turned out to be a guess as well. The helper
   * `client.sendCode()` keeps two fields of `auth.sentCode` and drops the
   * rest, so a login email and a voice call were both reported as "SMS", and
   * the screen had no `next_type` or `timeout` to be honest about resending.
   * The raw call in tg-code-delivery.ts keeps the whole answer. `viaApp` stays
   * in the response because the iOS app and older bundles still read it.
   */
  const { phoneCodeHash, ...sent } = await requestCode(client, phone)
  const handle = случайныйКлюч()
  попытки.set(handle, {
    telegramId: String(telegramId),
    phone,
    phoneCodeHash,
    client,
    создана: Date.now(),
  })
  return { handle, phone, viaApp: sent.delivery === 'app', ...sent }
}

/**
 * Step 1b: ask for the code again -- through Telegram's NEXT channel.
 *
 * "Request a new code" used to call `/start` again, which is `auth.sendCode`
 * a second time: the same code, the same channel, and a second half-open
 * MTProto client left behind for ten minutes. A person who never received the
 * first message could press it for an hour and nothing would change.
 *
 * `auth.resendCode` continues the SAME attempt and moves to `next_type`. The
 * hash is taken from the new answer, the way official clients do: signing in
 * against a stale hash fails with PHONE_CODE_EXPIRED on a code that is right.
 *
 * The attempt belongs to a person, exactly as in the code step: a handle alone
 * must not let somebody else make Telegram call or text a stranger's phone.
 */
export async function resendCode(
  telegramId: string,
  handle: string
): Promise<{ handle: string; phone: string; viaApp: boolean } & CodeDelivery> {
  убратьПротухшие() // cyrillic-ok: pre-existing local name
  const attempt = попытки.get(handle) // cyrillic-ok: pre-existing local name
  if (!attempt) throw new Error('вход не начат или истёк — начните заново')
  if (attempt.telegramId !== String(telegramId)) {
    throw new Error('этот вход начат другим человеком')
  }
  const { phoneCodeHash, ...sent } = await requestResend(
    attempt.client,
    attempt.phone,
    attempt.phoneCodeHash
  )
  attempt.phoneCodeHash = phoneCodeHash
  // A fresh code deserves a fresh ten minutes: without this a resend late in
  // the window hands over a code whose attempt is swept before it is typed.
  attempt.создана = Date.now() // cyrillic-ok: pre-existing field name
  return {
    handle,
    phone: attempt.phone,
    viaApp: sent.delivery === 'app',
    ...sent,
  }
}

/**
 * QR LOGIN, STEP 1: a token to show as a QR code.
 *
 * The second way in, for when the code never comes (tg-qr-login.ts says why).
 * It is an attempt like any other: it belongs to the person who started it,
 * it counts against the same cap, and it is swept after the same ten minutes
 * -- a QR left open on a screen must not keep a half-open MTProto client
 * alive for ever.
 */
export async function startQrLogin(
  telegramId: string,
  createClient: () => Promise<any>,
  randomKey: () => string
): Promise<{ handle: string; url: string; expires: number }> {
  убратьПротухшие() // cyrillic-ok: pre-existing local name
  // cyrillic-ok-next-line: pre-existing local names
  if (попытки.size >= МАКС_ПОПЫТОК) {
    throw new Error(
      'слишком много незаконченных входов — попробуйте через минуту'
    )
  }
  const client = await createClient()
  let qr: QrState
  try {
    qr = await beginQr(client)
  } catch (e) {
    // No token, no attempt: the client must not outlive a start that failed.
    await hangUp(client)
    throw e
  }
  const handle = randomKey()
  // cyrillic-ok-next-line: pre-existing local name
  попытки.set(handle, {
    telegramId: String(telegramId),
    phone: '',
    phoneCodeHash: '',
    client,
    создана: Date.now(), // cyrillic-ok: pre-existing field name
    qr,
  })
  return { handle, url: loginUrl(qr.token), expires: qr.expires }
}

/**
 * QR LOGIN, STEP 2: what the screen's poll is told.
 *
 * `waiting` carries the token to draw (it changes about every thirty seconds),
 * `password` hands over to the existing two-factor step with the same handle,
 * and `done` returns the session for the route to store -- never to the
 * client -- together with WHICH account scanned. The screen shows that name:
 * with a QR code nobody typed a number, so "connected" alone would not say
 * whether the right account of two was the one holding the camera.
 *
 * The client is hung up once the session is saved out of it. The session
 * string is all that is needed from here on, and a connected GramJS client
 * left behind pings Telegram for the life of the process (hang-up.ts).
 */
export async function pollQrLogin(
  telegramId: string,
  handle: string,
  now: number = Date.now()
): Promise<
  | { state: 'waiting'; url: string; expires: number }
  | { state: 'password' }
  | { state: 'done'; session: string; account: QrAccount }
> {
  убратьПротухшие() // cyrillic-ok: pre-existing local name
  const attempt = попытки.get(handle) // cyrillic-ok: pre-existing local name
  if (!attempt || !attempt.qr) {
    throw new Error('вход не начат или истёк — начните заново')
  }
  if (attempt.telegramId !== String(telegramId)) {
    throw new Error('этот вход начат другим человеком')
  }
  const step = await advanceQr(attempt.client, attempt.qr, now)
  if (step.state !== 'done') return step
  const session = String(attempt.client.session.save())
  попытки.delete(handle) // cyrillic-ok: pre-existing local name
  await hangUp(attempt.client)
  return { state: 'done', session, account: step.account }
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
  // A QR attempt has no hash: signing in with an empty one would only earn a
  // protocol error for somebody who did nothing wrong.
  // cyrillic-ok-next-line: pre-existing local name
  if (п.qr) throw new Error('этот вход идёт по QR-коду — код вводить не нужно')
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
): Promise<{ сессия: string; phone: string; account?: QrAccount }> {
  убратьПротухшие()
  const п = попытки.get(handle)
  if (!п) throw new Error('вход не начат или истёк — начните заново')
  if (п.telegramId !== String(telegramId)) {
    throw new Error('этот вход начат другим человеком')
  }
  if (!пароль) throw new Error('пароль пустой')
  // cyrillic-ok-next-line: pre-existing local names
  const user = await п.client.signInWithPassword(
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
  /*
   * After a QR scan nobody typed a number, so the attempt has none. The
   * account that just signed in knows its own, and the row in tg_sessions
   * keeps saying whose session it is.
   */
  // cyrillic-ok-next-line: pre-existing local names
  if (п.qr) {
    const account = accountOf(user)
    await hangUp(п.client) // cyrillic-ok: pre-existing local name
    return { сессия, phone: account.phone ?? '', account } // cyrillic-ok
  }
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
  '/api/tg/connect/resend',
  '/api/tg/connect/qr/start',
  '/api/tg/connect/qr/poll',
  '/api/tg/connect/code',
  '/api/tg/connect/password',
  '/api/tg/connect/status',
  '/api/tg/connect',
] as const

export function этоПутьПодключения(путь: string): boolean {
  return (ПУТИ_ПОДКЛЮЧЕНИЯ as readonly string[]).includes(путь)
}

/**
 * What the screen may say about the account that scanned: its name and how
 * the number ends. The full number stays on the server -- the person knows
 * their own, and a screen (or a screenshot of it) has no use for the rest.
 */
function publicAccount(a: QrAccount): {
  username?: string
  firstName?: string
  phoneEnding?: string
} {
  return {
    ...(a.username ? { username: a.username } : {}),
    ...(a.firstName ? { firstName: a.firstName } : {}),
    ...(a.phone ? { phoneEnding: a.phone.slice(-4) } : {}),
  }
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
        тело: { ok: true, ...r }, // cyrillic-ok: pre-existing response shape
      }
    }

    // cyrillic-ok-next-line: pre-existing local name
    if (путь === '/api/tg/connect/resend') {
      // cyrillic-ok-next-line: pre-existing local names
      const r = await resendCode(кто, String(тело.handle ?? ''))
      return {
        код: 200, // cyrillic-ok: pre-existing response shape
        тело: { ok: true, ...r }, // cyrillic-ok: pre-existing response shape
      }
    }

    // cyrillic-ok-next-line: pre-existing local name
    if (путь === '/api/tg/connect/qr/start') {
      const r = await startQrLogin(
        кто, // cyrillic-ok: pre-existing local name
        зав.создатьКлиент, // cyrillic-ok: pre-existing dependency name
        зав.случайныйКлюч // cyrillic-ok: pre-existing dependency name
      )
      return {
        код: 200, // cyrillic-ok: pre-existing response shape
        тело: { ok: true, ...r }, // cyrillic-ok: pre-existing response shape
      }
    }

    // cyrillic-ok-next-line: pre-existing local name
    if (путь === '/api/tg/connect/qr/poll') {
      // cyrillic-ok-next-line: pre-existing local names
      const r = await pollQrLogin(кто, String(тело.handle ?? ''))
      if (r.state === 'waiting') {
        return {
          код: 200, // cyrillic-ok: pre-existing response shape
          // cyrillic-ok-next-line: pre-existing response shape
          тело: { ok: true, state: r.state, url: r.url, expires: r.expires },
        }
      }
      if (r.state === 'password') {
        // The same words the code step uses, so the screen needs one rule for
        // "now ask for the password", whichever way the person came in.
        // cyrillic-ok-next-line: pre-existing response shape
        return { код: 200, тело: { ok: true, нужен_пароль: true } }
      }
      // cyrillic-ok-next-line: pre-existing local names
      await сохранитьСессию(pool, кто, r.session, r.account.phone)
      void ingestAfterConnect(pool, кто) // cyrillic-ok: pre-existing local name
      // The session string stays here, as in the code step; the screen gets
      // only the name of the account that scanned.
      return {
        код: 200, // cyrillic-ok: pre-existing response shape
        // cyrillic-ok-next-line: pre-existing response shape
        тело: { ok: true, подключено: true, account: publicAccount(r.account) },
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
      // The memory starts now: every dialog into Postgres and Zep, in the
      // background. The route does not wait for a walk over dozens of chats.
      void ingestAfterConnect(pool, кто) // cyrillic-ok: pre-existing local name
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
      await сохранитьСессию(pool, кто, r.сессия, r.phone || undefined)
      void ingestAfterConnect(pool, кто) // cyrillic-ok: pre-existing local name
      return {
        код: 200, // cyrillic-ok: pre-existing response shape
        тело: {
          ok: true,
          подключено: true, // cyrillic-ok: pre-existing response shape
          ...(r.account ? { account: publicAccount(r.account) } : {}),
        }, // cyrillic-ok: pre-existing response shape
      }
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
