/**
 * Знак суммы в updateUserBalance.
 *
 * Тест написан ПОСЛЕ находки в данных, а не до: в payments_v2 лежат 114 строк
 * MONEY_OUTCOME с stars = -9. Балансовая функция считает income − outcome,
 * поэтому они не списали 1026 звёзд, а начислили. Формула проверена опытным
 * путём — scripts/probe-balance-formula.cjs.
 *
 * Проверяем не «как написано», а что именно уходит в insert: перехватываем
 * supabase и смотрим на записанную строку.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaymentType } from '@/interfaces/payments.interface'

const inserted: any[] = []

vi.mock('@/core/supabase', () => {
  const table = () => ({
    insert: (row: any) => {
      inserted.push(row)
      return Promise.resolve({ error: null })
    },
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: { telegram_id: 1 }, error: null }),
        single: () =>
          Promise.resolve({ data: { telegram_id: 1 }, error: null }),
      }),
    }),
  })
  // Баланс заведомо больше суммы: проверяем знак записи, а не достаточность
  // средств.
  return {
    supabase: {
      from: table,
      rpc: () => Promise.resolve({ data: 100000, error: null }),
    },
  }
})

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { updateUserBalance } = await import('@/core/supabase/updateUserBalance')

describe('updateUserBalance: знак задаёт type, а не число', () => {
  beforeEach(() => {
    inserted.length = 0
  })

  it('отклоняет отрицательную сумму и НЕ пишет строку', async () => {
    const ok = await updateUserBalance(
      '223757230',
      -45,
      PaymentType.MONEY_OUTCOME,
      'AI Reels Hedra'
    )

    expect(ok).toBe(false)
    // Главное: перевёрнутая проводка не попала в реестр.
    expect(inserted).toHaveLength(0)
  })

  it('положительную сумму пишет как есть, знак не трогает', async () => {
    const ok = await updateUserBalance(
      '223757230',
      45,
      PaymentType.MONEY_OUTCOME,
      'AI Reels Hedra'
    )

    expect(ok).toBe(true)
    expect(inserted).toHaveLength(1)
    expect(inserted[0].stars).toBe(45)
    expect(inserted[0].type).toBe('MONEY_OUTCOME')
  })

  it('SERVICE_PAYMENT больше нельзя передать: его нет в PaymentType', () => {
    // Тип, который не проходит валидацию записи, не должен существовать в
    // enum — иначе его снова кто-нибудь передаст, а списание молча не
    // произойдёт. Проверяем и типом, и значением.
    expect(Object.values(PaymentType)).not.toContain('SERVICE_PAYMENT')
    // @ts-expect-error — SERVICE_PAYMENT удалён из PaymentType намеренно
    const gone = PaymentType.SERVICE_PAYMENT
    expect(gone).toBeUndefined()
  })
})
