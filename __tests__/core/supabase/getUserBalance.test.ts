import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { supabase } from '@/core/supabase'
import { getUserBalance } from '@/core/supabase/getUserBalance'

describe('core/supabase getUserBalance', () => {
  const fromMock = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(supabase, 'from').mockReturnValue(fromMock as any)
  })

  it('returns balance when data exists', async () => {
    fromMock.single.mockResolvedValue({ data: { balance: 123 }, error: null })
    const balance = await getUserBalance(99)
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(balance).toBe(123)
  })

  it('returns 0 when data.balance is null or undefined', async () => {
    fromMock.single.mockResolvedValue({ data: {}, error: null })
    const balance = await getUserBalance(55)
    expect(balance).toBe(0)
  })

  it('throws specific error when error.code is PGRST116', async () => {
    const err = { code: 'PGRST116', message: 'not found' }
    fromMock.single.mockResolvedValue({ data: null, error: err as any })
    await expect(getUserBalance(1)).rejects.toThrow('Пользователь не найден')
  })

  it('throws generic error when error code is different', async () => {
    const err = { code: 'OTHER', message: 'bad' }
    fromMock.single.mockResolvedValue({ data: null, error: err as any })
    await expect(getUserBalance(2)).rejects.toThrow('Не удалось получить баланс пользователя')
  })
})