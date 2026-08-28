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
import { verifyTelegramInitData } from './auth'
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
  pool: Pool,
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
    access_token: signAccessToken({ telegramId, sessionId, deviceKeyThumbprint: dkt }),
    refresh_token: refresh.token,
    expires_in: SESSION_TUNING.ACCESS_TTL_SECONDS,
    telegram_id: telegramId,
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

type Pool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

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
    json(res, 503, { error: 'база недоступна', detail: String(e).slice(0, 160) })
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

  // ─── Pairing: start (needs a Telegram signature) ───────────────────────
  if (path === '/api/auth/pair/start' && req.method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch {
      json(res, 400, { error: 'тело запроса не разобрано как JSON' })
      return true
    }

    const initData = String(body.init_data ?? '')
    const v = verifyTelegramInitData(initData)
    const telegramId = verifiedTelegramIdFrom(initData)
    if (!v.ok || !telegramId) {
      json(res, 401, {
        error: 'подпись Telegram не принята',
        detail: v.reason ?? 'в подписанной строке нет поля user.id',
        hint: 'код выдаётся только внутри Telegram — там есть подпись',
      })
      return true
    }

    const { code, expiresAt } = await issuePairingCode(pool, telegramId, mintPairingCode)
    json(res, 200, {
      code,
      expires_in: PAIRING.TTL_SECONDS,
      expires_at: expiresAt.toISOString(),
    })
    return true
  }

  // ─── Pairing: claim (the native app, holding no signature at all) ──────
  if (path === '/api/auth/pair/claim' && req.method === 'POST') {
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
      json(res, 401, { error: 'pairing_failed', reason: outcome.reason, detail })
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
      const code = outcome.reason === 'reused' ? 'auth_reuse_detected' : 'auth_refresh_failed'
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
      json(res, 401, { error: 'auth_refresh_failed', detail: 'сессия отозвана' })
      return true
    }

    const s = row.rows[0]
    await pool.query(`UPDATE app_sessions SET last_seen_at = now() WHERE id = $1`, [s.id])

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
    if (!bearer.startsWith('Bearer ')) {
      json(res, 401, { error: 'нужен Authorization: Bearer' })
      return true
    }
    let sid: string
    try {
      sid = verifyAppSession(bearer.slice(7).trim()).sid
    } catch {
      // An expired token is a perfectly ordinary way to arrive here, and
      // refusing would leave the person unable to log out of a stale session.
      json(res, 200, { logged_out: true, note: 'токен уже недействителен' })
      return true
    }

    await pool.query(
      `UPDATE app_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [sid]
    )
    await pool.query(
      `UPDATE app_refresh_tokens SET revoked_at = now()
        WHERE session_id = $1 AND revoked_at IS NULL`,
      [sid]
    )
    // Immediately, not on the next poll: a person pressing "log out" expects
    // it to have happened by the time the screen changes.
    revokeNow(sid)

    json(res, 200, { logged_out: true })
    return true
  }

  json(res, 404, { error: 'нет такого маршрута аутентификации' })
  return true
}
