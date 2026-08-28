import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'

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

const ТОКЕН = '111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

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
    .update(ТОКЕН)
    .digest()
  const hash = crypto.createHmac('sha256', секрет).update(строка).digest('hex')
  const p = new URLSearchParams(поля)
  p.set('hash', hash)
  return p.toString()
}

/** Общая на весь файл таблица — та же, что переживёт оба запроса. */
const строки: any[] = []

function пул() {
  return {
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      // Схема: таблицы и индексы. Их содержание тест не проверяет — за это
      // отвечает сама база; здесь важно лишь не мешать `ensureAuthTables`.
      if (s.startsWith('CREATE TABLE') || s.startsWith('CREATE INDEX'))
        return { rows: [] }

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
      if (s.startsWith('INSERT INTO app_refresh_tokens')) {
        строки.push({ t: 'refresh', hash: params[0], session_id: params[2] })
        return { rows: [] }
      }
      // Молчаливый ноль строк на непонятом запросе превращает сломанный тест в
      // проходящий. Лучше упасть и назвать запрос.
      throw new Error(`пул не знает запроса: ${s.slice(0, 90)}`)
    },
  }
}

/** Мнимый запрос: тело приходит потоком, как у настоящего http-сервера. */
function запрос(
  url: string,
  тело: unknown,
  заголовки: Record<string, string> = {}
) {
  const r = Readable.from([Buffer.from(JSON.stringify(тело))]) as any
  r.url = url
  r.method = 'POST'
  r.headers = заголовки
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
    process.env.TELEGRAM_BOT_TOKEN = ТОКЕН
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
