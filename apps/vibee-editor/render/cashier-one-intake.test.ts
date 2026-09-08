import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { isPublic, authenticate } from './auth'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

/**
 * ОДИН ПРИЁМНИК АПДЕЙТОВ НА БОТА — И ЭТО ОПРОС.
 *
 * Инцидент 06.09.2026: @t27ai_bot не получал НИ ОДНОГО сообщения. Причина
 * складывалась из четырёх решений, каждое из которых по отдельности выглядело
 * разумным:
 *
 *  1. Рендер каждые 10 минут ставил боту вебхук (самовосстановление).
 *  2. Ставил с `allowed_updates: ['pre_checkout_query', 'successful_payment']`,
 *     а `successful_payment` — не тип апдейта, а поле внутри `message`;
 *     Telegram молча выбрасывал его, оставляя один pre_checkout_query.
 *  3. Пока вебхук стоит, getUpdates отвечает 409 — опрос невозможен.
 *  4. Сервис бота, видя вебхук, опрос для этого бота не запускал (CASHIER
 *     GUARD), поэтому запасного пути не было.
 *
 * `message` не доставлялся никуда: ни в вебхук, ни в очередь опроса. Ни одного
 * теста при этом не покраснело — все они проверяли ФУНКЦИИ, а сломана была
 * ПРОВОДКА между сервисами. Поэтому проверки ниже читают исходники.
 */
const читать = (имя: string) =>
  fs.readFileSync(path.join(__dirname, имя), 'utf8')

const СЕРВЕР = читать('render-server.ts')

describe('рендер не ставит вебхук боту', () => {
  it('в render-server.ts нет ни одного вызова setWebhook', () => {
    /*
     * Ровно этот вызов, повторяемый по таймеру, круглосуточно возвращал
     * систему в состояние «бот молчит». Приём апдейтов принадлежит сервису
     * бота; два сервиса, распоряжающихся одним вебхуком, — это и был спор,
     * который породил инцидент.
     */
    expect(СЕРВЕР).not.toMatch(/api\.telegram\.org\/bot\$\{[^}]*\}\/setWebhook/)
    expect(СЕРВЕР).not.toContain('/setWebhook')
  })

  it('нет периодического восстановления вебхука', () => {
    expect(СЕРВЕР).not.toContain('rehook')
  })
})

describe('служебный маршрут зачисления звёзд', () => {
  it('закрыт общим гвардом — без ключа он не публичен', () => {
    /*
     * Предыдущий приёмник оплат аутентифицировался секретом в ПУТИ и был не
     * внесён в публичные списки, поэтому Telegram получал от гварда 401 и до
     * обработчика не доходил вовсе. Здесь наоборот: вызывающий свой (бот), у
     * него есть X-Api-Key, и маршрут обязан оставаться непубличным.
     */
    const запрос = (method: string) =>
      ({
        url: '/api/stars/credit',
        method,
        headers: {},
      }) as any
    expect(isPublic(запрос('POST'))).toBe(false)
    expect(isPublic(запрос('GET'))).toBe(false)
  })

  it('сверяется с ПУТЁМ, а не с полным адресом', () => {
    /*
     * Урок соседнего дефекта (#2066): `/api/feed/pending` сверялся с
     * `req.url`, который несёт строку запроса, и любой параметр уводил запрос
     * в чужой обработчик. Здесь путь отделяется явно.
     */
    expect(СЕРВЕР).toContain(
      "const путьЗачисления = (req.url || '').split('?')[0]"
    )
    expect(СЕРВЕР).toContain("путьЗачисления === '/api/stars/credit'")
  })

  it('передаёт chargeId — на нём держится идемпотентность', () => {
    /*
     * creditStarsPayment вставляет charge_id первичным ключом и зачисляет
     * только при первой вставке. Потеряв chargeId, повтор вызова начислил бы
     * токены второй раз — а повтор возможен: бот может перезапуститься между
     * зачислением и фиксацией offset опроса.
     */
    const блок = СЕРВЕР.slice(
      СЕРВЕР.indexOf("путьЗачисления === '/api/stars/credit'"),
      СЕРВЕР.indexOf("путьЗачисления === '/api/stars/credit'") + 6000
    )
    expect(блок).toContain("const chargeId = String(тело.chargeId || '')")
    expect(блок).toMatch(/creditStarsPayment\(pool, \{\s*chargeId,/)
  })

  it('кривое тело получает 400, а не молчаливое «ок»', () => {
    /*
     * Прежний обработчик отвечал 200 на что угодно, потому что Telegram
     * повторяет доставку на любой не-200. Вызывающий теперь свой, и 200 на
     * нераспознанное тело означал бы потерянную оплату без следа.
     */
    const блок = СЕРВЕР.slice(
      СЕРВЕР.indexOf("путьЗачисления === '/api/stars/credit'"),
      СЕРВЕР.indexOf("путьЗачисления === '/api/stars/credit'") + 6000
    )
    expect(блок).toContain('res.writeHead(400')
  })
})

describe('зачисление нельзя вызвать от имени пользователя', () => {
  /*
   * ДЫРУ ОТКРЫЛА ПРЕДЫДУЩАЯ ПРАВКА ЭТОГО ЖЕ ФАЙЛА, и нашло её ревью через час
   * после выкладки.
   *
   * Маршрут закрывался ТОЛЬКО общим гвардом. Гвард отвечает «пускать ли» и
   * говорит «да» пяти способам, включая подпись мини-аппа — а она есть у
   * КАЖДОГО, кто открыл приложение. Маршрут при этом берёт сумму и получателя
   * из тела запроса. То есть любой пользователь мог прислать
   * {"amount": 999999} и получить токены, за которыми стоят реальные счета
   * провайдеров.
   *
   * «Опознан» и «наш сервер» — разные вопросы. Здесь нужен второй.
   */
  it('маршрут требует именно ключ сервера, а не любую опознанную личность', () => {
    const блок = СЕРВЕР.slice(
      СЕРВЕР.indexOf("путьЗачисления === '/api/stars/credit'"),
      СЕРВЕР.indexOf("путьЗачисления === '/api/stars/credit'") + 6000
    )
    expect(блок).toContain("authenticate(req).via !== 'api-key'")
    expect(блок).toContain('res.writeHead(403')
  })

  it('гвард действительно различает ключ сервера и прочие способы', () => {
    // Поведенческая половина: проверка выше закрепляет, что маршрут смотрит на
    // `via`, а эта — что `via` не равно 'api-key' для чужого ключа.
    const прежний = process.env.RENDER_API_KEY
    process.env.RENDER_API_KEY = 'верный-ключ-для-проверки'
    try {
      const запрос = (ключ?: string) =>
        ({
          url: '/api/stars/credit',
          method: 'POST',
          headers: ключ ? { 'x-api-key': ключ } : {},
        }) as any
      expect(authenticate(запрос('верный-ключ-для-проверки')).via).toBe(
        'api-key'
      )
      expect(authenticate(запрос('чужой-ключ')).via).not.toBe('api-key')
      expect(authenticate(запрос()).via).not.toBe('api-key')
    } finally {
      process.env.RENDER_API_KEY = прежний
    }
  })

  it('пустой chargeId отвергается, а не зачисляется без дедупликации', () => {
    /*
     * creditStarsPayment без ключа идёт веткой «credited without dedup» —
     * то есть повтор начислит второй раз. Молча принимать пустой ключ значит
     * отключать защиту, ради которой он и заведён.
     */
    const блок = СЕРВЕР.slice(
      СЕРВЕР.indexOf("путьЗачисления === '/api/stars/credit'"),
      СЕРВЕР.indexOf("путьЗачисления === '/api/stars/credit'") + 6000
    )
    expect(блок).toContain('!(amount > 0) || !tid || !chargeId')
  })
})

describe('два пути зачисления — один замок', () => {
  it('verify зачисляет через creditStarsPayment, а не своим INSERT', () => {
    /*
     * ДВОЙНОЕ ЗАЧИСЛЕНИЕ НА ПЕРВОЙ ЖЕ ПРОДАЖЕ.
     *
     * verify запирался на `token_invoices.redeemed`, путь бота — на
     * `star_payments.charge_id`. Общего ключа нет, а зовутся оба наверняка:
     * мини-апп дёргает verify сразу по `status === 'paid'`, боту тот же платёж
     * приезжает опросом. Пакет на 10 токенов начислил бы 20.
     *
     * Дефект был спящим, пока приём апдейтов не работал. Починка приёма его
     * разбудила бы — поэтому оба пути сведены к одной функции с одним замком.
     */
    /*
     * THE ANCHOR STOPPED EXISTING AND THE TEST DID NOT SAY SO.
     *
     * This was `slice(indexOf('UPDATE token_invoices SET redeemed'))`. #2226
     * reformatted that SQL so `UPDATE token_invoices` and `SET redeemed` landed
     * on separate lines; indexOf returned -1 and slice(-1) returned THE LAST
     * CHARACTER of the file. Production is fine -- only the anchor was gone,
     * and the gate went red on a clean tree.
     *
     * The other direction would have been worse: a NEGATIVE assertion over that
     * same '\n' passes vacuously and for ever. So a missing anchor is now a
     * loud error naming the anchor, not an empty string.
     */
    const доКонцаВетки = sliceFrom(СЕРВЕР, 'SET redeemed = TRUE', 2500)
    expect(доКонцаВетки).toContain('await creditStarsPayment(pool, {')
    expect(доКонцаВетки).toContain('chargeId: String(match.id)')
    // Свой INSERT в user_tokens в этой ветке остаться не должен.
    expect(доКонцаВетки).not.toContain('INSERT INTO user_tokens')
  })
})

describe('старый вебхук кассира убран целиком', () => {
  it('маршрут /api/telegram/stars-wh больше не обрабатывается', () => {
    // Затирание секрета в журнале (redact) остаётся: оно безвредно и полезно
    // для уже записанных логов. Убран именно ОБРАБОТЧИК.
    expect(СЕРВЕР).not.toContain('stars-wh/([a-zA-Z0-9_-]+)$')
  })

  it('оплата больше не читается с верхнего уровня апдейта', () => {
    /*
     * `upd.successful_payment` — поле, которого в Update не бывает: Telegram
     * кладёт оплату в `update.message.successful_payment`. Ветка зачисления не
     * сработала бы никогда, и это не поймал ни один тест.
     */
    // Закрепляется форма КОДА (условие и обращение к полю), а не упоминание:
    // рассказ о дефекте остаётся в комментарии рядом и должен там остаться.
    expect(СЕРВЕР).not.toContain('else if (upd.successful_payment)')
    expect(СЕРВЕР).not.toContain('upd.successful_payment.invoice_payload')
    expect(СЕРВЕР).not.toContain('upd.pre_checkout_query.id')
  })
})
