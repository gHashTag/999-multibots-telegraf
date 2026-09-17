import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { routeRequest, routeResponse } from './test-support/route-double'

/**
 * ОДИН ЗАПУСК МИНИ-АППА — ОДНА СЕМЬЯ ТОКЕНОВ.
 *
 * Найдено при разборе входа 07.09.2026.
 *
 * Подпись Login Widget одноразовая: `app_widget_assertions` не даёт предъявить
 * её дважды, и это записано в схеме прямым текстом. У initData такой защиты не
 * было ВОВСЕ, а живёт она сутки — значит одну и ту же строку можно предъявлять
 * сколько угодно раз, и каждый раз рождалась новая НЕЗАВИСИМАЯ семья на
 * шестьдесят дней.
 *
 * Так суточный пропуск превращался в двухмесячный во множестве несвязанных
 * копий. Практическое последствие видно на «Выйти»: гасится семья того, кто
 * вышел, а семья, заведённая той же строкой в другом месте, продолжает жить.
 *
 * Одноразовость здесь была бы ошибкой того же рода, что гашение семьи за гонку
 * вкладок: initData выдаётся на ЗАПУСК, а входов внутри запуска может быть
 * больше одного. Поэтому проверяется не «нельзя дважды», а «дважды — то же
 * самое».
 */

const ТОКЕН = '111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

function подписать(поля: Record<string, string>): string {
  const строка = Object.entries(поля)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const секрет = crypto
    .createHmac('sha256', 'WebAppData')
    .update(ТОКЕН)
    .digest()
  const p = new URLSearchParams(поля)
  p.set(
    'hash',
    crypto.createHmac('sha256', секрет).update(строка).digest('hex')
  )
  return p.toString()
}

interface Сессия {
  id: string
  familyId: string
  revoked: boolean
}
interface Отображение {
  hash: string
  familyId: string
  sessionId: string
}

const сессии: Сессия[] = []
const токены: { hash: string; familyId: string; sessionId: string }[] = []
const запуски: Отображение[] = []

function пул() {
  return {
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] }
      if (/^(CREATE|ALTER)/.test(s)) return { rows: [] }

      if (s.startsWith('SELECT f.family_id, f.session_id')) {
        /*
         * Условия берём ИЗ ЗАПРОСА, а не повторяем своими словами.
         *
         * Подделка, которая держит собственную копию WHERE, зеленеет и тогда,
         * когда условие из настоящего кода убрали: именно так в этом проекте
         * однажды выжила удалённая одноразовость кода спаривания.
         */
        const учитываетОтзыв = s.includes('revoked_at IS NULL')
        const строка = запуски.find(z => z.hash === String(params[0]))
        if (!строка) return { rows: [] }
        const сессия = сессии.find(c => c.id === строка.sessionId)
        if (!сессия) return { rows: [] }
        if (учитываетОтзыв && сессия.revoked) return { rows: [] }
        return {
          rows: [{ family_id: строка.familyId, session_id: строка.sessionId }],
        }
      }
      if (s.startsWith('INSERT INTO app_sessions')) {
        сессии.push({
          id: String(params[0]),
          familyId: String(params[4]),
          revoked: false,
        })
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO app_refresh_tokens')) {
        токены.push({
          hash: String(params[0]),
          familyId: String(params[1]),
          sessionId: String(params[2]),
        })
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO app_launch_families')) {
        const было = запуски.find(z => z.hash === String(params[0]))
        const новая = {
          hash: String(params[0]),
          familyId: String(params[2]),
          sessionId: String(params[3]),
        }
        if (было) {
          // ON CONFLICT DO UPDATE — перезапись, а не молчание.
          если(s.includes('DO UPDATE'), () => Object.assign(было, новая))
        } else {
          запуски.push(новая)
        }
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
}

/** Крошечный помощник, чтобы условие в подделке читалось как условие. */
function если(да: boolean, дело: () => void) {
  if (да) дело()
}

// The shared harness: the same request and response double the other route
// tests use. The address stays unique per call -- anything throttling must
// not see two unrelated calls as one client.
const запрос = (путь: string, тело: unknown) =>
  routeRequest(путь, тело, { from: `10.0.0.${сессии.length + 1}` })

const ответ = routeResponse

describe('вход по initData: одна строка — одна семья', () => {
  let handleAuthRoute: typeof import('./session-routes').handleAuthRoute

  beforeEach(async () => {
    сессии.length = 0
    токены.length = 0
    запуски.length = 0
    process.env.TELEGRAM_BOT_TOKEN = ТОКЕН
    process.env.SESSION_SIGNING_KEY ||= 'x'.repeat(48)
    vi.resetModules()
    const м = await import('./src/entry-throttle')
    м.забытьОкна()
    handleAuthRoute = (await import('./session-routes')).handleAuthRoute
  })

  const строкаЗапуска = (id: number, соль = '') =>
    подписать({
      user: JSON.stringify({ id, first_name: 'Тест' }),
      auth_date: String(Math.floor(Date.now() / 1000)),
      ...(соль ? { query_id: соль } : {}),
    })

  const войти = async (initData: string) => {
    const о = ответ()
    await handleAuthRoute(
      запрос('/api/auth/telegram', { init_data: initData }),
      о,
      пул as any
    )
    return о
  }

  it('первый вход заводит сессию, семью и запись о запуске', async () => {
    const о = await войти(строкаЗапуска(7001))
    expect(о.status, JSON.stringify(о.json)).toBe(200)
    expect(сессии).toHaveLength(1)
    expect(токены).toHaveLength(1)
    expect(запуски).toHaveLength(1)
  })

  it('ПОВТОР той же строки не заводит вторую семью', async () => {
    /*
     * Раньше здесь появлялась вторая сессия и вторая семья на шестьдесят дней,
     * ничем не связанная с первой. Строка живёт сутки — значит копий могло быть
     * сколько угодно.
     */
    const строка = строкаЗапуска(7002)
    expect((await войти(строка)).status).toBe(200)
    expect((await войти(строка)).status).toBe(200)

    expect(сессии, 'вторая сессия на ту же строку').toHaveLength(1)
    expect(запуски).toHaveLength(1)
    expect(токены).toHaveLength(2)
    expect(токены[0].familyId).toBe(токены[1].familyId)
    expect(токены[0].sessionId).toBe(токены[1].sessionId)
  })

  it('РАЗНЫЕ строки — разные семьи', async () => {
    // Иначе «одна семья» превратилась бы в «одна семья на всех», и выход
    // одного человека выбрасывал бы остальных.
    expect((await войти(строкаЗапуска(7003, 'a'))).status).toBe(200)
    expect((await войти(строкаЗапуска(7004, 'b'))).status).toBe(200)
    expect(сессии).toHaveLength(2)
    expect(токены[0].familyId).not.toBe(токены[1].familyId)
  })

  it('после отзыва сессии та же строка заводит НОВУЮ семью', async () => {
    /*
     * Иначе повторный вход по ещё действующей initData вернул бы токены к
     * погашенной семье — то есть мёртвые, и человек не смог бы войти до конца
     * суток. «Выйти» стало бы «выйти навсегда».
     */
    const строка = строкаЗапуска(7005)
    expect((await войти(строка)).status).toBe(200)
    const перваяСемья = токены[0].familyId
    сессии[0].revoked = true

    expect((await войти(строка)).status).toBe(200)
    expect(сессии).toHaveLength(2)
    expect(токены[1].familyId).not.toBe(перваяСемья)
    expect(запуски).toHaveLength(1)
    expect(запуски[0].familyId, 'отображение не переписано').toBe(
      токены[1].familyId
    )
  })
})
