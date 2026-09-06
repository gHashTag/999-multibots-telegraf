import { describe, it, expect, vi, beforeEach } from 'vitest'
import md5 from 'md5'

/**
 * ПРИЁМ ДЕНЕГ НЕ ИСПОЛНЯЛСЯ НИ ОДНИМ ТЕСТОМ.
 *
 * Найдено 07.09.2026 замером, а не по памяти.
 *
 * Вокруг вебхука Робокассы есть тесты, и много:
 *
 *   `robokassaWebhook.test.ts` — 32 штуки, и НИ ОДНА не импортирует маршрут:
 *     файл держит собственную копию логики и проверяет её;
 *   `robokassa-claim-once`, `robokassa-order`, `creditWebhookAuthenticated`,
 *   `mountOrder` — читают ИСХОДНЫЙ ТЕКСТ маршрута и проверяют форму:
 *     «отметка стоит до начисления», «перед начислением есть гвард»,
 *     «публичные вебхуки смонтированы раньше ключевых».
 *
 * Форма — не поведение. Переделка, сохранившая форму и сломавшая работу,
 * проходила бы всё это насквозь. Здесь запускается НАСТОЯЩИЙ обработчик,
 * снятый с настоящего роутера, — то есть проверяется и проводка тоже.
 *
 * Главное здесь — второй тест: ПОДДЕЛЬНАЯ ПОДПИСЬ НЕ НАЧИСЛЯЕТ. Всё остальное
 * в этом файле служит ему: если начисление не происходит и при верной подписи,
 * «не начислило при поддельной» ничего не доказывает.
 */

const ПАРОЛЬ = 'пароль2-для-проверки' // secret-guard-ok: literal test placeholder

const supabase = vi.hoisted(() => ({
  getPaymentByInvId: vi.fn(),
  updateUserBalance: vi.fn(),
  notifyBotOwners: vi.fn(),
  supabaseAdmin: {
    from: vi.fn(() => supabase.supabaseAdmin),
    update: vi.fn(() => supabase.supabaseAdmin),
    eq: vi.fn(() => supabase.supabaseAdmin),
    select: vi.fn(async () => ({ data: [{ id: 1 }], error: null })),
  } as any,
}))

vi.mock('@/core/supabase/payments', () => ({
  getPaymentByInvId: supabase.getPaymentByInvId,
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: supabase.updateUserBalance,
}))
vi.mock('@/core/supabase/notifyBotOwners', () => ({
  notifyBotOwners: supabase.notifyBotOwners,
}))
vi.mock('@/core/supabase', () => ({
  supabaseAdmin: supabase.supabaseAdmin,
  getPaymentByInvId: supabase.getPaymentByInvId,
}))
vi.mock('@/core/bot', () => ({
  getBotByName: vi.fn(async () => ({
    bot: { telegram: { sendMessage: vi.fn(async () => undefined) } },
  })),
}))

import router from '@/api_server/routes/robokassa.routes'

/** Снимаем обработчик С НАСТОЯЩЕГО роутера: так проверяется и проводка. */
function обработчик(путь: string) {
  const слои = (router as any).stack as any[]
  const слой = слои.find(
    l => l.route?.path === путь && l.route?.methods?.post
  )
  expect(слой, `маршрут ${путь} не найден на роутере`).toBeTruthy()
  const шаги = слой.route.stack.map((s: any) => s.handle)
  // Последний шаг — сам обработчик; перед ним разбор тела, который в тесте
  // не нужен: тело подставляется готовым.
  return шаги[шаги.length - 1]
}

function ответ() {
  const о: any = {
    код: 0,
    тело: '',
    status(c: number) {
      о.код = c
      return о
    }, // cyrillic-ok
    send(t: unknown) {
      о.тело = String(t)
      return о
    }, // cyrillic-ok
    json(t: unknown) {
      о.тело = JSON.stringify(t)
      return о
    }, // cyrillic-ok
  }
  return о
}

const подпись = (сумма: string, счёт: string, пароль = ПАРОЛЬ) =>
  md5(`${сумма}:${счёт}:${пароль}`).toUpperCase()

function запрос(тело: Record<string, unknown>) {
  return {
    body: тело,
    headers: {},
    query: {},
    originalUrl: '/api/payment-success',
    method: 'POST',
    ip: '127.0.0.1',
  } as any
}

describe('вебхук Робокассы: поведение, а не форма', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ROBOKASSA_PASSWORD_2 = ПАРОЛЬ
    supabase.getPaymentByInvId.mockResolvedValue({
      data: {
        id: 1,
        inv_id: '777',
        telegram_id: '4242',
        stars: 100,
        amount: 1000,
        status: 'PENDING',
        bot_name: 'тест_бот',
        subscription_type: null,
      },
      error: null,
    })
    supabase.updateUserBalance.mockResolvedValue(true)
    supabase.supabaseAdmin.select.mockResolvedValue({
      data: [{ id: 1 }],
      error: null,
    })
  })

  it('верная подпись — деньги зачисляются', async () => {
    // Опорный тест. Без него «поддельная не зачисляет» ничего не значит:
    // не зачисляет вообще ничего и никогда — тоже проходит.
    const о = ответ()
    await обработчик('/payment-success')(
      запрос({ OutSum: '1000', InvId: '777', SignatureValue: подпись('1000', '777') }),
      о
    )
    expect(о.код === 0 || о.код === 200, `ответ ${о.код}: ${о.тело}`).toBe(true)
    expect(supabase.updateUserBalance).toHaveBeenCalled()
  })

  it('ПОДДЕЛЬНАЯ ПОДПИСЬ НЕ ЗАЧИСЛЯЕТ И ПОЛУЧАЕТ 400', async () => {
    /*
     * Ради этой строки существует весь файл. Подпись — единственное, что
     * отделяет «Робокасса подтвердила оплату» от «кто угодно постучался в
     * открытый вебхук»: маршрут публичный по необходимости.
     */
    const о = ответ()
    await обработчик('/payment-success')(
      запрос({
        OutSum: '1000',
        InvId: '777',
        SignatureValue: подпись('1000', '777', 'не-тот-пароль'),
      }),
      о
    )
    expect(о.код).toBe(400)
    expect(о.тело).toContain('signature')
    expect(supabase.updateUserBalance).not.toHaveBeenCalled()
  })

  it('подпись от ДРУГОЙ суммы не подходит', async () => {
    // Иначе подписью со счёта на 100 рублей закрывался бы счёт на 100 000.
    const о = ответ()
    await обработчик('/payment-success')(
      запрос({
        OutSum: '100000',
        InvId: '777',
        SignatureValue: подпись('1000', '777'),
      }),
      о
    )
    expect(о.код).toBe(400)
    expect(supabase.updateUserBalance).not.toHaveBeenCalled()
  })

  it('без подписи — 400 и ни одного начисления', async () => {
    const о = ответ()
    await обработчик('/payment-success')(
      запрос({ OutSum: '1000', InvId: '777' }),
      о
    )
    expect(о.код).toBe(400)
    expect(supabase.updateUserBalance).not.toHaveBeenCalled()
  })

  it('неизвестный счёт — 404 и ни одного начисления', async () => {
    supabase.getPaymentByInvId.mockResolvedValue({ data: null, error: null })
    const о = ответ()
    await обработчик('/payment-success')(
      запрос({ OutSum: '1000', InvId: '999', SignatureValue: подпись('1000', '999') }),
      о
    )
    expect(о.код).toBe(404)
    expect(supabase.updateUserBalance).not.toHaveBeenCalled()
  })

  it('СТАРЫЙ адрес защищён так же, как новый', async () => {
    /*
     * Сравнивать тождество функций бессмысленно: у каждого маршрута своя
     * обёртка вокруг общего обработчика, и `toBe` падает на разных стрелках,
     * ничего не говоря о защите. Проверяется СВОЙСТВО.
     *
     * Робокасса настроена на один адрес, а правки исторически шли во второй.
     * Открытый старый вход, потерявший проверку подписи, — это бесплатные
     * деньги, и заметить это можно только спросив у него самого.
     */
    const о = ответ()
    await обработчик('/robokassa-result')(
      запрос({
        OutSum: '1000',
        InvId: '777',
        SignatureValue: подпись('1000', '777', 'не-тот-пароль'),
      }),
      о
    )
    expect(о.код).toBe(400)
    expect(supabase.updateUserBalance).not.toHaveBeenCalled()

    const о2 = ответ()
    await обработчик('/robokassa-result')(
      запрос({ OutSum: '1000', InvId: '777', SignatureValue: подпись('1000', '777') }),
      о2
    )
    expect(supabase.updateUserBalance).toHaveBeenCalled()
  })
})
