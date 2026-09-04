/**
 * Возврат за то, чего не платили, — это создание денег из воздуха.
 *
 * ИЗМЕРЕНО. Из 171 возврата в реестре у 126 (74%) НЕТ НИ ОДНОГО списания
 * перед ним. У людей, которые до возврата вообще ничего не тратили, так
 * появилось 974 звезды.
 *
 * ПОПРАВКА К ПРЕДЫДУЩЕЙ ИТЕРАЦИИ. Я прочитал эти же возвраты как след отказов
 * генерации, которые прогнали людей: «у 120 из 154 однодневок был возврат».
 * Это неверно. У большинства из них возврат — ПЕРВАЯ операция вообще, до
 * всякого списания; на неё же тут же и покупается единственная генерация.
 * Портрет «пришёл, потратил, ушёл» остаётся, объяснение «его прогнал отказ» —
 * снимается.
 *
 * ОТКУДА БЕРЁТСЯ. Ветка отказа зовёт возврат, не спрашивая, состоялось ли
 * списание. Частый случай — «недостаточно звёзд»: списания не было, генерации
 * не было, а возврат есть. В одном месте (generateFluxKontext) это заметили и
 * закрыли проверкой ТЕКСТА сообщения об ошибке — ненадёжно: достаточно
 * переписать формулировку. В остальных двадцати месте проверки нет вовсе.
 *
 * Проверка теперь одна на всех и внутри самого возврата.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'

const updateUserBalance = vi.fn()
let ledger: unknown[] = []
let queryError: { message: string } | null = null

/** Цепочка PostgREST: .select().eq().eq().gte().order().limit() */
function chain() {
  const link: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order']) link[m] = vi.fn(() => link)
  link.limit = vi.fn(() =>
    Promise.resolve({ data: queryError ? null : ledger, error: queryError })
  )
  return link
}

vi.mock('@/core/supabase', () => ({
  supabase: { from: () => chain() },
  getUserBalance: vi.fn(async () => 0),
  getReferalsCountAndUserData: vi.fn(async () => ({
    count: 0,
    subscriptionType: null,
    level: 0,
  })),
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: (...a: unknown[]) => updateUserBalance(...a),
  // refundUser credits through the *Unlocked impl inside withUserBalanceLock
  // (its check and credit must be atomic per user, #999). Same spy either way.
  updateUserBalanceUnlocked: (...a: unknown[]) => updateUserBalance(...a),
}))
vi.mock('@/navigation', () => ({ createMainMenuKeyboard: () => ({}) }))
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: () => true,
}))

const HELPER = 'src/price/helpers/refundUser.ts'
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const src = strip(fs.readFileSync(HELPER, 'utf8'))

describe('возврат требует состоявшегося списания', () => {
  it('разбор находит проверку — иначе тест пустой', () => {
    expect(src).toMatch(/hasChargeToRefund/)
  })

  it('проверка спрашивает данные, а не текст сообщения', () => {
    // Прежний охранник в generateFluxKontext сверялся со строкой
    // «Недостаточно звёзд», показанной человеку. Переписал текст — потерял
    // защиту.
    expect(src).toMatch(/from\('payments_v2'\)/)
    expect(src).toMatch(/MONEY_OUTCOME/)
    expect(src).not.toMatch(/Недостаточно звёзд/)
  })

  it('без списания возврат не выполняется', () => {
    expect(src).toMatch(/if \(!check\.allowed\)/)
    // Именно return, а не «залогировали и пошли дальше»: иначе проверка
    // становится украшением.
    const at = src.indexOf('if (!check.allowed)')
    const tail = src.slice(at, at + 300)
    expect(tail).toMatch(/return/)
    expect(tail.indexOf('return')).toBeLessThan(
      tail.indexOf('updateUserBalance') + 1 || 300
    )
  })

  it('нельзя вернуть больше, чем заплатили', () => {
    // Двойной возврат за одно списание — тот же воздух, только незаметнее.
    expect(src).toMatch(/alreadyReturned/)
    expect(src).toMatch(/alreadyReturned \+ amount >/)
  })

  it('check and credit run under one per-user lock (idempotent, #999)', () => {
    // Otherwise two concurrent cancels both pass hasChargeToRefund before
    // either credits, and both refund. The lock serializes them: the second
    // sees the first's refund and is rejected.
    const lock = src.indexOf('withUserBalanceLock(')
    const check = src.indexOf('hasChargeToRefund(telegramIdStr')
    const credit = src.indexOf('updateUserBalanceUnlocked(')
    expect(lock, 'refund не под withUserBalanceLock').toBeGreaterThan(-1)
    expect(lock).toBeLessThan(check) // both check and credit are INSIDE the lock
    expect(lock).toBeLessThan(credit)
  })

  it('проверка стоит ДО начисления', () => {
    // Проверка после начисления не защищает ни от чего.
    // The credit now runs through updateUserBalanceUnlocked inside the lock;
    // the invariant is unchanged — the eligibility check precedes the credit.
    expect(src.indexOf('hasChargeToRefund(telegramIdStr')).toBeLessThan(
      src.indexOf('updateUserBalanceUnlocked(')
    )
  })

  it('при сбое самой проверки возврат выполняется — и это записано в исходнике', () => {
    // Отказ ОТКРЫТЫЙ, в отличие от промо: не вернуть человеку его же деньги
    // хуже, чем ошибочно создать восемь звёзд. Асимметрия обратная, и она
    // должна быть видна в коде.
    expect(src).toMatch(/allowed: true, reason: `проверка не удалась/)
    expect(src).toMatch(/allowed: true,\s*\n?\s*reason: `проверка упала/)
    expect(src).toMatch(/возврат разрешён вслепую/)
  })
})

describe('поведение возврата', () => {
  const ctx = {
    from: { id: 555 },
    botInfo: { username: 'test_bot' },
    session: { mode: 'text_to_image' },
    reply: vi.fn(),
  } as any

  beforeEach(() => {
    updateUserBalance.mockReset()
    updateUserBalance.mockResolvedValue(true)
    ledger = []
    queryError = null
  })

  async function call(amount: number) {
    const { refundUser } = await import('@/price/helpers/refundUser')
    await refundUser(ctx, amount, { silent: true, reason: 'generation_failed' })
  }

  it('без списаний за сутки — деньги НЕ начисляются', async () => {
    // Ровно случай 126 строк из 171: возврат первой же операцией.
    await call(8)
    expect(updateUserBalance).not.toHaveBeenCalled()
  })

  it('есть списание — возврат проходит', async () => {
    // Страховка от самого себя: если бы проверка запрещала всё, тест выше
    // проходил бы и при полностью сломанном возврате.
    ledger = [
      {
        id: 1,
        stars: 8,
        type: 'MONEY_OUTCOME',
        payment_date: '2026-08-20T00:00:00Z',
      },
    ]
    await call(8)
    expect(updateUserBalance).toHaveBeenCalledTimes(1)
  })

  it('второй возврат за то же списание не проходит', async () => {
    ledger = [
      {
        id: 2,
        stars: 8,
        type: 'MONEY_INCOME',
        payment_date: '2026-08-20T00:00:05Z',
        description: 'Refund (generation_failed)',
      },
      {
        id: 1,
        stars: 8,
        type: 'MONEY_OUTCOME',
        payment_date: '2026-08-20T00:00:00Z',
      },
    ]
    await call(8)
    expect(updateUserBalance).not.toHaveBeenCalled()
  })

  it('второй возврат не проходит, если первый записан типом REFUND', async () => {
    // The aiCoverWizard shape: type REFUND, description not starting with
    // "Refund". The old check tested the DESCRIPTION only, so rows like this
    // were invisible: alreadyReturned came out zero and a second refund passed.
    ledger = [
      {
        id: 2,
        stars: 8,
        type: 'REFUND',
        payment_date: '2026-08-20T00:00:05Z',
        description: 'AI Cover refund - error',
      },
      {
        id: 1,
        stars: 8,
        type: 'MONEY_OUTCOME',
        payment_date: '2026-08-20T00:00:00Z',
      },
    ]
    await call(8)
    expect(updateUserBalance).not.toHaveBeenCalled()
  })

  it('второй возврат не проходит, если первый описан по-русски', async () => {
    // The musicGenerationWizard shape: type MONEY_INCOME, description written
    // in Russian.
    ledger = [
      {
        id: 2,
        stars: 8,
        type: 'MONEY_INCOME',
        payment_date: '2026-08-20T00:00:05Z',
        description: 'Возврат за неудачную генерацию музыки',
      },
      {
        id: 1,
        stars: 8,
        type: 'MONEY_OUTCOME',
        payment_date: '2026-08-20T00:00:00Z',
      },
    ]
    await call(8)
    expect(updateUserBalance).not.toHaveBeenCalled()
  })

  it('пополнение НЕ считается уже возвращённым', async () => {
    // The other direction: MONEY_INCOME is also how top-ups arrive. Counting
    // one as "already returned" would REFUSE a refund the user is owed, which
    // is harm, not safety.
    ledger = [
      {
        id: 2,
        stars: 500,
        type: 'MONEY_INCOME',
        payment_date: '2026-08-20T00:00:05Z',
        description: 'Пополнение баланса через Robokassa (InvId: 123)',
      },
      {
        id: 1,
        stars: 8,
        type: 'MONEY_OUTCOME',
        payment_date: '2026-08-20T00:00:00Z',
      },
    ]
    await call(8)
    expect(updateUserBalance).toHaveBeenCalled()
  })

  it('вернуть больше, чем заплатили, нельзя', async () => {
    ledger = [
      {
        id: 1,
        stars: 8,
        type: 'MONEY_OUTCOME',
        payment_date: '2026-08-20T00:00:00Z',
      },
    ]
    await call(100)
    expect(updateUserBalance).not.toHaveBeenCalled()
  })

  it('при сбое проверки возврат ВЫПОЛНЯЕТСЯ', async () => {
    // Отказ открытый: не вернуть человеку его же деньги хуже, чем ошибочно
    // создать восемь звёзд.
    queryError = { message: 'база недоступна' }
    await call(8)
    expect(updateUserBalance).toHaveBeenCalledTimes(1)
  })
})
