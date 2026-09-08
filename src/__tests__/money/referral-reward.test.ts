/**
 * Награда за приглашение: выключена по умолчанию, не платится дважды,
 * и обещается ровно тогда, когда выплачивается.
 *
 * ЗАЧЕМ ЭТО ВООБЩЕ ПОЯВИЛОСЬ. Сцена приглашения годами обещала «бонусные
 * звёзды», «доступ к эксклюзивным функциям» и «повышение уровня». Проверено по
 * данным: наград за приглашение в реестре НЕТ НИ ОДНОЙ (17 136 платежей),
 * `level` равен нулю у 2351 профиля из 2354. Не выполнялась ни одна из трёх.
 *
 * При этом приглашения — единственный канал роста, который здесь работал:
 * 738 профилей из 2354 пришли по ссылке, 611 из них за один сентябрь 2025.
 * В августе 2026 — ноль.
 *
 * Тест стережёт три свойства:
 *   - размер награды не выдумывается кодом, а задаётся владельцем;
 *   - повтор не платит второй раз (номер счёта детерминированный, база
 *     уникальность соблюдает — docs/audit/money-map.md);
 *   - текст сцены обещает звёзды только когда награда включена.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'

const directPaymentProcessor = vi.fn()

vi.mock('@/core/supabase/directPayment', () => ({
  directPaymentProcessor: (...args: unknown[]) =>
    directPaymentProcessor(...args),
}))

import {
  rewardInviter,
  referralInvoiceId,
  REFERRAL_BONUS_STARS,
} from '@/core/referral/rewardInviter'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

beforeEach(() => {
  directPaymentProcessor.mockReset()
  directPaymentProcessor.mockResolvedValue({ success: true, payment_id: 1 })
})

describe('награда за приглашение', () => {
  it('по умолчанию выключена — деньги не уходят без решения владельца', () => {
    // Размер награды — не техническое решение. Пока владелец не назвал число,
    // выплаты нет.
    expect(REFERRAL_BONUS_STARS).toBe(0)
  })

  it('выключенная награда не доходит до начисления', async () => {
    const out = await rewardInviter({
      inviterTelegramId: '111',
      newUserTelegramId: '222',
      botName: 'test_bot',
    })
    expect(out).toEqual({ rewarded: false, reason: 'disabled' })
    expect(directPaymentProcessor).not.toHaveBeenCalled()
  })

  it('номер счёта одинаков при повторе той же пары', () => {
    // Главная защита от двойной выплаты: база не примет вторую строку с тем
    // же номером счёта. Если номер станет случайным, защита исчезнет молча.
    expect(referralInvoiceId('111', '222')).toBe(referralInvoiceId(111, 222))
    expect(referralInvoiceId('111', '222')).not.toBe(
      referralInvoiceId('111', '333')
    )
    expect(referralInvoiceId('111', '222')).not.toBe(
      referralInvoiceId('333', '222')
    )
  })

  it('номер счёта не содержит времени и случайности', () => {
    // Проверяем сам исходник: `Date.now()` или uuid здесь означали бы, что
    // повтор пройдёт как новая выплата.
    const src = fs.readFileSync('src/core/referral/rewardInviter.ts', 'utf8')
    const fn = sliceFrom(src, 'export function referralInvoiceId')
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).not.toMatch(/Date\.now|Math\.random|uuid/i)
  })
})

describe('текст сцены приглашения обещает только выполнимое', () => {
  const raw = fs.readFileSync('src/scenes/inviteScene/index.ts', 'utf8')
  // Комментарии человеку не показывают — а в них как раз перечислено то, чего
  // обещать нельзя. Сравнивать надо с кодом, а не с рассказом о нём.
  const scene = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('разбор находит текст — иначе тест пустой', () => {
    expect(scene).toMatch(/Пригласите друга/)
  })

  it('обещание звёзд стоит под условием включённой награды', () => {
    // Безусловное обещание — это то, с чего всё началось.
    expect(scene).toMatch(/REFERRAL_BONUS_STARS/)
    // \s* instead of a literal space: prettier wraps the long ternary, so
    // `bonus > 0 ?` becomes `bonus > 0\n  ? ...`. What is checked is the
    // condition, not how the formatter placed the line breaks.
    expect(scene).toMatch(/bonus > 0\s*\?/)
  })

  it('не обещает уровней и эксклюзивных функций', () => {
    // Ни того, ни другого не существует: level равен нулю у 2351 из 2354.
    expect(scene).not.toMatch(
      /Повышение уровня|Level up|эксклюзивным функциям|exclusive features/i
    )
  })
})
