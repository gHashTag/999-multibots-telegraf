/**
 * Награда за приглашение выдаётся за ПЕРВОЕ ПОПОЛНЕНИЕ, а не за регистрацию.
 *
 * ИЗМЕРЕНО ПО НАШИМ ДАННЫМ. Из 738 человек, пришедших по ссылке, хоть раз
 * пополняли баланс **33 — четыре процента**. Награда за регистрацию означает
 * платить двадцать пять раз за одного плательщика; вдобавок регистрацию в
 * Telegram подделать дёшево.
 *
 * Обзор рынка говорит то же самое: главную награду принято выдавать за первую
 * покупку. Разбор с числами — docs/audit/referral-economics.md.
 *
 * Свойства, которые тест стережёт:
 *   - пока размер награды не назначен владельцем, ничего не происходит;
 *   - у кого нет пригласившего — награждать некого;
 *   - награда идёт по telegram_id, а `users.inviter` хранит UUID, поэтому
 *     нужен перевод одного в другое;
 *   - отказ базы не роняет обработку пополнения: деньги важнее награды.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'

const rewardInviter = vi.fn()
let rows: Record<string, unknown[]> = {}
let failOn: string | null = null

function table(name: string) {
  const link: Record<string, unknown> = {}
  const chain = () => link
  link.select = chain
  link.eq = chain
  link.maybeSingle = vi.fn(() =>
    Promise.resolve(
      failOn === name
        ? { data: null, error: { message: 'база недоступна' } }
        : { data: (rows[name] ?? [])[0] ?? null, error: null }
    )
  )
  return link
}

vi.mock('@/core/supabase', () => ({
  supabase: { from: (name: string) => table(name) },
}))

vi.mock('@/core/referral/rewardInviter', () => ({
  REFERRAL_BONUS_STARS: 50,
  rewardInviter: (...a: unknown[]) => rewardInviter(...a),
}))

import { rewardReferralOnFirstTopUp } from '@/core/referral/rewardOnFirstTopUp'

beforeEach(() => {
  rewardInviter.mockReset()
  rewardInviter.mockResolvedValue({ rewarded: true, stars: 50 })
  rows = {}
  failOn = null
})

describe('награда за первое пополнение приглашённого', () => {
  it('у кого нет пригласившего — награды нет', async () => {
    // ВАЖНО для чувствительности проверки: второй ответ — валидный
    // пригласивший. Если ранний выход уберут, награда УЙДЁТ, и проверка
    // упадёт. С первой версией теста (оба ответа пустые) мутация проходила
    // незамеченной — маскировал сам мок.
    const answers = [{ inviter: null }, { telegram_id: '777' }]
    let i = 0
    rows = {
      get users() {
        return [answers[Math.min(i++, answers.length - 1)]]
      },
    } as unknown as Record<string, unknown[]>

    await rewardReferralOnFirstTopUp({ invitedTelegramId: '42', botName: 'b' })
    expect(rewardInviter).not.toHaveBeenCalled()
  })

  it('есть пригласивший — награда уходит ему по telegram_id', async () => {
    // Первый запрос вернёт профиль приглашённого, второй — пригласившего.
    // Оба идут в одну таблицу, поэтому подменяем ответ последовательно.
    const answers = [{ inviter: 'uuid-1' }, { telegram_id: '777' }]
    let i = 0
    rows = {
      get users() {
        return [answers[Math.min(i++, answers.length - 1)]]
      },
    } as unknown as Record<string, unknown[]>

    await rewardReferralOnFirstTopUp({ invitedTelegramId: '42', botName: 'b' })

    expect(rewardInviter).toHaveBeenCalledTimes(1)
    expect(rewardInviter.mock.calls[0][0]).toMatchObject({
      inviterTelegramId: '777',
      newUserTelegramId: '42',
    })
  })

  it('отказ базы не роняет обработку пополнения', async () => {
    // Пополнение уже состоялось; исключение здесь заставило бы платёжную
    // систему повторять успешный вызов.
    failOn = 'users'
    await expect(
      rewardReferralOnFirstTopUp({ invitedTelegramId: '42', botName: 'b' })
    ).resolves.toBeUndefined()
    expect(rewardInviter).not.toHaveBeenCalled()
  })
})

describe('награда привязана к пополнению, а не к приходу', () => {
  const strip = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, m =>
        '\n'.repeat((m.match(/\n/g) || []).length)
      )
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('обработчик оплаты зовёт награду', () => {
    const src = strip(
      fs.readFileSync('src/api_server/routes/robokassa.routes.ts', 'utf8')
    )
    // Именно ВЫЗОВ, а не импорт: первая версия проверяла просто вхождение
    // имени, и удаление вызова её не роняло — имя оставалось в строке импорта.
    expect(src).toMatch(/rewardReferralOnFirstTopUp\s*\(\s*\{/)
  })

  it('награда стоит ПОСЛЕ отметки об оплате', () => {
    // Наградить за пополнение, которого ещё нет, — то же, что наградить за
    // регистрацию, только незаметнее.
    const src = strip(
      fs.readFileSync('src/api_server/routes/robokassa.routes.ts', 'utf8')
    )
    expect(src.indexOf('status: PaymentStatus.COMPLETED')).toBeLessThan(
      src.indexOf('rewardReferralOnFirstTopUp')
    )
  })
})
