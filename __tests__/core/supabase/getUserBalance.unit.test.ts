// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getUserBalance } from '@/core/supabase/getUserBalance'

describe('getUserBalance', () => {
  const telegram_id = 123
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('throws "Пользователь не найден" when error code is PGRST116', async () => {
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } })
    const eqMock = jest.fn().mockReturnValue({ single: singleMock })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    await expect(getUserBalance(telegram_id)).rejects.toThrow('Пользователь не найден')
  })

  it('throws generic error when error code is not PGRST116', async () => {
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'fail' } })
    const eqMock = jest.fn().mockReturnValue({ single: singleMock })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    await expect(getUserBalance(telegram_id)).rejects.toThrow('Не удалось получить баланс пользователя')
  })

  it('returns balance from data', async () => {
    const singleMock = jest.fn().mockResolvedValue({ data: { balance: 42 }, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: singleMock })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const result = await getUserBalance(telegram_id)
    expect(result).toBe(42)
  })

  it('returns 0 when data.balance is falsy', async () => {
    const singleMock = jest.fn().mockResolvedValue({ data: { balance: null }, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: singleMock })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const result = await getUserBalance(telegram_id)
    expect(result).toBe(0)
  })
})