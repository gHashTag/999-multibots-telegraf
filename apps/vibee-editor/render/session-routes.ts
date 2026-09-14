/**
 * Auth routes for the native client.
 *
 * Three endpoints, and deliberately not four: exchange, refresh, logout. There
 * is no "register" — identity comes from Telegram, and a person who has a
 * Telegram account already exists to us.
 *
 * WHY THE EXCHANGE TAKES initData RATHER THAN AN OIDC CODE, FOR NOW.
 *
 * The full OIDC flow needs the app to open a Telegram authorization page and
 * our server to swap the resulting code as a confidential client. That is
 * worth building and is designed in #820. But it is also several days of work
 * on both sides, and until it exists the native app has no way in at all —
 * it is stuck holding an agent key typed in by hand.
 *
 * initData is a signature we ALREADY verify, on every mini-app request, with
 * an implementation that has tests. Accepting it here means: open the mini-app
 * once inside Telegram, and the session it hands back works in the native app
 * for sixty days. No new trust, no new crypto, no key typed by a person.
 *
 * The OIDC path lands beside this one later; both mint the same session, so
 * nothing downstream changes when it does.
 */

import { notifySignIn, safeDeviceName } from './src/auth/notify-sign-in'
import { sendToTelegram } from './src/auth/telegram-sender'
import { record } from './src/hive/journal'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { пуститьВход } from './src/entry-throttle'
import crypto from 'node:crypto'
import {
  verifyTelegramInitData,
  verifyTelegramLoginWidget,
  type VerifiedTelegramWidgetUser,
} from './auth'
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  verifyAppSession,
  digest,
  revokeNow,
  SESSION_TUNING,
  SessionError,
} from './session'
import {
  ensureAuthTables,
  refreshStore,
  revokeAllFamiliesOf,
  issuePairingCode,
  claimPairingCode,
  PAIRING,
} from './session-store'

/**
 * Digits from `randomInt`, not from `Math.random`. How many — PAIRING.DIGITS.
 *
 * `Math.random` is seeded predictably enough that a stream of its output can
 * be extrapolated; that is fine for shuffling a playlist and disqualifying for
 * anything someone would want to guess. `randomInt` draws from the same source
 * as key material and has no modulo bias.
 */
function mintPairingCode(): string {
  /*
   * ДИАПАЗОН ВЫВОДИТСЯ ИЗ ДЛИНЫ, А НЕ ЗАДАН ОТДЕЛЬНО.
   *
   * Здесь стояло `randomInt(0, 1_000_000)` с добавлением нулей до
   * `PAIRING.DIGITS`. Пока цифр было шесть, всё сходилось. Стоило поднять
   * длину до восьми ради стойкости — и генератор молча продолжил бы выдавать
   * миллион значений, дополняя их нулями: восемь цифр на экране, энтропия
   * прежняя. Косметика вместо защиты, и заметить это можно было бы только
   * посчитав.
   *
   * Теперь верхняя граница — производная от длины: разойтись они не могут.
   */
  const верх = 10 ** PAIRING.DIGITS
  return String(crypto.randomInt(0, верх)).padStart(PAIRING.DIGITS, '0')
}

/**
 * Both ways in produce the SAME session — one function, called twice.
 *
 * Written as a helper rather than copied because the two paths differ only in
 * how identity was proved, and everything after that must not drift. A second
 * copy is where the refresh row quietly stops being written, and the symptom
 * lands weeks later as "the app logs itself out".
 */
async function mintSession(
  pool: Pick<PoolClient, 'query'>,
  telegramId: string,
  body: Record<string, unknown>,
  /**
   * Отпечаток подписанной строки, по которой входят.
   *
   * Передаётся только для initData: она живёт сутки и предъявляется столько
   * раз, сколько захочет предъявляющий. Без этого КАЖДОЕ предъявление заводило
   * новую независимую семью на шестьдесят дней — суточный пропуск превращался
   * в двухмесячный, во множестве несвязанных копий.
   *
   * Для кода спаривания и подписи виджета отпечаток не нужен: первый
   * одноразовый по своей записи, вторая — по первичному ключу
   * `app_widget_assertions`.
   */
  отпечатокЗапуска?: string
): Promise<Record<string, unknown>> {
  let sessionId: string = crypto.randomUUID()
  let familyId: string = crypto.randomUUID()
  const dkt = deviceThumbprint(body)
  const refresh = issueRefreshToken()

  /*
   * ПОВТОР ПО ТОЙ ЖЕ СТРОКЕ — ТА ЖЕ СЕМЬЯ, А НЕ ВТОРАЯ РЯДОМ.
   *
   * Запрет повтора здесь был бы ошибкой того же рода, что гашение семьи за
   * гонку вкладок: initData выдаётся на ЗАПУСК, а входов внутри запуска может
   * быть больше одного — повтор после обрыва сети, второе окно. Поэтому не
   * «нельзя дважды», а «дважды — то же самое».
   *
   * Живой сессии может уже не быть (человек вышел, семью погасили). Тогда
   * заводим новую и переписываем отображение: иначе повторный вход по ещё
   * действующей initData возвращал бы токены к погашенной семье, то есть
   * мёртвые.
   */
  if (отпечатокЗапуска) {
    const было = await pool.query(
      `SELECT f.family_id, f.session_id
         FROM app_launch_families f
         JOIN app_sessions s ON s.id = f.session_id
        WHERE f.assertion_hash = $1 AND s.revoked_at IS NULL
        LIMIT 1`,
      [отпечатокЗапуска]
    )
    if (было.rows.length) {
      familyId = String(было.rows[0].family_id)
      sessionId = String(было.rows[0].session_id)
      await pool.query(
        `INSERT INTO app_refresh_tokens (token_hash, family_id, session_id, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [refresh.hash, familyId, sessionId, refresh.expiresAt.toISOString()]
      )
      return {
        access_token: signAccessToken({
          telegramId,
          sessionId,
          deviceKeyThumbprint: dkt,
        }),
        refresh_token: refresh.token,
        expires_in: SESSION_TUNING.ACCESS_TTL_SECONDS,
        telegram_id: telegramId,
      }
    }
  }

  await pool.query(
    `INSERT INTO app_sessions (id, telegram_id, device_pubkey, device_name, family_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, telegramId, dkt, String(body.device_name ?? ''), familyId]
  )
  await pool.query(
    `INSERT INTO app_refresh_tokens (token_hash, family_id, session_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [refresh.hash, familyId, sessionId, refresh.expiresAt.toISOString()]
  )
  if (отпечатокЗапуска) {
    await pool.query(
      `INSERT INTO app_launch_families (assertion_hash, telegram_id, family_id, session_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (assertion_hash) DO UPDATE
         SET family_id = EXCLUDED.family_id,
             session_id = EXCLUDED.session_id,
             telegram_id = EXCLUDED.telegram_id,
             created_at = now()`,
      [отпечатокЗапуска, telegramId, familyId, sessionId]
    )
  }

  return {
    access_token: signAccessToken({
      telegramId,
      sessionId,
      deviceKeyThumbprint: dkt,
    }),
    refresh_token: refresh.token,
    expires_in: SESSION_TUNING.ACCESS_TTL_SECONDS,
    telegram_id: telegramId,
  }
}

class StaleWidgetProfileAssertion extends Error {}
class ReplayedWidgetAssertion extends Error {}

/** Persist only identity attributes covered by Telegram's widget HMAC. */
async function syncVerifiedWidgetProfileWithClient(
  client: PoolClient,
  user: VerifiedTelegramWidgetUser
): Promise<void> {
  const telegramId = String(user.id)
  const username =
    user.username && /^[A-Za-z0-9_]{5,32}$/.test(user.username)
      ? user.username
      : null
  const displayName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(' ')
    .slice(0, 256)
  const photoUrl = user.photo_url?.slice(0, 512) || null
  await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id serial PRIMARY KEY,
        telegram_id text,
        username text,
        display_name text,
        bio text DEFAULT '',
        avatar_url text,
        cover_url text,
        social_links jsonb DEFAULT '[]',
        is_public boolean DEFAULT TRUE,
        is_verified boolean DEFAULT FALSE,
        telegram_auth_date bigint NOT NULL DEFAULT 0,
        created_at timestamptz DEFAULT now()
      )`)
  await client.query(
    `ALTER TABLE profiles
         ADD COLUMN IF NOT EXISTS telegram_auth_date bigint NOT NULL DEFAULT 0`
  )
  // Legacy data can contain duplicate rows for the same Telegram owner.
  // Repairing those inside this transaction makes the idempotent index safe
  // and prevents one old duplicate from breaking every future browser login.
  await client.query(
    `DELETE FROM profiles p USING profiles q
        WHERE p.telegram_id = q.telegram_id AND p.id < q.id`
  )
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS profiles_tg_uniq ON profiles (telegram_id)`
  )

  // Make legacy username ownership deterministic before installing the
  // invariant. The most recently authenticated row wins; id is only a
  // stable tie-breaker for rows that predate telegram_auth_date.
  await client.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY LOWER(username)
                 ORDER BY telegram_auth_date DESC, id DESC
               ) AS position
          FROM profiles
         WHERE username IS NOT NULL AND username <> ''
      )
      UPDATE profiles p
         SET username = NULL
        FROM ranked r
       WHERE p.id = r.id AND r.position > 1`)
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_uniq
         ON profiles (LOWER(username))
      WHERE username IS NOT NULL AND username <> ''`
  )

  // Serialize both one owner's replays and claims for one normalized
  // username. A unique index prevents duplicate committed state; these
  // locks additionally let us compare auth_date before changing ownership.
  // The order is fixed for every caller to avoid lock-order inversions.
  if (username) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('username:' || LOWER($1)))`,
      [username]
    )
  }
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('telegram:' || $1))`,
    [telegramId]
  )

  const existing = await client.query(
    `SELECT telegram_id, username, telegram_auth_date
         FROM profiles
        WHERE telegram_id = $1
           OR ($2::text IS NOT NULL AND LOWER(username) = LOWER($2))
        FOR UPDATE`,
    [telegramId, username]
  )
  const own = existing.rows.find(row => String(row.telegram_id) === telegramId)
  const conflict = existing.rows.find(
    row => String(row.telegram_id) !== telegramId
  )
  const incomingAuthDate = user.auth_date
  if (
    Number(own?.telegram_auth_date || 0) > incomingAuthDate ||
    Number(conflict?.telegram_auth_date || 0) >= incomingAuthDate
  ) {
    throw new StaleWidgetProfileAssertion('stale Telegram profile assertion')
  }

  if (username) {
    // A Telegram username has one current owner. A freshly HMAC-verified
    // payload wins over stale local rows. All displacement and installation
    // happens in the same transaction, so a failure cannot leave it ownerless.
    await client.query(
      `UPDATE profiles SET username = NULL
          WHERE LOWER(username) = LOWER($1) AND telegram_id <> $2`,
      [username, telegramId]
    )
    await client.query(
      `UPDATE users SET username = NULL
          WHERE LOWER(username) = LOWER($1) AND telegram_id::text <> $2`,
      [username, telegramId]
    )
  }

  const updated = await client.query(
    `UPDATE users SET username = $2, first_name = $3
        WHERE telegram_id::text = $1 RETURNING id`,
    [telegramId, username, displayName]
  )
  if (!updated.rows.length) {
    await client.query(
      `INSERT INTO users (telegram_id, username, first_name)
         VALUES ($1, $2, $3)`,
      [telegramId, username, displayName]
    )
  }

  const saved = await client.query(
    `INSERT INTO profiles (
         telegram_id, username, display_name, avatar_url, telegram_auth_date
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (telegram_id)
       DO UPDATE SET username = EXCLUDED.username,
                     display_name = EXCLUDED.display_name,
                     avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
                     telegram_auth_date = EXCLUDED.telegram_auth_date
             WHERE profiles.telegram_auth_date <= EXCLUDED.telegram_auth_date
       RETURNING telegram_id`,
    [telegramId, username, displayName, photoUrl, incomingAuthDate]
  )
  if (!saved.rows.length)
    throw new StaleWidgetProfileAssertion('stale Telegram profile assertion')
}

export async function syncVerifiedWidgetProfile(
  pool: Pool,
  user: VerifiedTelegramWidgetUser
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await syncVerifiedWidgetProfileWithClient(client, user)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function mintWidgetSession(
  pool: Pool,
  user: VerifiedTelegramWidgetUser,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const assertion = String(body.hash || '')
  const assertionHash = digest(`telegram-widget:${assertion}`)
  const telegramId = String(user.id)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const consumed = await client.query(
      `INSERT INTO app_widget_assertions (assertion_hash, telegram_id)
       VALUES ($1, $2)
       ON CONFLICT (assertion_hash) DO NOTHING
       RETURNING assertion_hash`,
      [assertionHash, telegramId]
    )
    if (!consumed.rows.length) throw new ReplayedWidgetAssertion()
    await syncVerifiedWidgetProfileWithClient(client, user)
    const session = await mintSession(client, telegramId, body)
    await client.query('COMMIT')
    return session
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Keep every auth failure inside the HTTP boundary.
 *
 * Node's HTTP server ignores the Promise returned by an async request
 * callback. Without this wrapper a database error after the initial pool
 * check becomes an unhandled rejection and can terminate the whole process.
 * The response is deliberately constant and never serializes the exception.
 */
export async function handleAuthRouteSafely(
  req: IncomingMessage,
  res: ServerResponse,
  getPool: () => Pool
): Promise<boolean> {
  try {
    return await handleAuthRoute(req, res, getPool)
  } catch {
    console.error('[auth] request failed')
    if (res.headersSent) {
      res.destroy()
      return true
    }
    json(res, 503, { error: 'authentication service unavailable' })
    return true
  }
}

/**
 * telegram_id из УЖЕ ПРОВЕРЕННОЙ строки initData.
 *
 * `verifiedTelegramId` в auth.ts берёт строку из запроса; здесь она приходит
 * телом, поэтому разбор тот же, а источник другой. Дублирование намеренно
 * маленькое и держится рядом с местом использования: вынести его в auth.ts
 * значило бы дать соседям функцию, читающую тело чужого запроса.
 */
function verifiedTelegramIdFrom(initData: string): string | null {
  if (!verifyTelegramInitData(initData).ok) return null
  try {
    const raw = new URLSearchParams(initData).get('user')
    if (!raw) return null
    const id = JSON.parse(raw)?.id
    return id != null ? String(id) : null
  } catch {
    return null
  }
}

/**
 * Which bot's token verified an initData, as a journal note: `bot <id>`.
 *
 * WHY IT IS RECORDED. Both initData doors below accept a signature from ANY
 * token in auth.ts botTokens() and, until this note, left no trace of which
 * one. Narrowing that set to the bots that really launch the app must be done
 * from evidence, not from memory: a restriction written blind locks out
 * whoever signs in through the bot nobody remembered. Nothing about which
 * tokens are accepted changes here.
 *
 * WHY DIGITS ONLY. The id is the part of a token before the colon -- the bot's
 * own public user id. Everything after the colon is the secret.
 * `verifyTelegramInitData` returns `token.split(':')[0]`, and for a token
 * pasted without its colon that is the WHOLE secret. So only a plain run of
 * digits is written; anything else becomes `bot unknown`.
 */
function signedByBot(botId: string | undefined): string {
  return /^\d{1,20}$/.test(botId ?? '') ? `bot ${botId}` : 'bot unknown'
}

type PoolClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
  release: () => void
}

type Pool = {
  query: PoolClient['query']
  connect: () => Promise<PoolClient>
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    // A body this small cannot be legitimate here, and an unbounded read is
    // how a single request becomes a memory problem.
    if (size > 64 * 1024) throw new Error('body too large')
    parts.push(chunk as Buffer)
  }
  return Buffer.concat(parts).toString('utf8')
}

/** Extracts the device key fingerprint a client claims. Optional by design. */
function deviceThumbprint(body: Record<string, unknown>): string {
  const raw = String(body.device_pubkey ?? '')
  // No key is not an error yet: binding a session to a Secure Enclave key is
  // the next step, and refusing clients that predate it would break them for
  // a protection they cannot yet offer. The column is there; it fills in.
  return raw ? digest(raw) : ''
}

/**
 * Handle an auth route. Returns false if the URL is not ours, so the caller's
 * if-cascade can go on looking — the same shape every other route here uses.
 */
export async function handleAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
  getPool: () => Pool
): Promise<boolean> {
  const path = req.url?.split('?')[0] ?? ''
  if (!path.startsWith('/api/auth/')) return false

  // getPool() throws SYNCHRONOUSLY. Outside a try it escapes an async handler
  // and Node kills the process — a one-request denial of service, already
  // paid for once in this file's history.
  let pool: Pool
  try {
    pool = getPool()
    await ensureAuthTables(pool)
  } catch (e) {
    console.error('[auth] database unavailable')
    json(res, 503, {
      error: 'база недоступна',
    })
    return true
  }

  // ─── Exchange: a verified Telegram signature becomes a session ─────────
  if (path === '/api/auth/telegram' && req.method === 'POST') {
    /*
     * ТОРМОЗ: дверь неаутентифицированная и подпись сверяется с КАЖДЫМ токеном ботов платформы — до четырнадцати HMAC на попытку.
     *
     * Подпись защищает от подделки, но не от потока: без ограничения любой
     * может заставить сервис считать и ходить в базу столько, сколько
     * пропустит сеть. Тот же тормоз, что на подборе кода.
     */
    {
      const пуск = пуститьВход(req)
      if (!пуск.можно) {
        res.setHeader('Retry-After', String(пуск.ждатьСекунд))
        json(res, 429, {
          error: 'слишком часто — подождите и попробуйте снова',
          ждать_секунд: пуск.ждатьСекунд,
        })
        return true
      }
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch {
      json(res, 400, { error: 'тело запроса не разобрано как JSON' })
      return true
    }

    const initData = String(body.init_data ?? '')
    const v = verifyTelegramInitData(initData)
    /**
     * Личность достаётся ОТДЕЛЬНО от проверки подписи.
     *
     * `verifyTelegramInitData` отвечает только «сошлось или нет» — она не
     * возвращает telegram_id вовсе. Разбирает строку `verifiedTelegramId`,
     * и она же проверяет подпись повторно, поэтому здесь нужны обе: первая
     * даёт ПРИЧИНУ отказа для ответа человеку, вторая — сам идентификатор.
     *
     * Первая версия этого файла звала `v.telegramId` — поля, которого нет.
     * Ошибка не всплыла, потому что файл не входил в программу tsc: он не
     * импортирован ниоткуда, и проверка типов его просто не видела. Ноль
     * ошибок означал «не проверено», а не «верно».
     */
    const telegramId = verifiedTelegramIdFrom(initData)
    if (!v.ok || !telegramId) {
      json(res, 401, {
        error: 'подпись Telegram не принята',
        detail: v.reason ?? 'в подписанной строке нет поля user.id',
        hint: 'откройте мини-апп внутри Telegram и повторите — подпись выдаёт он',
      })
      return true
    }

    /*
     * THE MOST COMMON SIGN-IN WAS THE LEAST VISIBLE ONE.
     *
     * Measured 2026-09-07: this route -- the ordinary Mini App sign-in -- wrote
     * NOTHING on success, while pair/start and pair/claim both log. So the logs
     * showed the rare code sign-ins and hid the main path. "Quiet" meant both
     * "all is well" and "nobody came".
     */
    void record(pool, {
      kind: 'sign-in',
      who: telegramId,
      what: `${safeDeviceName(body.device_name)}; ${signedByBot(v.botId)}`,
    })

    json(
      res,
      200,
      await mintSession(
        pool,
        telegramId,
        body,
        digest(`telegram-initdata:${initData}`)
      )
    )
    return true
  }

  // ─── Browser login: verified Login Widget payload becomes a session ───
  if (path === '/api/auth/widget' && req.method === 'POST') {
    /*
     * ТОРМОЗ: дверь неаутентифицированная и проверка подписи считает SHA256+HMAC на каждую попытку.
     *
     * Подпись защищает от подделки, но не от потока: без ограничения любой
     * может заставить сервис считать и ходить в базу столько, сколько
     * пропустит сеть. Тот же тормоз, что на подборе кода.
     */
    {
      const пуск = пуститьВход(req)
      if (!пуск.можно) {
        res.setHeader('Retry-After', String(пуск.ждатьСекунд))
        json(res, 429, {
          error: 'слишком часто — подождите и попробуйте снова',
          ждать_секунд: пуск.ждатьСекунд,
        })
        return true
      }
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch {
      json(res, 400, { error: 'тело запроса не разобрано как JSON' })
      return true
    }
    const verified = verifyTelegramLoginWidget(body)
    if (!verified.ok) {
      json(res, 401, {
        error: 'подпись Telegram Login Widget не принята',
        detail: verified.reason,
      })
      return true
    }
    try {
      const session = await mintWidgetSession(pool, verified.user, body)
      json(res, 200, { ...session, telegram_user: verified.user })
    } catch (error) {
      if (
        error instanceof StaleWidgetProfileAssertion ||
        error instanceof ReplayedWidgetAssertion
      ) {
        json(res, 409, { error: 'Telegram assertion already used or stale' })
        return true
      }
      throw error
    }
    return true
  }

  // ─── Pairing: start (needs a Telegram signature) ───────────────────────
  if (path === '/api/auth/pair/start' && req.method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch {
      json(res, 400, { error: 'тело запроса не разобрано как JSON' })
      return true
    }

    /**
     * Подпись берём из ЗАГОЛОВКА, а тело — запасной путь.
     *
     * Весь мини-апп ходит через `apiFetch`, который ставит
     * `X-Telegram-Init-Data` сам, на каждый запрос. Требовать здесь ещё и поле
     * в теле значило бы завести для одного маршрута особый способ
     * представиться — а особый способ ровно один раз забудут применить.
     *
     * Тело оставлено для тех, кто зовёт маршрут напрямую (curl, тесты): это
     * не вторая дверь, а та же самая строка, просто в другом кармане. Проверка
     * подписи одна и та же в обоих случаях.
     */
    const initData =
      (req.headers['x-telegram-init-data'] as string | undefined) ||
      String(body.init_data ?? '')
    const v = verifyTelegramInitData(initData)
    const telegramId = verifiedTelegramIdFrom(initData)
    if (!v.ok || !telegramId) {
      /**
       * THE LOG RECORDS THE OUTCOME, NOT THE ARRIVAL OF A REQUEST.
       *
       * Until this line the server printed only `📥 POST /api/auth/pair/start`
       * -- "a request arrived". Issued and refused are indistinguishable in
       * that line, and on 2026-09-03 it cost a whole investigation: someone
       * reported that the code did not work, the logs showed one start and
       * three claims, and `app_pairing_codes` held NOT ONE new row. The answer
       * ("start is refusing, so there is nothing to type") had to be dug out
       * of the database instead of read from the log.
       *
       * The reason is printed verbatim: "empty initData" and "no bot tokens
       * configured" are two completely different repairs, and the person
       * holding the phone needs to know which one.
       *
       * `initData` itself is NEVER printed: it carries the signature that
       * would let someone present themselves as that person.
       */
      console.warn(
        `🔑 [pair] start ОТКАЗ: ${v.reason ?? 'в подписанной строке нет user.id'}`
      )
      json(res, 401, {
        error: 'подпись Telegram не принята',
        detail: v.reason ?? 'в подписанной строке нет поля user.id',
        hint: 'код выдаётся только внутри Telegram — там есть подпись',
      })
      return true
    }

    const { code, expiresAt } = await issuePairingCode(
      pool,
      telegramId,
      mintPairingCode
    )
    // The code is NOT logged -- it is a live credential for 120 seconds. Who
    // it was issued to and for how long is enough to tie an issue to the
    // claim that follows from the same telegram_id.
    console.log(
      `🔑 [pair] start ВЫДАН telegram_id=${telegramId}, живёт ${PAIRING.TTL_SECONDS}с`
    )
    // The code mints a session on claim, so this door is an initData sign-in
    // too: same note as /api/auth/telegram, and never the code itself.
    void record(pool, {
      kind: 'code-issued',
      who: telegramId,
      what: signedByBot(v.botId),
    })
    json(res, 200, {
      code,
      expires_in: PAIRING.TTL_SECONDS,
      expires_at: expiresAt.toISOString(),
    })
    return true
  }

  // ─── Pairing: claim (the native app, holding no signature at all) ──────
  if (path === '/api/auth/pair/claim' && req.method === 'POST') {
    /*
     * ТОРМОЗ ДО РАЗБОРА ТЕЛА.
     *
     * Дверь не требует личности и не может её требовать: у входящего ещё
     * ничего нет. Единственное, чем можно ограничить перебор
     * кода, — частота обращений с источника.
     *
     * Стоит ПЕРВЫМ: считать попытку после разбора тела значит позволить
     * заваливать сервис телами, которые всё равно будут отвергнуты.
     */
    const пуск = пуститьВход(req)
    if (!пуск.можно) {
      res.setHeader('Retry-After', String(пуск.ждатьСекунд))
      json(res, 429, {
        error: 'слишком часто — подождите и попробуйте снова',
        ждать_секунд: пуск.ждатьСекунд,
      })
      return true
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch {
      json(res, 400, { error: 'тело запроса не разобрано как JSON' })
      return true
    }

    // Strip what a person types: spaces, and the dash they add themselves
    // when the screen shows the code grouped as 123-456.
    const code = String(body.code ?? '').replace(/[\s-]/g, '')
    /*
     * Длина проверяется ПО PAIRING.DIGITS, а не числом в регулярке. Иначе
     * при смене длины кода дверь молча перестала бы принимать собственные
     * коды — а сообщение продолжало бы называть прежнее число.
     */
    if (!new RegExp(`^\\d{${PAIRING.DIGITS}}$`).test(code)) {
      json(res, 400, {
        error: `код должен быть из ${PAIRING.DIGITS} цифр`,
      })
      return true
    }

    const outcome = await claimPairingCode(pool, code)
    if (!outcome.ok) {
      /**
       * Одно и то же 400 на «нет такого» и «истёк» было бы честнее по объёму
       * выдаваемого, но человек, набравший код на десять секунд позже, должен
       * узнать ИМЕННО это — иначе он будет перенабирать верный код. Разница в
       * утечке нулевая: у того, кто угадывает, всё равно нет живого кода.
       */
      const detail = {
        unknown: 'код не найден — проверьте цифры и запросите новый',
        expired: 'код уже использован или истёк — запросите новый',
        exhausted: 'слишком много попыток — запросите новый код',
      }[outcome.reason]
      /*
       * The refusal reason goes to the log because its three values mean three
       * different faults that look identical from outside:
       *   unknown   -- no such code in the database. Most often this means
       *                start refused and there was nothing to issue (see the
       *                start line above).
       *   expired   -- the code existed but the 120 seconds ran out: the
       *                person did not switch apps in time.
       *   exhausted -- guessing.
       * The digits are never printed in any form.
       */
      console.warn(`🔑 [pair] claim ОТКАЗ: ${outcome.reason} — ${detail}`)
      /*
       * Into the journal as an ALARM and with NO SUBJECT.
       *
       * No subject is not forgetfulness: on refusal `claimPairingCode` returns
       * only a reason, and whose code it was is unknown here. So the event
       * belongs to nobody, and a nobody event is visible to the hive keeper
       * alone -- there is nothing to show a bot owner in "somebody was guessing
       * a code", and no reason to.
       *
       * An alarm, because `exhausted` means brute force. In the log that sank:
       * one line among thousands, and nobody goes looking for it.
       */
      void record(pool, {
        kind: 'code-refused',
        what: outcome.reason,
        severity: outcome.reason === 'exhausted' ? 'alarm' : 'attention',
      })
      json(res, 401, {
        error: 'pairing_failed',
        reason: outcome.reason,
        detail,
      })
      return true
    }

    // Success is logged too: without it the log shows only refusals, and
    // "quiet" would mean both "all is well" and "nobody tried".
    console.log(
      `🔑 [pair] claim ПРИНЯТ telegram_id=${outcome.telegramId}, ` +
        `устройство=${String(body.device_name ?? 'без имени').slice(0, 40)}`
    )
    const сессия = await mintSession(pool, outcome.telegramId, body)

    /*
     * СООБЩАЕМ В TELEGRAM — И НЕ ЖДЁМ ОТПРАВКИ.
     *
     * Владелец 07.09.2026: «только в боте не видно, что я зашёл с другого
     * устройства». Он прав, и это не косметика: код виден на экране две
     * минуты, он одноразовый, и кто набрал первым — тот и вошёл. До сих пор
     * единственным следом чужого входа было ОТСУТСТВИЕ следов: настоящий
     * владелец видел «код не подошёл» и думал, что опечатался.
     *
     * `void` намеренный. Вход уже состоялся: сессия выдана, код погашен.
     * Недоступный Telegram, протухший токен бота, заблокированный бот — всё
     * это должно кончаться потерянным уведомлением и НИЧЕМ больше. Ждать
     * отправку значит поставить успех входа в зависимость от чужой сети.
     */
    void notifySignIn(sendToTelegram, {
      telegramId: outcome.telegramId,
      device: body.device_name,
      when: new Date(),
    })

    /*
     * Into the journal too -- for the same reason as the notification, but for
     * a different reader. The notification tells a PERSON "somebody signed in
     * to your account"; the event lets the KEEPER see the shape: three code
     * sign-ins within an hour across three different people is no longer a
     * coincidence.
     *
     * `void` for the same reason: the sign-in already happened and the session
     * was issued. A failed journal write must not undo it.
     */
    void record(pool, {
      kind: 'code-claimed',
      who: outcome.telegramId,
      what: safeDeviceName(body.device_name),
      severity: 'attention',
    })

    json(res, 200, сессия)
    return true
  }

  // ─── Refresh ───────────────────────────────────────────────────────────
  if (path === '/api/auth/refresh' && req.method === 'POST') {
    /*
     * ТОРМОЗ: дверь неаутентифицированная и обмен ходит в базу на КАЖДУЮ попытку — незнакомый токен стоит запроса.
     *
     * Подпись защищает от подделки, но не от потока: без ограничения любой
     * может заставить сервис считать и ходить в базу столько, сколько
     * пропустит сеть. Тот же тормоз, что на подборе кода.
     */
    {
      const пуск = пуститьВход(req)
      if (!пуск.можно) {
        res.setHeader('Retry-After', String(пуск.ждатьСекунд))
        json(res, 429, {
          error: 'слишком часто — подождите и попробуйте снова',
          ждать_секунд: пуск.ждатьСекунд,
        })
        return true
      }
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch {
      json(res, 400, { error: 'тело запроса не разобрано как JSON' })
      return true
    }

    const presented = String(body.refresh_token ?? '')
    if (!presented) {
      json(res, 400, { error: 'нужен refresh_token' })
      return true
    }

    const outcome = await rotateRefreshToken(presented, refreshStore(pool))

    if (!outcome.ok) {
      /*
       * ГОНКА — НЕ КРАЖА, И ОТВЕТ ДОЛЖЕН ЭТО РАЗЛИЧАТЬ.
       *
       * Две вкладки обновляются в одну миллисекунду; проигравшему нужно не
       * «всё отозвано», а «перечитай хранилище»: победитель уже положил туда
       * новый токен. Отдельный код нужен именно клиенту — по общему
       * `auth_refresh_failed` он вычистил бы сессию и отправил человека за
       * восьмизначным кодом на ровном месте.
       *
       * 409, а не 401: конфликт одновременных запросов, а не «вас не пускают».
       */
      if (outcome.reason === 'raced') {
        json(res, 409, {
          error: 'auth_refresh_raced',
          detail:
            'этот токен обновляют прямо сейчас — перечитайте хранилище и повторите',
        })
        return true
      }
      /**
       * `reused` gets its own code, and the client must treat it as final.
       *
       * Every other reason means "log in again". Reuse means someone else may
       * be holding this token: the family is already revoked by the time we
       * answer, and a client that retried would only churn. The code exists
       * so the app can wipe its Keychain instead of looping.
       */
      const code =
        outcome.reason === 'reused'
          ? 'auth_reuse_detected'
          : 'auth_refresh_failed'
      json(res, 401, {
        error: code,
        detail:
          outcome.reason === 'reused'
            ? 'этот токен уже использован — все сессии этого устройства отозваны'
            : `refresh отклонён: ${outcome.reason}`,
      })
      return true
    }

    // The rotation returned a new token; the session it belongs to is the one
    // recorded against the family.
    const row = await pool.query(
      `SELECT s.id, s.telegram_id, s.device_pubkey
         FROM app_refresh_tokens t
         JOIN app_sessions s ON s.id = t.session_id
        WHERE t.token_hash = $1 AND s.revoked_at IS NULL`,
      [outcome.next.hash]
    )
    if (!row.rows.length) {
      json(res, 401, {
        error: 'auth_refresh_failed',
        detail: 'сессия отозвана',
      })
      return true
    }

    const s = row.rows[0]

    /*
     * ЕСЛИ У СЕССИИ ЕСТЬ КЛЮЧ УСТРОЙСТВА — ПРЕДЪЯВИ ЕГО.
     *
     * До этой правки записанный при входе `device_pubkey` не проверялся
     * НИГДЕ: ни при обмене, ни при использовании токена доступа. Колонка
     * заполнялась и не работала, а комментарий в session.ts утверждал, что
     * токен «привязан к одному устройству».
     *
     * Правило намеренно одностороннее: требуем совпадения ТОЛЬКО у сессий, у
     * которых ключ записан. Клиенты, которые его не присылают (сегодня —
     * все), продолжают работать; тот, кто пришлёт, сразу получает настоящую
     * привязку. Именно этого хотел автор `deviceThumbprint`: «колонка есть,
     * она заполнится».
     *
     * Это не криптографическое доказательство владения — предъявленный ключ
     * такой же предъявляемый секрет, как и сам refresh-токен. Но украсть
     * теперь нужно оба, а не один, и это честная разница, которую можно
     * назвать вслух, не выдавая за большее.
     */
    const записанный = String(s.device_pubkey ?? '')
    if (записанный) {
      const предъявленный = deviceThumbprint(body)
      if (предъявленный !== записанный) {
        json(res, 401, {
          error: 'auth_refresh_failed',
          detail:
            'этот refresh-токен выдан другому устройству — войдите заново',
        })
        return true
      }
    }

    await pool.query(
      `UPDATE app_sessions SET last_seen_at = now() WHERE id = $1`,
      [s.id]
    )

    json(res, 200, {
      access_token: signAccessToken({
        telegramId: String(s.telegram_id),
        sessionId: String(s.id),
        deviceKeyThumbprint: String(s.device_pubkey ?? ''),
      }),
      refresh_token: outcome.next.token,
      expires_in: SESSION_TUNING.ACCESS_TTL_SECONDS,
    })
    return true
  }

  // ─── Logout everywhere ─────────────────────────────────────────────────
  /*
   * SIGN OUT EVERYWHERE: every live family of the person, not only this one.
   *
   * Logout below revokes the family that presented the token. After a token
   * theft the thief holds a different family, so recovery needs all of them:
   * Mini App launches, pairing claims, widget sign-ins, other browsers.
   *
   * Only a live app session access token may ask:
   *   - initData alone is refused. It lives 24 hours and can be replayed by
   *     whoever saw it, and a leaked launch string must not be able to sign
   *     the person out of every device.
   *   - agent keys and the service key are refused. The global guard admits
   *     them on this non-public path, so this check is the one that counts.
   *   - an expired or revoked token is refused, and unlike logout there is no
   *     refresh-token fallback: a stolen refresh token alone must not be
   *     enough to sign the owner out everywhere.
   *
   * Not in PUBLIC_EXACT on purpose; auth-public.test.ts names it as guarded.
   */
  if (path === '/api/auth/logout-all' && req.method === 'POST') {
    const bearer = (req.headers['authorization'] as string | undefined) || ''
    if (!bearer.startsWith('Bearer ')) {
      json(res, 401, {
        error: 'auth_session_required',
        detail: 'sign out everywhere takes only a Bearer access token',
      })
      return true
    }
    let who: { sub: string; sid: string }
    try {
      who = verifyAppSession(bearer.slice(7).trim())
    } catch (e) {
      const code = e instanceof SessionError ? e.code : 'malformed'
      json(res, 401, {
        error: 'auth_session_required',
        detail: `session rejected: ${code}`,
      })
      return true
    }

    const revoked = await revokeAllFamiliesOf(pool, who.sub)
    // Immediately in this process; other replicas follow on the poll.
    for (const sid of revoked) revokeNow(sid)
    // The presenting session too, even if its row is gone -- as logout does.
    revokeNow(who.sid)

    void record(pool, {
      kind: 'sign-out',
      who: who.sub,
      what: `everywhere; ${revoked.length} sessions`,
      severity: 'attention',
    })

    json(res, 200, { logged_out: revoked.length })
    return true
  }

  // ─── Logout ────────────────────────────────────────────────────────────
  if (path === '/api/auth/logout' && req.method === 'POST') {
    const bearer = (req.headers['authorization'] as string | undefined) || ''
    let sid: string | null = null
    let familyId: string | null = null
    try {
      if (bearer.startsWith('Bearer ')) {
        sid = verifyAppSession(bearer.slice(7).trim()).sid
      }
    } catch {
      // An expired access token is ordinary. The one-time refresh secret in
      // the body is the proof that lets logout revoke the whole family rather
      // than merely clearing the browser and leaving a 60-day token alive.
    }

    if (!sid) {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse((await readBody(req)) || '{}')
      } catch {
        json(res, 400, { error: 'тело запроса не разобрано как JSON' })
        return true
      }
      const refreshToken = String(body.refresh_token || '')
      if (refreshToken) {
        const found = await pool.query(
          `SELECT family_id, session_id FROM app_refresh_tokens
            WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
            LIMIT 1`,
          [digest(refreshToken)]
        )
        if (found.rows.length) {
          familyId = String(found.rows[0].family_id)
          sid = String(found.rows[0].session_id)
        }
      }
    }

    if (!sid) {
      json(res, 401, { error: 'нужен действующий access или refresh token' })
      return true
    }

    /*
     * ВЫХОД ГАСИТ СЕМЬЮ ВСЕГДА — И ПУТЬ С ЖИВЫМ ТОКЕНОМ ТОЖЕ.
     *
     * Раньше веток было две. Живой access-токен давал `sid` — и гасилась одна
     * сессия. Протухший заставлял читать refresh из тела — и гасилась вся
     * семья. То есть обычный случай (человек нажал «Выйти», не выходя из
     * приложения) шёл по СЛАБОЙ ветке, а сильная работала только у того, у
     * кого токен успел протухнуть.
     *
     * Сегодня разницы нет: вход заводит одну сессию с одной семьёй, а ротация
     * сохраняет и `session_id`, и `family_id`. Но это совпадение, а не
     * договорённость: первая же правка, заводящая вторую сессию в семье,
     * молча оставит после «Выйти» живой шестидесятидневный токен — и ничего
     * не упадёт, потому что упасть тут нечему.
     *
     * Поэтому семья определяется ОДНИМ запросом из `app_sessions`, и дальше
     * путь один. Ветка «по sid» осталась только на случай, когда строки сессии
     * уже нет.
     */
    if (!familyId) {
      const own = await pool.query(
        `SELECT family_id FROM app_sessions WHERE id = $1 LIMIT 1`,
        [sid]
      )
      if (own.rows.length) familyId = String(own.rows[0].family_id)
    }

    if (familyId) {
      await pool.query(
        `UPDATE app_sessions SET revoked_at = now()
          WHERE family_id = $1 AND revoked_at IS NULL`,
        [familyId]
      )
      const familySessions = await pool.query(
        `UPDATE app_refresh_tokens SET revoked_at = now()
          WHERE family_id = $1 AND revoked_at IS NULL
          RETURNING session_id`,
        [familyId]
      )
      for (const row of familySessions.rows) revokeNow(String(row.session_id))
    } else {
      await pool.query(
        `UPDATE app_sessions SET revoked_at = now()
          WHERE id = $1 AND revoked_at IS NULL`,
        [sid]
      )
      await pool.query(
        `UPDATE app_refresh_tokens SET revoked_at = now()
          WHERE session_id = $1 AND revoked_at IS NULL`,
        [sid]
      )
    }
    // Immediately, not on the next poll: a person pressing "log out" expects
    // it to have happened by the time the screen changes.
    revokeNow(sid)

    json(res, 200, { logged_out: true })
    return true
  }

  /**
   * A known path reached with the wrong verb answers 405, not 404.
   *
   * Every route above matches on path AND method together, so POSTing to a
   * real path with GET fell through to this catch-all and came back as "no
   * such auth route" -- indistinguishable from a typo in the path. A client
   * looking at that has no way to learn which verb is correct, and the
   * obvious next move is to change the path, which is the wrong repair.
   *
   * The Allow header is what carries the answer, and RFC 9110 makes it
   * mandatory on a 405 rather than optional. Sending the status without it
   * would name the category of mistake while withholding the fix.
   */
  const known: Record<string, string> = {
    '/api/auth/telegram': 'POST',
    '/api/auth/widget': 'POST',
    '/api/auth/refresh': 'POST',
    '/api/auth/logout': 'POST',
    '/api/auth/logout-all': 'POST',
    '/api/auth/pair/start': 'POST',
    '/api/auth/pair/claim': 'POST',
  }
  const allowed = known[path]
  if (allowed) {
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: allowed })
    res.end(
      JSON.stringify({
        error: 'метод не подходит',
        detail: `${req.method ?? '?'} сюда нельзя, нужен ${allowed}`,
      })
    )
    return true
  }

  json(res, 404, { error: 'нет такого маршрута аутентификации' })
  return true
}
