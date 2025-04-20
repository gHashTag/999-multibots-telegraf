
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getGeneratedImages } from '@/core/supabase/getGeneratedImages'

describe('getGeneratedImages', () => {
  const telegram_id = 77
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns default when error', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const result = await getGeneratedImages(telegram_id)
    expect(result).toEqual({ count: 0, limit: 2 })
    expect(consoleLogSpy).toHaveBeenCalledWith('Ошибка при получении count для telegram_id:', { message: 'err' })
    consoleLogSpy.mockRestore()
  })

  it('returns parsed numbers when data present', async () => {
    const data = { count: '5', limit: '10' }
    const mockSingle = jest.fn().mockResolvedValue({ data, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getGeneratedImages(telegram_id)
    expect(result).toEqual({ count: 5, limit: 10 })
  })
})