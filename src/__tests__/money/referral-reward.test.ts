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
import { buildRewardPromise } from '@/scenes/inviteScene/rewardPromise'

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
    const fn = src.slice(src.indexOf('export function referralInvoiceId'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).not.toMatch(/Date\.now|Math\.random|uuid/i)
  })
})

describe('the invite scene promises only what is deliverable', () => {
  /**
   * This used to read the scene's SOURCE and match `bonus > 0 ?` with a regular
   * expression. Two things were wrong with that: it depended on where prettier
   * put a line break, and it would have passed on any rewrite that kept the
   * shape while losing the meaning. It broke on the change that added the
   * second side even though that change preserved the property exactly.
   *
   * The promise is now a pure function, so what gets checked is the text it
   * produces.
   */
  it('says nothing about stars while both rewards are off', () => {
    // The unconditional promise is where the whole story started.
    expect(
      buildRewardPromise({ isRu: true, inviterStars: 0, invitedStars: 0 })
    ).toBe('')
    expect(
      buildRewardPromise({ isRu: false, inviterStars: 0, invitedStars: 0 })
    ).toBe('')
  })

  it('names the real amount for each side that is on', () => {
    const both = buildRewardPromise({
      isRu: true,
      inviterStars: 60,
      invitedStars: 40,
    })
    expect(both).toContain('60')
    expect(both).toContain('40')

    // And a side that is off is not mentioned at all -- not with a zero, not
    // with a vague "bonus stars".
    const onlyInviter = buildRewardPromise({
      isRu: true,
      inviterStars: 60,
      invitedStars: 0,
    })
    expect(onlyInviter).toContain('60')
    expect(onlyInviter).not.toContain('друг получит')
  })

  it('leaves no stray blank line when only the second side is on', () => {
    // The sides switch on independently, so every combination has to read as a
    // message and not as a formatting accident.
    const onlyInvited = buildRewardPromise({
      isRu: true,
      inviterStars: 0,
      invitedStars: 40,
    })
    expect(onlyInvited.startsWith('\n\n')).toBe(true)
    expect(onlyInvited).not.toMatch(/\n\n\n/)
    expect(onlyInvited.trimEnd()).toBe(onlyInvited)
  })

  it('does not promise levels or exclusive features', () => {
    // Neither exists: `level` is zero for 2,351 profiles out of 2,354. Checked
    // on the scene itself, because that is where the old promise lived.
    const raw = fs.readFileSync('src/scenes/inviteScene/index.ts', 'utf8')
    const scene = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

    expect(scene).toMatch(/Пригласите друга/) // the parse found the text, cyrillic-ok
    expect(scene).not.toMatch(
      /Повышение уровня|Level up|эксклюзивным функциям|exclusive features/i
    )
  })

  it('is wired to the real switches, not to numbers of its own', () => {
    // The function is honest about whatever it is handed; the scene has to hand
    // it the constants the payment code reads. Nothing but the source can say
    // whether those two are the same numbers.
    const raw = fs.readFileSync('src/scenes/inviteScene/index.ts', 'utf8')
    expect(raw).toMatch(/inviterStars:\s*REFERRAL_BONUS_STARS/)
    expect(raw).toMatch(/invitedStars:\s*REFERRAL_INVITED_BONUS_STARS/)
  })
})
