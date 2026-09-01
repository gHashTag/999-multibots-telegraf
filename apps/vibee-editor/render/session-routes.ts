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

import type { IncomingMessage, ServerResponse } from 'node:http'
import crypto from 'node:crypto'
import { isIP } from 'node:net'
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
} from './session'
import {
  ensureAuthTables,
  refreshStore,
  issuePairingCode,
  claimPairingCode,
  PAIRING,
} from './session-store'

/**
 * Six digits from `randomInt`, not from `Math.random`.
 *
 * `Math.random` is seeded predictably enough that a stream of its output can
 * be extrapolated; that is fine for shuffling a playlist and disqualifying for
 * anything someone would want to guess. `randomInt` draws from the same source
 * as key material and has no modulo bias.
 */
function mintPairingCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(PAIRING.DIGITS, '0')
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
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const sessionId = crypto.randomUUID()
  const familyId = crypto.randomUUID()
  const dkt = deviceThumbprint(body)
  const refresh = issueRefreshToken()

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

const pairingClaimBuckets = new Map<
  string,
  { attempts: number; resetsAt: number }
>()
const PAIRING_CLAIM_WINDOW_MS = 60_000
const PAIRING_CLAIM_MAX_BUCKETS = 10_000

/**
 * Railway overwrites X-Real-IP with the public client's address. XFF is not a
 * trust boundary: its ordering depends on proxy configuration and a client
 * can supply a prefix. Direct/local traffic falls back to the socket address.
 * Only a validated IP digest is retained.
 */
function pairingClaimSource(req: IncomingMessage): string {
  const railwayHeader = req.headers['x-real-ip']
  const railwayIp = Array.isArray(railwayHeader)
    ? ''
    : String(railwayHeader ?? '').trim()
  const socketIp = String(req.socket.remoteAddress ?? '').trim()
  const address = isIP(railwayIp)
    ? railwayIp
    : isIP(socketIp)
      ? socketIp
      : 'unknown'
  return digest(`pair-claim:${address}`)
}

function allowPairingClaim(req: IncomingMessage, now = Date.now()): boolean {
  const key = pairingClaimSource(req)
  const current = pairingClaimBuckets.get(key)
  if (!current || current.resetsAt <= now) {
    if (pairingClaimBuckets.size >= PAIRING_CLAIM_MAX_BUCKETS) {
      for (const [candidate, bucket] of pairingClaimBuckets) {
        if (bucket.resetsAt <= now) pairingClaimBuckets.delete(candidate)
      }
      if (pairingClaimBuckets.size >= PAIRING_CLAIM_MAX_BUCKETS) {
        const oldest = pairingClaimBuckets.keys().next().value
        if (oldest) pairingClaimBuckets.delete(oldest)
      }
    }
    pairingClaimBuckets.set(key, {
      attempts: 1,
      resetsAt: now + PAIRING_CLAIM_WINDOW_MS,
    })
    return true
  }
  if (current.attempts >= PAIRING.MAX_ATTEMPTS) return false
  current.attempts += 1
  // Refresh insertion order so bounded eviction drops the least-recent source.
  pairingClaimBuckets.delete(key)
  pairingClaimBuckets.set(key, current)
  return true
}

type PairingIdentity = { ok: true; telegramId: string } | { ok: false }

const PAIRING_IDENTITY_FAILURE = Object.freeze({
  error: 'identity_not_verified',
  detail: 'подтверждённый вход не принят',
  hint: 'откройте Mini App через @t27ai_bot и повторите',
})

/**
 * Pairing accepts either proof the server already trusts: fresh Telegram
 * initData inside the Mini App, or a server-signed browser session minted
 * after Login Widget verification. The account id is derived from that proof
 * and is never accepted from client JSON.
 */
function pairingIdentity(
  req: IncomingMessage,
  initData: string
): PairingIdentity {
  if (initData) {
    const verification = verifyTelegramInitData(initData)
    const telegramId = verifiedTelegramIdFrom(initData)
    return verification.ok && telegramId
      ? { ok: true, telegramId }
      : { ok: false }
  }

  const authorization = String(req.headers.authorization ?? '')
  if (authorization.startsWith('Bearer ')) {
    try {
      const claims = verifyAppSession(authorization.slice(7).trim())
      return { ok: true, telegramId: claims.sub }
    } catch {
      return { ok: false }
    }
  }

  return { ok: false }
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

    json(res, 200, await mintSession(pool, telegramId, body))
    return true
  }

  // ─── Browser login: verified Login Widget payload becomes a session ───
  if (path === '/api/auth/widget' && req.method === 'POST') {
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
    const identity = pairingIdentity(req, initData)
    if (!identity.ok) {
      json(res, 401, PAIRING_IDENTITY_FAILURE)
      return true
    }

    const { code, expiresAt } = await issuePairingCode(
      pool,
      identity.telegramId,
      mintPairingCode
    )
    json(res, 200, {
      code,
      expires_in: PAIRING.TTL_SECONDS,
      expires_at: expiresAt.toISOString(),
    })
    return true
  }

  // ─── Pairing: claim (the native app, holding no signature at all) ──────
  if (path === '/api/auth/pair/claim' && req.method === 'POST') {
    if (!allowPairingClaim(req)) {
      res.setHeader('Retry-After', String(PAIRING_CLAIM_WINDOW_MS / 1000))
      json(res, 429, {
        error: 'pairing_rate_limited',
        detail: 'слишком много попыток — повторите позже',
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
    if (!/^\d{6}$/.test(code)) {
      json(res, 400, { error: 'код должен быть из шести цифр' })
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
      json(res, 401, {
        error: 'pairing_failed',
        reason: outcome.reason,
        detail,
      })
      return true
    }

    json(res, 200, await mintSession(pool, outcome.telegramId, body))
    return true
  }

  // ─── Refresh ───────────────────────────────────────────────────────────
  if (path === '/api/auth/refresh' && req.method === 'POST') {
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
