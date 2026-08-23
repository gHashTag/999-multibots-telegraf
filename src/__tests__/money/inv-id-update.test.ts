import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaymentType } from '@/interfaces/payments.interface'

/**
 * Регрессия: updateUserBalance с СУЩЕСТВУЮЩИМ inv_id обязан вернуть true.
 *
 * Раньше после успешного UPDATE выполнение проваливалось к INSERT с тем же
 * inv_id и упиралось в UNIQUE payments_v2_inv_id_key — функция возвращала
 * false, хотя строка уже переведена в COMPLETED и звёзды начислены (баланс
 * считается суммой COMPLETED-строк).
 *
 * Соседний тест этого не ловил: его мок не знает про уникальность, поэтому
 * лишний INSERT молча проходил и результат совпадал с ожидаемым по случайной
 * причине. Здесь мок ограничение ВОСПРОИЗВОДИТ — иначе тест доказывает не то,
 * что происходит в базе.
 */
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const existingInvIds = new Set<string>()

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { telegram_id: '1' }, error: null }),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      insert: vi.fn((row: Record<string, unknown>) => {
        const inv = String(row?.inv_id ?? '')
        if (existingInvIds.has(inv)) {
          return Promise.resolve({
            error: {
              code: '23505',
              message:
                'duplicate key value violates unique constraint "payments_v2_inv_id_key"',
            },
          })
        }
        existingInvIds.add(inv)
        return Promise.resolve({ error: null })
      }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: 100, error: null }),
  },
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  invalidateBalanceCache: vi.fn(),
}))

vi.mock('@/price/helpers/calculateServiceCost', () => ({
  calculateServiceCost: vi.fn().mockReturnValue(5),
}))

vi.mock('@/interfaces/zod/payment.zod', () => ({
  CreatePaymentV2Schema: { parse: vi.fn((d: unknown) => d) },
}))

import { updateUserBalance } from '@/core/supabase/updateUserBalance'

describe('updateUserBalance с существующим inv_id', () => {
  beforeEach(() => {
    existingInvIds.clear()
    existingInvIds.add('INV-EXISTS')
  })

  it('возвращает true: строка уже переведена в COMPLETED, звёзды начислены', async () => {
    const ok = await updateUserBalance(
      '144022504',
      100,
      PaymentType.MONEY_INCOME,
      'Оплата TON',
      { inv_id: 'INV-EXISTS', bot_name: 'neuro_blogger_bot' } as never
    )
    expect(ok).toBe(true)
  })
})
