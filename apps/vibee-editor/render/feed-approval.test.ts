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

  it('маршрут сверяется с ПУТЁМ, а не со всем адресом', () => {
    /*
     * Стояло `req.url === '/api/feed/pending'`, а `req.url` несёт и строку
     * запроса. Любой параметр — и сравнение мимо, запрос проваливался к
     * общему сторожу ленты и получал «лента такого не обслуживает». Маршрут
     * был не сломан, а НЕДОСТИЖИМ по части обращений.
     *
     * Нашлось живой проверкой цепочки, а не чтением: веб зовёт без
     * параметров и работал.
     */
    expect(СЕРВЕР).toContain(
      "(req.url || '').split('?')[0] === '/api/feed/pending'"
    )
    // Старую форму ищем как УСЛОВИЕ, а не как текст: она осталась в
    // комментарии рядом, и запрет на подстроку запретил бы объяснение.
    expect(СЕРВЕР).not.toMatch(/if \(req\.url === '\/api\/feed\/pending'/)
  })

  it('до раздела доходит и внутренний ключ с явным telegram_id', () => {
    // Иначе ни агент, ни проверка внутрь не попадают: пускала только подпись
    // мини-аппа. Приём тот же, что у DELETE /api/feed/:id рядом.
    const блок = СЕРВЕР.slice(
      СЕРВЕР.indexOf("'/api/feed/pending'"),
      СЕРВЕР.indexOf("req.url === '/api/feed/approve'")
    )
    expect(блок).toContain("внутренний.get('telegram_id')")
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
    /*
     * ОКНО ОГРАНИЧЕНО СВЕРХУ — БЕЗ ЭТОГО ПРОВЕРКА БЕССМЫСЛЕННА.
     *
     * Срез брался от начала маршрута и ДО КОНЦА ФАЙЛА: 135 КБ вместо полутора.
     * Та же строка `WHERE id = $1 AND telegram_id = $2` встречается ниже — в
     * мягком удалении `/api/feed/:id` и в `DELETE /api/assets`. Поэтому
     * удаление проверки владельца ИЗ ОДОБРЕНИЯ оставляло все 14 тестов
     * зелёными: совпадение находилось у соседа.
     *
     * А значит любой опознанный мог бы опубликовать в общую ленту чужой
     * неодобренный пост.
     *
     * Граница — следующий маршрут. Её саму тоже проверяем: если он
     * переедет, окно снова станет безразмерным, и об этом надо узнать здесь,
     * а не через полгода.
     */
    const начало = СЕРВЕР.indexOf("req.url === '/api/feed/approve'")
    const конец = СЕРВЕР.indexOf("'/api/feed/publish'", начало)
    expect(начало, 'маршрут одобрения не найден').toBeGreaterThan(-1)
    expect(конец, 'граница окна не найдена — срез снова до конца файла').toBeGreaterThan(начало)
    const блок = СЕРВЕР.slice(начало, конец)
    // `telegram_id = $2` в условии, а не проверка после выборки: иначе чужой
    // пост открывался бы по номеру.
    expect(блок).toMatch(/WHERE id = \$1 AND telegram_id = \$2/)
  })
})

describe('лента показывает шаблоны, а не каждую генерацию', () => {
  it('берётся одна запись на композицию', () => {
    /*
     * Замер по живой ленте: 47 записей — это ТРИ композиции
     * (TrinityBlogReel 43, SplitTalkingHead 2, NoirReel 1) и одна без
     * композиции. Сорок три карточки подряд были одним шаблоном с разным
     * текстом — витрина обещала разнообразие, которого нет.
     */
    expect(СЕРВЕР).toMatch(/pt\.id = \(\s*\n\s*SELECT MAX\(p2\.id\) FROM public_templates p2/)
    expect(СЕРВЕР).toMatch(/p2\.template_settings->>'compositionId'/)
  })

  it('записи без композиции остаются собой', () => {
    // Сгруппировать их не по чему, а спрятать — значит потерять.
    expect(СЕРВЕР).toMatch(/pt\.template_settings->>'compositionId' IS NULL/)
  })

  it('профиль отдаёт композицию, иначе группировать нечем', () => {
    expect(СЕРВЕР).toMatch(/pt\.template_settings->>'compositionId' AS composition_id/)
    expect(СЕРВЕР).toContain('compositionId: row.composition_id || null')
  })
})
