// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getUserData } from '@/core/supabase/getUserData'

describe('getUserData', () => {
  const telegram_id = '77'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('throws error on supabase error', async () => {
    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } })
    const selectMock = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    await expect(getUserData(telegram_id)).rejects.toThrow('Ошибка при получении данных пользователя: err')
  })

  it('returns data when successful', async () => {
    const data = { username: 'u', first_name: 'f', last_name: 'l', company: 'c', position: 'p', designation: 'd', language_code: 'en' }
    const mockMaybeSingle = jest.fn().mockResolvedValue({ data, error: null })
    const selectMock = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const result = await getUserData(telegram_id)
    expect(result).toBe(data)
  })
})