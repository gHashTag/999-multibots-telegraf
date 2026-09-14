/**
 * Storage for app sessions: tables, and the store `rotateRefreshToken` needs.
 *
 * WHY SEPARATE FROM session.ts. That module holds no database handle, which is
 * what lets its twelve tests run without one. Everything that touches Postgres
 * lives here, so the crypto stays testable and the SQL stays in one place.
 *
 * WHY CREATE TABLE IF NOT EXISTS RATHER THAN A MIGRATION FILE. This project
 * has no migration runner; every other table in it (`user_tokens`,
 * `agent_renders`, `user_skills`) is created the same way, on first use.
 * Inventing a second convention for four more tables would mean two ways to
 * get a schema, and the one nobody runs would drift.
 */

import crypto from 'node:crypto'
import {
  digest,
  revokeNow,
  revocationMark,
  setRevokedSessions,
} from './session'

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

let готово = false

/**
 * Create the four tables. Idempotent, and cheap after the first call.
 *
 * Called from the auth routes rather than at boot: a server that cannot reach
 * Postgres should still serve `/health` and the public feed, and failing at
 * startup would take those down too.
 */
export async function ensureAuthTables(pool: Pool): Promise<void> {
  if (готово) return

  /*
   * ЗДЕСЬ ЗАВОДИЛАСЬ ТАБЛИЦА `oidc_auth_requests` — И БОЛЬШЕ НИГДЕ НЕ
   * УПОМИНАЛАСЬ.
   *
   * Ни одной вставки, ни одного чтения во всём репозитории: заготовка под
   * вход по OIDC с PKCE (`state`, `code_verifier`), который так и не был
   * написан. Создавалась она при каждом запуске сервиса.
   *
   * Убрана не ради экономии — таблица пустая и ничего не стоила. Убрана
   * потому, что схема ОПИСЫВАЕТ ДВЕРИ: читающий её видел четвёртый способ
   * войти и был вправе считать, что он есть. Ровно та же неправда, что поле
   * `dkt` с подписью «привязывает токен к устройству», которое никто не
   * проверял. Заготовка, неотличимая от работающего кода, — это долг с
   * отрицательной ставкой.
   *
   * На существующих базах строка `CREATE TABLE IF NOT EXISTS` и так ничего не
   * делала: таблица там давно есть и остаётся, пустая. Удалять её оттуда
   * миграцией — отдельная работа, к входу отношения не имеющая.
   */

  // A session is one device. Revocation works on this row, and the in-memory
  // set in session.ts is filled from it.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id text PRIMARY KEY,
      telegram_id text NOT NULL,
      device_pubkey text NOT NULL,
      device_name text,
      family_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz,
      revoked_at timestamptz
    )`)
  // How the person proved who they are (session-routes.ts SessionKind). Rows
  // minted before the column existed read 'legacy': that is not known for them.
  await pool.query(
    `ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legacy'`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS app_sessions_owner
       ON app_sessions (telegram_id, created_at DESC)`
  )
  // The revocation poller reads exactly this: live sessions marked revoked.
  await pool.query(
    `CREATE INDEX IF NOT EXISTS app_sessions_revoked
       ON app_sessions (revoked_at) WHERE revoked_at IS NOT NULL`
  )

  /**
   * Refresh tokens. `token_hash` is the primary key on purpose: the raw token
   * has no column at all, so there is no version of this table that could leak
   * one. `family_id` ties a chain of rotations together — see the reuse
   * handling in session.ts.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_refresh_tokens (
      token_hash text PRIMARY KEY,
      family_id text NOT NULL,
      session_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      replaced_by text,
      revoked_at timestamptz
    )`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS app_refresh_family
       ON app_refresh_tokens (family_id)`
  )

  /**
   * One-time tickets for streaming endpoints.
   *
   * EventSource cannot send headers, and putting a Bearer token in the query
   * string would leave it in proxy logs and in Referer — the exact flaw that
   * already makes `?initData=` unacceptable. A ticket is worth sixty seconds
   * and one connection.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_stream_tickets (
      ticket_hash text PRIMARY KEY,
      session_id text NOT NULL,
      telegram_id text NOT NULL,
      scope text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz
    )`)

  // A signed Login Widget assertion may mint exactly one long-lived session.
  // Only a digest is stored; replay is rejected by the primary key in the
  // same transaction that writes the profile and refresh-token family.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_widget_assertions (
      assertion_hash text PRIMARY KEY,
      telegram_id text NOT NULL,
      consumed_at timestamptz NOT NULL DEFAULT now()
    )`)

  /**
   * ОДИН ЗАПУСК МИНИ-АППА — ОДНА СЕМЬЯ ТОКЕНОВ.
   *
   * Найдено при разборе входа 07.09.2026. Подпись Login Widget одноразовая:
   * `app_widget_assertions` не даёт предъявить её дважды. У initData такой
   * защиты не было вовсе, а живёт она 24 часа — значит одну и ту же строку
   * можно предъявлять сколько угодно раз, и КАЖДЫЙ раз рождалась новая
   * НЕЗАВИСИМАЯ семья на шестьдесят дней.
   *
   * Так суточный пропуск превращался в двухмесячный, причём во множестве
   * копий, не связанных друг с другом: человек нажимает «Выйти», гасится его
   * семья, а чужая — заведённая той же строкой — продолжает жить.
   *
   * Одноразовость здесь не годится: initData выдаётся на запуск, а запросов
   * на вход внутри запуска может быть больше одного (повтор после обрыва
   * сети, две вкладки — см. `REUSE_GRACE_SECONDS`). Поэтому не «нельзя
   * дважды», а «дважды — та же семья»: повторный вход по той же строке
   * продлевает существующую сессию вместо того, чтобы заводить рядом вторую.
   *
   * Хранится только отпечаток строки: сама initData несёт подпись, по которой
   * можно представиться человеком.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_launch_families (
      assertion_hash text PRIMARY KEY,
      telegram_id text NOT NULL,
      family_id text NOT NULL,
      session_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`)

  /**
   * Pairing codes: how a client with no Telegram signature gets a session.
   *
   * The native app is not inside Telegram, so it can never hold initData. It
   * has been holding an agent key typed in by a person instead — the one
   * manual step left in the whole product.
   *
   * The code crosses the gap through the person's eyes, not through a URL.
   * A deep link would have been fewer taps, but a refresh token in a query
   * string lands in logs, in pasteboard history, and in whatever app renders
   * the link. Digits read off one screen and typed into another leave no
   * copy anywhere.
   *
   * `code_hash` is the primary key and the raw code has NO column: a database
   * dump must not be a list of working credentials. Same rule as refresh
   * tokens, for the same reason.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_pairing_codes (
      code_hash text PRIMARY KEY,
      telegram_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      attempts int NOT NULL DEFAULT 0
    )`)

  /**
   * Sign out everywhere: one cutoff per person (see `notBefore` in session.ts).
   * A credential issued before `not_before` is refused. One row per person who
   * ever pressed the button; the poll reads only recent rows.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_user_not_before (
      telegram_id text PRIMARY KEY,
      not_before timestamptz NOT NULL
    )`)

  готово = true
}

/** How long a pairing code lives, and how wrong you may be about it. */
export const PAIRING = {
  /**
   * Две минуты: дойти до другого устройства успеваешь, а подсмотренный
   * через плечо код протухает раньше, чем пригодится.
   *
   * ПОЧЕМУ НЕ БОЛЬШЕ — вопрос разбирался 07.09.2026, когда стало ясно, что
   * человеку надо прочитать восемь цифр, взять телефон, открыть приложение,
   * дойти до «Войти» и набрать. Соблазн — поднять до пяти минут.
   *
   * По стойкости это ничего не стоило бы: потолок канала (1000 попыток в
   * минуту на весь трафик, src/entry-throttle.ts) даёт 5000 догадок за пять
   * минут против 10^8 — 0,005%.
   *
   * Но срок стоит здесь НЕ ради перебора. Он ради подглядывания: код виден на
   * экране, и всё это время им может воспользоваться посторонний, набрав его
   * раньше владельца. Код одноразовый — кто успел, тот и вошёл. Растянуть
   * окно в два с половиной раза значит во столько же раз увеличить шанс
   * именно этой, единственной реальной здесь атаки.
   *
   * Цена истечения — ОДНО НАЖАТИЕ «Получить новый код», а не блокировка. Плата
   * несимметрична, поэтому остаётся 120.
   */
  TTL_SECONDS: 120,
  /*
   * ВОСЕМЬ ЦИФР, А НЕ ШЕСТЬ — И ЭТО СЛЕДСТВИЕ, А НЕ ВКУС.
   *
   * Здесь стояло шесть, и комментарий рядом честно называл условие
   * безопасности: «миллион кодов безопасен ПОТОМУ ЧТО окно две минуты И
   * потому что догадки считаются».
   *
   * Второе условие пришлось снять: счёт вёлся запросом без фильтра по
   * владельцу, то есть каждый промах гасил живые коды ВСЕХ людей платформы, а
   * маршрут не требует личности и тормоза не имел. Пять запросов в секунду с
   * любого адреса — и вход по коду не работал ни у кого.
   *
   * Сняв условие, надо было вернуть прочность другим способом, а не сделать
   * вид, что её хватает. Теперь она держится на двух вещах:
   *
   *   энтропия  10^8 вместо 10^6 — в сто раз дороже перебор;
   *   тормоз    десять попыток в минуту с источника (src/entry-throttle.ts).
   *
   * Считаем худший случай честно: распределённая атака с тысячи адресов даёт
   * 20 000 догадок за 120 секунд жизни кода — 0,02% против 10^8. Прежние
   * шесть цифр дали бы 2% за то же окно, то есть попадание за пару часов.
   *
   * Цена — две лишние цифры, которые человек набирает один раз.
   */
  DIGITS: 8,
} as const

/**
 * Mint a pairing code for an ALREADY VERIFIED telegram_id.
 *
 * Callers must have checked the Telegram signature. This function cannot do
 * it — it takes an id, and an id is not proof of anything.
 */
export async function issuePairingCode(
  pool: Pool,
  telegramId: string,
  mint: () => string
): Promise<{ code: string; expiresAt: Date }> {
  /**
   * One live code per person.
   *
   * Without this, pressing the button twice leaves two valid codes and the
   * person cannot tell which screen is current. Worse, the abandoned one stays
   * guessable for its full two minutes with its own attempt counter — every
   * press would widen the window instead of restarting it.
   */
  await pool.query(
    `UPDATE app_pairing_codes SET consumed_at = now()
      WHERE telegram_id = $1 AND consumed_at IS NULL`,
    [telegramId]
  )

  const code = mint()
  const expiresAt = new Date(Date.now() + PAIRING.TTL_SECONDS * 1000)
  await pool.query(
    `INSERT INTO app_pairing_codes (code_hash, telegram_id, expires_at)
     VALUES ($1, $2, $3)`,
    [digest(code), telegramId, expiresAt.toISOString()]
  )
  return { code, expiresAt }
}

export type PairingOutcome =
  | { ok: true; telegramId: string }
  | { ok: false; reason: 'unknown' | 'expired' | 'exhausted' }

/**
 * Redeem a code. Single use, enforced by the WHERE clause and not by a
 * read-then-write — two devices racing the same code must not both win.
 */
export async function claimPairingCode(
  pool: Pool,
  code: string
): Promise<PairingOutcome> {
  const hash = digest(code)

  /**
   * COUNT THE GUESS BEFORE CHECKING IT.
   *
   * A million codes sounds like plenty until someone scripts it. The counter
   * only helps if it moves on WRONG guesses, and a wrong guess by definition
   * does not match any row — so counting per-code would count nothing at all.
   *
   * So the budget is per PERSON, charged to whichever live code exists: five
   * wrong tries and every outstanding code for that account dies. An attacker
   * guessing blindly burns the victim's codes, which is visible and annoying,
   * rather than silently getting unlimited tries.
   */
  const hit = await pool.query(
    `SELECT telegram_id, expires_at, consumed_at, attempts
       FROM app_pairing_codes WHERE code_hash = $1`,
    [hash]
  )

  if (!hit.rows.length) {
    /*
     * ПРОМАХ БОЛЬШЕ НЕ ГАСИТ ЧУЖИЕ КОДЫ.
     *
     * Здесь стояло начисление попытки ВСЕМ живым кодам:
     *
     *     UPDATE app_pairing_codes SET attempts = attempts + 1
     *      WHERE consumed_at IS NULL AND expires_at > now()
     *
     * без единого фильтра по владельцу. Замысел был против перебора, и
     * комментарий описывал последствие как «жжёт коды жертвы — заметно и
     * неприятно». Жертва тут не одна: маршрут не требует личности (и не
     * может), тормоза по частоте не было, значит пять запросов в секунду с
     * любого адреса гасили живые коды ВСЕХ людей платформы — вход по коду
     * переставал работать у всех и навсегда, ценой копеек.
     *
     * Перебор теперь ограничен иначе — тормозом по источнику на самом
     * маршруте (src/entry-throttle.ts). Код живёт 120 секунд, пространство
     * миллион, десять попыток в минуту: двадцать догадок за жизнь кода, то
     * есть один шанс на пятьдесят тысяч, и он не накапливается.
     *
     * Промах теперь не трогает ничего. Отказ в обслуживании исчез вместе с
     * начислением.
     */
    return { ok: false, reason: 'unknown' }
  }

  const row = hit.rows[0]

  const consumed = await pool.query(
    `UPDATE app_pairing_codes SET consumed_at = now()
      WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING telegram_id`,
    [hash]
  )
  if (!consumed.rows.length) return { ok: false, reason: 'expired' }

  return { ok: true, telegramId: String(consumed.rows[0].telegram_id) }
}

/** Storage adapter for `rotateRefreshToken`. */
export function refreshStore(pool: Pool) {
  return {
    async find(hash: string) {
      const r = await pool.query(
        `SELECT family_id, used_at, revoked_at, expires_at
           FROM app_refresh_tokens WHERE token_hash = $1`,
        [hash]
      )
      if (!r.rows.length) return null
      const row = r.rows[0]
      return {
        familyId: String(row.family_id),
        usedAt: row.used_at ? new Date(row.used_at) : null,
        revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
        expiresAt: new Date(row.expires_at),
      }
    },

    async consumeAndInsert(
      hash: string,
      replacedByHash: string,
      expiresAt: Date
    ) {
      /**
       * `WHERE used_at IS NULL` is what makes rotation single-use under
       * concurrency. Two requests arriving with the same token both read
       * `used_at = null`; without this guard both would proceed and neither
       * would look like reuse. With it, exactly one wins and the loser is
       * seen for what it is.
       */
      const claimed = await pool.query(
        `WITH consumed AS (
           UPDATE app_refresh_tokens
              SET used_at = now(), replaced_by = $2
            WHERE token_hash = $1
              AND used_at IS NULL
              AND revoked_at IS NULL
              AND expires_at > now()
            RETURNING family_id, session_id
         )
         INSERT INTO app_refresh_tokens
           (token_hash, family_id, session_id, expires_at)
         SELECT $2, family_id, session_id, $3 FROM consumed
         RETURNING token_hash`,
        [hash, replacedByHash, expiresAt.toISOString()]
      )
      return claimed.rows.length === 1
    },

    async revokeFamily(familyId: string) {
      await pool.query(
        `UPDATE app_refresh_tokens SET revoked_at = now()
          WHERE family_id = $1 AND revoked_at IS NULL`,
        [familyId]
      )
      const r = await pool.query(
        `UPDATE app_sessions SET revoked_at = now()
          WHERE family_id = $1 AND revoked_at IS NULL
          RETURNING id`,
        [familyId]
      )
      return r.rows.map((x: any) => String(x.id))
    },
  }
}

/**
 * Revoke EVERY live session family of one person: "sign out everywhere".
 *
 * Logout revokes the family that presented the token. Every other family the
 * same person holds stays alive: another browser, the iOS app, a session minted
 * from a Mini App launch, a pairing claim, a widget sign-in. After a token
 * theft those are exactly the ones that matter, and nothing could reach them
 * short of waiting out the sixty days.
 *
 * Keyed by `telegram_id`, not by how a family was minted: every way in writes
 * these two tables through `mintSession`, so one condition covers them all,
 * and a new way in is covered without a change here.
 *
 * Refresh tokens are revoked for every family of the person, including one
 * whose session row was already revoked, so none of their refresh rows stays
 * usable. Returns the ids of the sessions this call revoked, so the caller can
 * `revokeNow` them in this process; other replicas pick them up from the poll.
 *
 * Outstanding pairing codes are spent first. A code is an unused credential:
 * claiming it mints a new family, and the claim checks only that the code is
 * live. A code seen over the person's shoulder and claimed after this call
 * would otherwise start a family the person believes they just killed. Spending
 * codes before revoking sessions means a claim cannot land between the two.
 */
export async function revokeAllFamiliesOf(
  pool: Pool,
  telegramId: string
): Promise<string[]> {
  // Same statement as issuePairingCode's "one live code per person".
  await pool.query(
    `UPDATE app_pairing_codes SET consumed_at = now()
      WHERE telegram_id = $1 AND consumed_at IS NULL`,
    [telegramId]
  )
  const sessions = await pool.query(
    `UPDATE app_sessions SET revoked_at = now()
      WHERE telegram_id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [telegramId]
  )
  await pool.query(
    `UPDATE app_refresh_tokens SET revoked_at = now()
      WHERE revoked_at IS NULL
        AND family_id IN (SELECT family_id FROM app_sessions WHERE telegram_id = $1)`,
    [telegramId]
  )
  return sessions.rows.map((x: any) => String(x.id))
}

/**
 * Write a person's sign-out-everywhere cutoff, in epoch seconds.
 *
 * The caller passes the same number it marks in its own memory
 * (`markNotBefore`), so this replica and the ones that learn it from the poll
 * compare against exactly one value.
 */
export async function setNotBefore(
  pool: Pool,
  telegramId: string,
  seconds: number
): Promise<void> {
  await pool.query(
    `INSERT INTO app_user_not_before (telegram_id, not_before)
     VALUES ($1, to_timestamp($2))
     ON CONFLICT (telegram_id) DO UPDATE SET not_before = EXCLUDED.not_before`,
    [telegramId, seconds]
  )
}

/**
 * Whether the person pressed "sign out everywhere" after `issuedAtSeconds`,
 * the moment the credential a sign-in rests on was issued (initData or Login
 * Widget auth_date). Read from the database, not from this process's memory,
 * which another replica fills only on its next poll.
 *
 * Callers that mint ask AFTER their session or code row is committed, and
 * revoke what they minted when this is true. logout-all commits the cutoff
 * before its revocation UPDATE, so a check that starts after the insert either
 * sees the cutoff, or started before the cutoff was committed -- and then the
 * revocation UPDATE, which starts later still, sees the inserted row and
 * revokes it. A check made before the insert would leave a window: an insert
 * that lands after the revocation. Assumes Postgres READ COMMITTED (the
 * default) and single-statement writes.
 */
export async function signedOutSince(
  pool: Pool,
  telegramId: string,
  issuedAtSeconds: number
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM app_user_not_before
      WHERE telegram_id = $1 AND not_before > to_timestamp($2)
      LIMIT 1`,
    [telegramId, issuedAtSeconds]
  )
  return r.rows.length > 0
}

/**
 * The same question for a pairing code: was it created before its owner's
 * cutoff? A code is issued only after pair/start's own check, so its creation
 * time stands in for the launch that issued it. Asked by pair/claim after the
 * session row is committed, for the reason given above.
 */
export async function pairingCodeSignedOut(
  pool: Pool,
  code: string
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM app_pairing_codes c
       JOIN app_user_not_before n ON n.telegram_id = c.telegram_id
      WHERE c.code_hash = $1 AND n.not_before > c.created_at
      LIMIT 1`,
    [digest(code)]
  )
  return r.rows.length > 0
}

/**
 * Refresh the in-memory revoked set from the database.
 *
 * Deliberately does NOT clear rows: a session revoked long ago has an expired
 * access token anyway, and keeping every revocation forever would grow the set
 * without bound. Ninety minutes is nine access-token lifetimes — long enough
 * that nothing slips through, short enough that the set stays small.
 */
export async function pollRevocations(pool: Pool): Promise<number> {
  // Before the first query: marks made after this are re-applied on top of
  // what the queries read (see setRevokedSessions).
  const readAfterMark = revocationMark()
  const r = await pool.query(
    `SELECT id FROM app_sessions
      WHERE revoked_at IS NOT NULL AND revoked_at > now() - interval '90 minutes'`
  )
  const ids = r.rows.map((x: any) => String(x.id))
  /*
   * Cutoffs from the last two days. Older ones refuse nothing any more: the
   * longest-lived credential they apply to, initData, is itself refused after
   * 24 hours; access and game tokens live minutes. Read in the same poll so one
   * timestamp says how fresh both are, and a failed read fails the whole poll.
   */
  const cut = await pool.query(
    `SELECT telegram_id, EXTRACT(EPOCH FROM not_before) AS not_before
       FROM app_user_not_before
      WHERE not_before > now() - interval '2 days'`
  )
  setRevokedSessions(
    ids,
    cut.rows.map(
      (x: any) =>
        [String(x.telegram_id), Math.floor(Number(x.not_before))] as [
          string,
          number,
        ]
    ),
    readAfterMark
  )

  /*
   * Заодно убираем отработавшие записи о запусках.
   *
   * `app_launch_families` растёт по строке на КАЖДЫЙ запуск мини-аппа, а
   * смысла живёт ровно столько же, сколько сама initData, — сутки. Дальше
   * запись бесполезна: по ней уже никто не войдёт, потому что подпись
   * просрочена.
   *
   * Уборка стоит здесь, а не отдельным таймером: опрос отзывов уже ходит по
   * расписанию и уже держит соединение. Второй таймер — вторая движущаяся
   * часть, которая однажды остановится незаметно.
   */
  await pool.query(
    `DELETE FROM app_launch_families WHERE created_at < now() - interval '2 days'`
  )
  return ids.length
}

/** A ticket for one stream connection. Returns the raw value once. */
export async function issueStreamTicket(
  pool: Pool,
  params: { sessionId: string; telegramId: string; scope: string }
): Promise<string> {
  const ticket = crypto.randomBytes(32).toString('base64url')
  await pool.query(
    `INSERT INTO app_stream_tickets (ticket_hash, session_id, telegram_id, scope, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '60 seconds')`,
    [digest(ticket), params.sessionId, params.telegramId, params.scope]
  )
  return ticket
}

/**
 * Spend a ticket. Returns the owner, or null.
 *
 * Consumption is the UPDATE itself, guarded by `consumed_at IS NULL`, so a
 * ticket replayed from a proxy log finds nothing to spend. Checking first and
 * updating after would leave exactly the window this is meant to close.
 */
export async function consumeStreamTicket(
  pool: Pool,
  ticket: string,
  scope: string
): Promise<{ sessionId: string; telegramId: string } | null> {
  const r = await pool.query(
    `UPDATE app_stream_tickets SET consumed_at = now()
      WHERE ticket_hash = $1 AND scope = $2
        AND consumed_at IS NULL AND expires_at > now()
      RETURNING session_id, telegram_id`,
    [digest(ticket), scope]
  )
  if (!r.rows.length) return null
  return {
    sessionId: String(r.rows[0].session_id),
    telegramId: String(r.rows[0].telegram_id),
  }
}
