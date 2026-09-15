import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseTokensPayload } from '@/handlers/paymentHandlers'

/**
 * КАССИР ПРИНИМАЕТ АПДЕЙТЫ КАК ВСЕ ОСТАЛЬНЫЕ БОТЫ.
 *
 * Инцидент 06.09.2026: @t27ai_bot не получал ни одного сообщения. В
 * src/index.ts стоял гвард: если у бота-кассира есть вебхук — вебхук не
 * удалять и polling НЕ запускать (иначе 409). Замысел верный: один бот — один
 * режим приёма.
 *
 * Чего замысел не учёл: вебхук, ради которого polling приносился в жертву,
 * был разрешён только на `pre_checkout_query`. Имя `successful_payment` —
 * поле внутри `message`, а не тип апдейта, и Telegram его молча выбрасывал.
 * Значит `message` не доставлялся НИКУДА: ни в вебхук, ни в очередь опроса.
 * Ни /start, ни меню, ни оплата клуба — она приходит именно внутри message.
 *
 * Проверка читает исходник, потому что сломана была не функция, а решение о
 * запуске: юнит-тест зовёт обработчики напрямую и такого не видит.
 */
const КОРЕНЬ = path.join(__dirname, '..', '..', '..')
const читать = (относительный: string) =>
  fs.readFileSync(path.join(КОРЕНЬ, относительный), 'utf8')

const ВХОД = читать('src/index.ts')

describe('ни один бот не остаётся без приёма апдейтов', () => {
  it('нет ветки, пропускающей запуск опроса для кассира', () => {
    /*
     * Закрепляется КОД, а не слова: рассказ о снятом гварде остаётся в
     * комментарии рядом с местом, где он стоял, и это ценная история. Красным
     * должно становиться возвращение поведения, а не упоминание о нём.
     *
     * `[CASHIER GUARD]` в квадратных скобках — строка того самого журнала,
     * которую печатал живой прод; чтение CASHIER_BOT_USERNAME — единственный
     * способ узнать, какого бота пропускать.
     */
    expect(ВХОД).not.toMatch(/\[CASHIER GUARD\]/)
    expect(ВХОД).not.toMatch(/process\.env\.CASHIER_BOT_USERNAME/)
  })

  it('вебхук по-прежнему удаляется перед опросом', () => {
    /*
     * Обратная сторона той же монеты: если вебхук кто-то поставит, опрос
     * упрётся в 409. Удаление на старте — единственное, что делает опрос
     * надёжным приёмником.
     */
    expect(ВХОД).toMatch(/if \(webhookInfo\.url\)/)
    expect(ВХОД).toContain('deleteWebhook({ drop_pending_updates: true })')
  })
})

describe('оплата не может быть съедена сценой', () => {
  /*
   * РИСК, СОЗДАННЫЙ ПЕРЕХОДОМ НА ОПРОС.
   *
   * Под вебхуком оплата вообще не входила в цепочку middleware бота. Под
   * опросом входит — и приезжает ВНУТРИ `message`. Десятки шагов сцен
   * устроены как «нет текста — ответить и `return`», без next(). Человек,
   * пополняющий баланс, сидит ровно в такой сцене: его оплата была бы съедена
   * шагом, деньги списаны, токены не начислены.
   */
  it('обработчики оплаты зарегистрированы ДО сцен', () => {
    const оплата = ВХОД.indexOf("bot.on('successful_payment'")
    const сцены = ВХОД.indexOf('registerCommands({ bot })')
    expect(оплата).toBeGreaterThan(0)
    expect(сцены).toBeGreaterThan(0)
    expect(оплата).toBeLessThan(сцены)
  })

  it('выход из сцены зовётся безопасно — до stage её ещё нет', () => {
    /*
     * Плата за перенос выше: `ctx.scene` появляется только после
     * stage.middleware(). Прямой `ctx.scene.leave()` в обработчике,
     * стоящем выше, уронил бы обработку оплаты исключением.
     */
    const обработчик = читать('src/handlers/paymentHandlers/index.ts')
    expect(обработчик).not.toContain('await ctx.scene.leave()')
    expect(обработчик).toContain('await ctx.scene?.leave?.()')
  })
})

describe('покупка токенов мини-приложения', () => {
  it('payload разбирается на сумму и получателя', () => {
    expect(parseTokensPayload('tokens:500:144022504')).toEqual({
      amount: 500,
      telegramId: '144022504',
      subscription: false,
    })
  })

  it('продление подписки зачисляется, а не пропадает', () => {
    /*
     * Telegram bills a subscription with an ordinary successful_payment every
     * thirty days: same payload, fresh charge id (SuccessfulPayment
     * .is_recurring). A parser that knew only `tokens:` would take the stars
     * every month and credit nothing -- which is why this case is here now
     * and not "some day".
     */
    expect(parseTokensPayload('subtokens:150:900000001')).toEqual({
      amount: 150,
      telegramId: '900000001',
      subscription: true,
    })
  })

  /**
   * WHICH KIND OF SALE IT WAS HAS TO REACH THE LEDGER.
   *
   * The ledger closes the invoice a payment belongs to, and person plus token
   * count cannot tell a monthly subscription from a single purchase of the
   * same size -- a person can hold both, because the seller offers both. The
   * parser above knows which one this is and the flag used to stop right
   * here: the call carried only charge, person and amount. Then paying for
   * one marked the other sold, and the seller stopped offering a
   * subscription to somebody who never took one.
   */
  it('вид оплаты доезжает до леджера вместе с деньгами', async () => {
    const sent: Array<Record<string, unknown>> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: { body: string }) => {
        sent.push(JSON.parse(init.body))
        return { json: async () => ({ ok: true, credited: true }) }
      })
    )
    const { postStarsCredit } = await import('@/handlers/paymentHandlers')
    await postStarsCredit({
      chargeId: 'ch_1',
      telegramId: '900000001',
      amount: 150,
      subscription: true,
    })
    expect(sent[0]).toMatchObject({
      chargeId: 'ch_1',
      telegramId: '900000001',
      amount: 150,
      subscription: true,
    })
    vi.unstubAllGlobals()
  })

  it('чужие форматы не притворяются покупкой токенов', () => {
    // Клубный и тарифный payload обязаны идти своими ветками: иначе оплата
    // клуба ушла бы зачислением токенов в другую базу.
    expect(parseTokensPayload('foundry-bronze_12499_1757000000')).toBeNull()
    expect(parseTokensPayload('neurophoto')).toBeNull()
  })

  it('нулевая и отрицательная сумма отвергаются', () => {
    expect(parseTokensPayload('tokens:0:144022504')).toBeNull()
    expect(parseTokensPayload('tokens:-5:144022504')).toBeNull()
    expect(parseTokensPayload('subtokens:0:144022504')).toBeNull()
    // The prefix is a prefix, not a substring: nothing else may borrow it.
    expect(parseTokensPayload('mysubtokens:5:1')).toBeNull()
  })

  it('ветка tokens: стоит ДО общего разбора тарифов', () => {
    /*
     * Тот же порядок, что у клубной ветки, и по той же причине: `parts[0]` не
     * найдётся в paymentOptionsPlans, и покупка токенов молча записалась бы
     * пополнением баланса — в Supabase вместо базы рендера, то есть человек
     * заплатил бы, а в мини-приложении осталось бы ноль.
     */
    const обработчик = читать('src/handlers/paymentHandlers/index.ts')
    const токены = обработчик.indexOf('const токены = payload ?')
    const клуб = обработчик.indexOf("payload?.startsWith('foundry-')")
    const планы = обработчик.indexOf('paymentOptionsPlans[')
    expect(токены).toBeGreaterThan(0)
    expect(токены).toBeLessThan(клуб)
    if (планы > 0) expect(токены).toBeLessThan(планы)
  })

  it('зачисление идёт с ключом и с chargeId', () => {
    /*
     * Ключ — аутентификация служебного маршрута рендера (тот же X-Api-Key,
     * которым уже ходит postStarPaid). chargeId — идемпотентность: без него
     * повторная доставка одного платежа начислила бы токены дважды.
     */
    const обработчик = читать('src/handlers/paymentHandlers/index.ts')
    expect(обработчик).toContain("'X-Api-Key': process.env.RENDER_API_KEY")
    expect(обработчик).toContain('/api/stars/credit')
    expect(обработчик).toMatch(/chargeId: telegramPaymentChargeId/)
  })
})
