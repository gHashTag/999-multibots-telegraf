import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { isPublic } from './auth'
import type { IncomingMessage } from 'http'

/**
 * ОДОБРЕНИЕ ПЕРЕД ПУБЛИКАЦИЕЙ.
 *
 * В `public_templates` ведёт одна дверь — `/api/feed/publish`, и зовут её
 * двое: веб по нажатию человека и АГЕНТ сам. Владелец просил, чтобы
 * посторонние видели только одобренное, а разницы между вызывающими не было
 * никакой.
 *
 * Просто «публиковать скрыто» было нельзя: все чтения фильтруют
 * `is_public = TRUE`, и такой пост стал бы невидим И АВТОРУ — одобрять негде,
 * работа автопилота исчезает молча. Поэтому пара: скрытая публикация плюс
 * `GET /api/feed/pending`, единственное место, где своё скрытое видно.
 */
const СЕРВЕР = fs.readFileSync(
  path.join(__dirname, 'render-server.ts'),
  'utf8'
)
const ИНСТРУМЕНТЫ = fs.readFileSync(
  path.join(__dirname, 'src', 'agent', 'tools.ts'),
  'utf8'
)

const запрос = (url: string, method = 'GET') =>
  ({ url, method }) as unknown as IncomingMessage

describe('чужое неодобренное не читается по общему префиксу', () => {
  it('GET /api/feed/pending НЕ публичен', () => {
    /*
     * `PUBLIC_GET_PREFIXES` открывает ПРЕФИКС `/api/feed`, а не маршруты:
     * любой новый сосед становится открытым, и никто этого не выбирал.
     * Именно так под него попали свои неодобренные посты.
     */
    expect(isPublic(запрос('/api/feed/pending'))).toBe(false)
    expect(isPublic(запрос('/api/feed/pending?x=1'))).toBe(false)
  })

  it('сама лента при этом остаётся публичной на чтение', () => {
    // Исключение должно быть узким: лента сообщества и должна читаться без
    // ключа, иначе гость увидит пустой экран вместо витрины.
    expect(isPublic(запрос('/api/feed'))).toBe(true)
    expect(isPublic(запрос('/api/feed/trending'))).toBe(true)
  })

  it('запись в ленту не публична ни в каком виде', () => {
    expect(isPublic(запрос('/api/feed/publish', 'POST'))).toBe(false)
    expect(isPublic(запрос('/api/feed/approve', 'POST'))).toBe(false)
  })
})

describe('агент публикует скрыто, человек — видимо', () => {
  it('вызов агента просит скрытую публикацию', () => {
    expect(ИНСТРУМЕНТЫ).toMatch(/is_public: false,/)
  })

  it('видимость — параметр запроса, а не константа в SQL', () => {
    // Здесь стояло безусловное TRUE в обеих ветках upsert'а, и обе двери
    // вели в ленту одинаково.
    expect(СЕРВЕР).toContain('const видимость = data.is_public !== false')
    expect(СЕРВЕР).toMatch(/is_public = \$13,/)
    expect(СЕРВЕР).not.toMatch(/\$12, \$13, TRUE, 0, 0, 0\)/)
  })

  it('умолчание — видимо: прежние вызывающие поля не передают', () => {
    // Иначе правка молча спрятала бы посты, публикуемые нажатием человека.
    expect(СЕРВЕР).toMatch(/data\.is_public !== false/)
  })

  it('скрытый пост не уходит в Telegram-канал', () => {
    /*
     * Иначе одобрение не значило бы ничего: в ленте пусто, а подписчики
     * канала ролик уже увидели. Ждать должны ВСЕ витрины.
     */
    expect(СЕРВЕР).toMatch(/data\.post_to_telegram && data\.is_public !== false/)
  })

  it('«ждут одобрения» отдаёт ТОЛЬКО свои и только скрытые', () => {
    const блок = СЕРВЕР.slice(
      СЕРВЕР.indexOf("req.url === '/api/feed/pending'"),
      СЕРВЕР.indexOf("req.url === '/api/feed/approve'")
    )
    expect(блок).toContain('telegram_id = $1 AND is_public = FALSE')
    // Владелец из ПОДПИСИ, а не из строки запроса: иначе чужие черновики
    // читал бы кто угодно по номеру.
    expect(блок).toContain('chatIdentity(req, verifiedTelegramId(req))')
    expect(блок).not.toMatch(/url\.searchParams|query\.telegram_id/)
  })

  it('одобрить можно только СВОЙ пост', () => {
    const блок = СЕРВЕР.slice(СЕРВЕР.indexOf("req.url === '/api/feed/approve'"))
    // `telegram_id = $2` в условии, а не проверка после выборки: иначе чужой
    // пост открывался бы по номеру.
    expect(блок).toMatch(/WHERE id = \$1 AND telegram_id = \$2/)
  })
})
