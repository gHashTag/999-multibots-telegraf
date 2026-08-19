import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
// Мокается бочка '@/core/supabase', а не './client': getUserBalance
// импортирует supabase именно из неё, а бочка тянет за собой сцены, которые
// на импорте регистрируют хендлеры и роняют сборку теста («Handler is
// undefined»).
vi.mock('@/core/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { getUserBalance, BalanceUnavailableError } from '@/core/supabase/getUserBalance'

describe('getUserBalance: «не смог узнать» не равно «ноль»', () => {
  beforeEach(() => rpc.mockReset())

  it('настоящий нулевой баланс возвращается как 0', async () => {
    rpc.mockResolvedValue({ data: 0, error: null })
    await expect(getUserBalance('123')).resolves.toBe(0)
  })

  it('обычный баланс возвращается как есть', async () => {
    rpc.mockResolvedValue({ data: 1500.5, error: null })
    await expect(getUserBalance('123')).resolves.toBe(1500.5)
  })

  // Ради этого всё и делалось: до правки здесь возвращался 0, и человек с
  // деньгами на счету видел «Недостаточно средств».
  it.each(['PGRST202', '42883', '42P01'])(
    'отсутствие функции (%s) выбрасывает ошибку, а не отдаёт 0',
    async code => {
      rpc.mockResolvedValue({ data: null, error: { code, message: 'not found' } })
      await expect(getUserBalance('123')).rejects.toBeInstanceOf(BalanceUnavailableError)
    }
  )

  // Радиус правки намеренно узкий: 57 мест вызова полагаются на прежнее
  // поведение, и менять его целиком вслепую — отдельная работа.
  it('прочие ошибки по-прежнему дают 0, контракт не сломан', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } })
    await expect(getUserBalance('123')).resolves.toBe(0)
  })
})
