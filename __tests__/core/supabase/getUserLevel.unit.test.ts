// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getUserLevel } from '@/core/supabase/getUserLevel'

describe('getUserLevel', () => {
  const telegram_id = '99'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns null on supabase error', async () => {
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'err' } })
    const selectMock = jest.fn().mockReturnValue({ single: mockSingle })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const selectEqChain = { select: selectMock, eq: eqMock }
    
    ;(supabase.from as jest.Mock).mockReturnValue(selectEqChain)
    selectMock.mockReturnValue({ eq: eqMock })
    
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    
    const result = await getUserLevel(telegram_id)
    
    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Ошибка при получении уровня пользователя:',
      { message: 'err' }
    )
    
    consoleErrorSpy.mockRestore()
  })

  it('returns level when data present', async () => {
    const mockData = { level: 7 }
    const mockSingle = jest.fn().mockResolvedValue({ data: mockData, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    
    const result = await getUserLevel(telegram_id)
    
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('level')
    expect(eqMock).toHaveBeenCalledWith('telegram_id', telegram_id)
    expect(result).toBe(7)
  })

  it('returns null when data is null', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    
    const result = await getUserLevel(telegram_id)
    
    expect(result).toBeNull()
    
    consoleErrorSpy.mockRestore()
  })

  it('returns null on exception', async () => {
    ;(supabase.from as jest.Mock).mockImplementation(() => {
      throw new Error('boom')
    })
    
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    
    const result = await getUserLevel(telegram_id)
    
    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Ошибка в функции getUserLevel:',
      expect.any(Error)
    )
    
    consoleErrorSpy.mockRestore()
  })
})
