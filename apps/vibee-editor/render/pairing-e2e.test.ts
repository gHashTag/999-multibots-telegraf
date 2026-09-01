import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { PAIRING } from './session-store'

/**
 * Сквозной путь входа: подпись → код → сессия.
 *
 * ЗАЧЕМ, ЕСЛИ ЕСТЬ pairing.test.ts. Тот зовёт `issuePairingCode` и
 * `claimPairingCode` НАПРЯМУЮ. Он ничего не знает ни о проверке подписи, ни о
 * разборе тела, ни о том, что маршрут вообще подключён — и именно поэтому не
 * заметил, что оба пути возвращали 401 от гварда, ни разу не дойдя до
 * обработчика. Юнит-тест, обходящий слой, в котором живёт дефект, зелёный по
 * построению.
 *
 * Здесь всё наоборот: вызывается `handleAuthRoute` — то самое, что зовёт
 * сервер, — с НАСТОЯЩЕЙ подписью Telegram, посчитанной тем же алгоритмом, что
 * и у Telegram. Проверяется цепочка целиком, включая то, что код, выданный
 * одним запросом, принимается другим.
 */

const TELEGRAM_TEST_TOKEN = '111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

/**
 * Подпись initData ровно по документации Telegram: секрет — это HMAC от
 * токена бота с ключом «WebAppData», а не сам токен. Перепутать местами — тот
 * самый случай, когда подпись «работает» у себя и не сходится у Telegram.
 */
function подписать(поля: Record<string, string>): string {
  const пары = Object.entries(поля).sort(([a], [b]) => a.localeCompare(b))
  const строка = пары.map(([k, v]) => `${k}=${v}`).join('\n')
  const секрет = crypto
    .createHmac('sha256', 'WebAppData')
    .update(TELEGRAM_TEST_TOKEN)
    .digest()
  const hash = crypto.createHmac('sha256', секрет).update(строка).digest('hex')
  const p = new URLSearchParams(поля)
  p.set('hash', hash)
  return p.toString()
}

/** Общая на весь файл таблица — та же, что переживёт оба запроса. */
const строки: any[] = []

function пул() {
  const client = {
    release() {},
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [] }
      }
      // Схема: таблицы и индексы. Их содержание тест не проверяет — за это
      // отвечает сама база; здесь важно лишь не мешать `ensureAuthTables`.
      if (
        s.startsWith('CREATE TABLE') ||
        s.startsWith('ALTER TABLE') ||
        s.startsWith('CREATE INDEX') ||
        s.startsWith('CREATE UNIQUE INDEX') ||
        s.startsWith('WITH ranked AS')
      )
        return { rows: [] }

      if (s.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] }
      if (s.startsWith('SELECT telegram_id, username, telegram_auth_date')) {
        return {
          rows: fakeRows.filter(
            r =>
              r.t === 'profile' &&
              (String(r.telegram_id) === String(params[0]) ||
                (params[1] &&
                  String(r.username || '').toLowerCase() ===
                    String(params[1]).toLowerCase()))
          ),
        }
      }

      if (
        s.includes(
          'UPDATE app_pairing_codes SET consumed_at = now() WHERE telegram_id'
        )
      ) {
        for (const r of строки) {
          if (r.t === 'code' && r.telegram_id === params[0] && !r.consumed_at)
            r.consumed_at = 1
        }
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO app_pairing_codes')) {
        строки.push({
          t: 'code',
          code_hash: params[0],
          telegram_id: params[1],
          expires_at: Date.parse(String(params[2])),
          consumed_at: null,
          attempts: 0,
        })
        return { rows: [] }
      }
      if (
        s.startsWith('SELECT telegram_id, expires_at, consumed_at, attempts')
      ) {
        return {
          rows: строки.filter(r => r.t === 'code' && r.code_hash === params[0]),
        }
      }
      if (s.includes('SET attempts = attempts + 1')) return { rows: [] }
      if (s.includes('attempts >=')) return { rows: [] }
      if (s.includes('SET consumed_at = now() WHERE code_hash')) {
        const out: any[] = []
        for (const r of строки) {
          if (
            r.t === 'code' &&
            r.code_hash === params[0] &&
            !r.consumed_at &&
            r.expires_at > Date.now()
          ) {
            r.consumed_at = 1
            out.push({ telegram_id: r.telegram_id })
          }
        }
        return { rows: out }
      }
      if (s.startsWith('INSERT INTO app_sessions')) {
        строки.push({ t: 'session', id: params[0], telegram_id: params[1] })
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO app_widget_assertions')) {
        if (
          fakeRows.some(r => r.t === 'widget' && r.assertion_hash === params[0])
        ) {
          return { rows: [] }
        }
        fakeRows.push({
          t: 'widget',
          assertion_hash: params[0],
          telegram_id: params[1],
        })
        return { rows: [{ assertion_hash: params[0] }] }
      }
      if (s.startsWith('INSERT INTO app_refresh_tokens')) {
        строки.push({ t: 'refresh', hash: params[0], session_id: params[2] })
        return { rows: [] }
      }
      if (s.startsWith('UPDATE profiles SET username = NULL')) {
        for (const row of fakeRows) {
          if (
            row.t === 'profile' &&
            String(row.username || '').toLowerCase() ===
              String(params[0]).toLowerCase() &&
            String(row.telegram_id) !== String(params[1])
          ) {
            row.username = null
          }
        }
        return { rows: [] }
      }
      if (s.startsWith('DELETE FROM profiles p USING profiles q')) {
        return { rows: [] }
      }
      if (s.startsWith('UPDATE users SET username = NULL')) {
        return { rows: [] }
      }
      if (s.startsWith('UPDATE users SET username = $2')) {
        const rows = fakeRows.filter(
          r =>
            r.t === 'user-profile' &&
            String(r.telegram_id) === String(params[0])
        )
        for (const row of rows) {
          row.username = params[1]
          row.display_name = params[2]
        }
        return { rows: rows.map(row => ({ id: row.telegram_id })) }
      }
      if (s.startsWith('INSERT INTO users')) {
        fakeRows.push({
          t: 'user-profile',
          telegram_id: params[0],
          username: params[1],
          display_name: params[2],
        })
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO profiles')) {
        const current = fakeRows.find(
          r => r.t === 'profile' && String(r.telegram_id) === String(params[0])
        )
        if (
          current &&
          Number(current.telegram_auth_date || 0) > Number(params[4])
        )
          return { rows: [] }
        const row = current || { t: 'profile', telegram_id: params[0] }
        Object.assign(row, {
          username: params[1],
          display_name: params[2],
          avatar_url: params[3] || row.avatar_url,
          telegram_auth_date: params[4],
        })
        if (!current) fakeRows.push(row)
        return { rows: [{ telegram_id: params[0] }] }
      }
      // Молчаливый ноль строк на непонятом запросе превращает сломанный тест в
      // проходящий. Лучше упасть и назвать запрос.
      throw new Error(`пул не знает запроса: ${s.slice(0, 90)}`)
    },
  }
  return {
    ...client,
    connect: async () => client,
  }
}

/** Мнимый запрос: тело приходит потоком, как у настоящего http-сервера. */
function запрос(
  url: string,
  тело: unknown,
  headers: Record<string, string> = {},
  remoteAddress = '203.0.113.10'
) {
  const r = Readable.from([Buffer.from(JSON.stringify(тело))]) as any
  r.url = url
  r.method = 'POST'
  r.headers = headers
  r.socket = { remoteAddress }
  return r
}

function ответ() {
  const о: any = {
    код: 0,
    тело: null as any,
    // Latin-named views over the Cyrillic fields above, so new assertions do
    // not have to add Cyrillic identifiers the guard would block.
    head: null as any,
    get status() {
      return о.код
    }, // cyrillic-ok
    get json() {
      return о.тело
    }, // cyrillic-ok
    writeHead(c: number, h?: any) {
      о.код = c
      о.head = h ?? null
      return о
    }, // cyrillic-ok
    setHeader(name: string, value: string) {
      о.head = { ...(о.head ?? {}), [name]: value } // cyrillic-ok
    }, // cyrillic-ok
    end(s: string) {
      о.тело = s ? JSON.parse(s) : null
    },
  }
  return о
}

describe('вход по коду: сквозной путь', () => {
  let handleAuthRoute: typeof import('./session-routes').handleAuthRoute

  beforeEach(async () => {
    строки.length = 0
    process.env.TELEGRAM_BOT_TOKEN = TELEGRAM_TEST_TOKEN
    process.env.BOT_TOKEN_12 = TELEGRAM_TEST_TOKEN
    // Имя подсказал сам сервер, отказавшись работать: он называет и
    // переменную, и команду для её создания. Хорошее сообщение об ошибке.
    process.env.SESSION_SIGNING_KEY ||= 'x'.repeat(48)
    vi.resetModules()
    handleAuthRoute = (await import('./session-routes')).handleAuthRoute
  })

  const подписанные = (id: number) =>
    подписать({
      user: JSON.stringify({ id, first_name: 'Тест' }),
      auth_date: String(Math.floor(Date.now() / 1000)),
    })

  it('подпись → код → сессия: код, выданный одним запросом, принимает другой', async () => {
    // 1. Мини-апп: подпись есть, просим код.
    const о1 = ответ()
    await handleAuthRoute(
      запрос(
        '/api/auth/pair/start',
        {},
        { 'x-telegram-init-data': подписанные(4242) }
      ),
      о1,
      пул as any
    )
    expect(о1.код).toBe(200)
    expect(о1.тело.code).toMatch(/^\d{6}$/)

    // 2. Приложение: подписи нет вообще, есть только шесть цифр.
    const о2 = ответ()
    await handleAuthRoute(
      запрос('/api/auth/pair/claim', { code: о1.тело.code }),
      о2,
      пул as any
    )
    expect(о2.код).toBe(200)
    expect(о2.тело.telegram_id).toBe('4242')
    expect(о2.тело.access_token).toBeTruthy()
    expect(о2.тело.refresh_token).toBeTruthy()
  })

  it('подпись читается из ЗАГОЛОВКА — так ходит весь мини-апп', async () => {
    const о = ответ()
    await handleAuthRoute(
      запрос(
        '/api/auth/pair/start',
        {},
        { 'x-telegram-init-data': подписанные(7) }
      ),
      о,
      пул as any
    )
    expect(о.код).toBe(200)
  })

  it('подпись читается и из ТЕЛА — запасной путь для curl и тестов', async () => {
    const о = ответ()
    await handleAuthRoute(
      запрос('/api/auth/pair/start', { init_data: подписанные(7) }),
      о,
      пул as any
    )
    expect(о.код).toBe(200)
  })

  /**
   * Главный тест файла. Подделанная подпись не должна давать код — иначе
   * шестизначный вход становится способом войти в ЛЮБОЙ аккаунт, зная только
   * его telegram_id.
   */
  it('подделанная подпись кода не даёт', async () => {
    const честная = подписанные(4242)
    // Меняем id, оставляя чужой hash: ровно то, что попробует злоумышленник.
    const подделка = честная.replace(/%22id%22%3A4242/, '%22id%22%3A9999')
    expect(подделка).not.toBe(честная)

    const о = ответ()
    await handleAuthRoute(
      запрос(
        '/api/auth/pair/start',
        {},
        {
          'x-telegram-init-data': подделка,
        }
      ),
      о,
      пул as any
    )

    expect(о.код).toBe(401)
    expect(о.тело.error).toBe('подпись Telegram не принята')
  })

  it('код второй раз не проходит: одноразовость держится на всём пути', async () => {
    const о1 = ответ()
    await handleAuthRoute(
      запрос(
        '/api/auth/pair/start',
        {},
        { 'x-telegram-init-data': подписанные(4242) }
      ),
      о1,
      пул as any
    )
    const код = о1.тело.code

    const о2 = ответ()
    await handleAuthRoute(
      запрос('/api/auth/pair/claim', { code: код }),
      о2,
      пул as any
    )
    expect(о2.код).toBe(200)

    const о3 = ответ()
    await handleAuthRoute(
      запрос('/api/auth/pair/claim', { code: код }),
      о3,
      пул as any
    )
    expect(о3.код).toBe(401)
    expect(о3.тело.error).toBe('pairing_failed')
  })

  it('перебор ограничен по источнику и не гасит коды двух владельцев', async () => {
    const first = mkReply()
    const second = mkReply()
    await handleAuthRoute(
      mkRequest(
        '/api/auth/pair/start',
        {},
        { 'x-telegram-init-data': signedInitData(1111) }
      ),
      first,
      fakePool as any
    )
    await handleAuthRoute(
      mkRequest(
        '/api/auth/pair/start',
        {},
        { 'x-telegram-init-data': signedInitData(2222) }
      ),
      second,
      fakePool as any
    )

    for (let attempt = 0; attempt < PAIRING.MAX_ATTEMPTS; attempt++) {
      const miss = mkReply()
      await handleAuthRoute(
        mkRequest(
          '/api/auth/pair/claim',
          { code: '000000' },
          {
            'x-real-ip': '198.51.100.20',
            'x-forwarded-for': `192.0.2.${attempt}, 198.51.100.20`,
          },
          '10.0.0.8'
        ),
        miss,
        fakePool as any
      )
      expect(miss.status).toBe(401)
    }

    const limited = mkReply()
    await handleAuthRoute(
      mkRequest(
        '/api/auth/pair/claim',
        { code: '000000' },
        {
          'x-real-ip': '198.51.100.20',
          'x-forwarded-for': '192.0.2.250, 203.0.113.250',
        },
        '10.0.0.8'
      ),
      limited,
      fakePool as any
    )
    expect(limited.status).toBe(429)
    expect(limited.json).toEqual({
      error: 'pairing_rate_limited',
      detail: 'слишком много попыток — повторите позже',
    })

    const firstClaim = mkReply()
    await handleAuthRoute(
      mkRequest(
        '/api/auth/pair/claim',
        { code: first.json.code },
        {
          'x-real-ip': '198.51.100.21',
          'x-forwarded-for': '198.51.100.20',
        },
        '10.0.0.8'
      ),
      firstClaim,
      fakePool as any
    )
    expect(firstClaim.status).toBe(200)
    expect(firstClaim.json.telegram_id).toBe('1111')

    const secondClaim = mkReply()
    await handleAuthRoute(
      mkRequest(
        '/api/auth/pair/claim',
        { code: second.json.code },
        {
          'x-real-ip': '198.51.100.22',
          'x-forwarded-for': '198.51.100.20',
        },
        '10.0.0.8'
      ),
      secondClaim,
      fakePool as any
    )
    expect(secondClaim.status).toBe(200)
    expect(secondClaim.json.telegram_id).toBe('2222')
  })
})

/**
 * Latin aliases for the helpers above.
 *
 * The file predates the no-cyrillic guard, so its existing Cyrillic
 * identifiers are grandfathered by the ratchet. New lines are not — and
 * renaming the helpers wholesale corrupted the Russian prose around them
 * twice, because a word like `код` or `о` appears in both the code and the
 * sentences explaining it. Three aliases are cheaper than that repair.
 */
const mkReply = ответ // cyrillic-ok
const mkRequest = запрос // cyrillic-ok
const fakePool = пул // cyrillic-ok
const signInitData = подписать // cyrillic-ok
const signedInitData = (id: number) =>
  signInitData({
    user: JSON.stringify({ id, first_name: 'Test' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  })
const TEST_BOT_TOKEN = TELEGRAM_TEST_TOKEN
const fakeRows = строки // cyrillic-ok
const resetFakeRows = () => {
  строки.length = 0 // cyrillic-ok
}

describe('a wrong verb is not a wrong path', () => {
  /**
   * Written after an adversarial pass proved both cases returned the SAME
   * answer. A client that hit a real path with the wrong verb learned exactly
   * what a client with a typo in the path learned -- so its natural next move
   * was the wrong repair: change a path that was already correct.
   */
  it('a known path with the wrong verb answers 405 and names the right one', async () => {
    const { handleAuthRoute } = await import('./session-routes')
    const res = mkReply()
    const req = mkRequest('/api/auth/pair/claim', {})
    req.method = 'GET'
    await handleAuthRoute(req, res, fakePool as any)

    expect(res.status).toBe(405)
    expect(res.head?.Allow).toBe('POST')
    expect(String(res.json.detail)).toContain('POST')
  })

  it('an unknown path is still 404 — a different mistake', async () => {
    const { handleAuthRoute } = await import('./session-routes')
    const res = mkReply()
    await handleAuthRoute(
      mkRequest('/api/auth/no-such-thing', {}),
      res,
      fakePool as any
    )
    expect(res.status).toBe(404)
  })
})

function signWidget<T extends Record<string, unknown>>(
  payload: T
): T & {
  hash: string
} {
  const check = Object.entries(payload)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n')
  const secret = crypto
    .createHash('sha256')
    .update(TELEGRAM_TEST_TOKEN)
    .digest()
  return {
    ...payload,
    hash: crypto.createHmac('sha256', secret).update(check).digest('hex'),
  }
}

describe('Login Widget exchange', () => {
  beforeEach(() => {
    resetFakeRows()
    process.env.BOT_TOKEN_12 = TEST_BOT_TOKEN
    process.env.SESSION_SIGNING_KEY = 'x'.repeat(48)
    vi.resetModules()
  })
  it('mints a session only after the server verifies the widget signature', async () => {
    const { handleAuthRoute } = await import('./session-routes')
    const payload = signWidget({
      id: 5151,
      first_name: 'Web owner',
      username: 't27_dev',
      auth_date: Math.floor(Date.now() / 1000),
    })
    const res = mkReply()
    await handleAuthRoute(
      mkRequest('/api/auth/widget', payload),
      res,
      fakePool as any
    )

    expect(res.status).toBe(200)
    expect(res.json.telegram_id).toBe('5151')
    expect(res.json.telegram_user).toMatchObject({
      id: 5151,
      username: 't27_dev',
    })
    expect(res.json.access_token).toBeTruthy()
    expect(res.json.refresh_token).toBeTruthy()
    expect(fakeRows).toContainEqual(
      expect.objectContaining({
        t: 'profile',
        telegram_id: '5151',
        username: 't27_dev',
        display_name: 'Web owner',
      })
    )
  })

  it('does not create a session for a forged widget identity', async () => {
    const { handleAuthRoute } = await import('./session-routes')
    const payload = signWidget({
      id: 5151,
      first_name: 'Web owner',
      auth_date: Math.floor(Date.now() / 1000),
    })
    payload.id = 9999
    const res = mkReply()
    await handleAuthRoute(
      mkRequest('/api/auth/widget', payload),
      res,
      fakePool as any
    )
    expect(res.status).toBe(401)
    expect(res.json.access_token).toBeUndefined()
  })

  it('consumes one signed widget assertion only once', async () => {
    const { handleAuthRoute } = await import('./session-routes')
    const payload = signWidget({
      id: 5151,
      first_name: 'Web owner',
      username: 't27_dev',
      auth_date: Math.floor(Date.now() / 1000),
    })
    const first = mkReply()
    await handleAuthRoute(
      mkRequest('/api/auth/widget', payload),
      first,
      fakePool as any
    )
    expect(first.status).toBe(200)
    const sessionsAfterFirst = fakeRows.filter(
      row => row.t === 'session'
    ).length

    const replay = mkReply()
    await handleAuthRoute(
      mkRequest('/api/auth/widget', payload),
      replay,
      fakePool as any
    )
    expect(replay.status).toBe(409)
    expect(replay.json.error).toContain('already used or stale')
    expect(fakeRows.filter(row => row.t === 'session')).toHaveLength(
      sessionsAfterFirst
    )
  })
})
