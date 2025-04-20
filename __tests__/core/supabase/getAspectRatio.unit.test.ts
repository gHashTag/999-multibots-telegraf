import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getAspectRatio } from '@/core/supabase/getAspectRatio'

describe('getAspectRatio', () => {
  const telegram_id = 99
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns null on error', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getAspectRatio(telegram_id)
    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Ошибка при получении aspect_ratio для telegram_id:', { message: 'fail' })
    consoleErrorSpy.mockRestore()
  })

  it('returns null when data is null', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getAspectRatio(telegram_id)
    expect(result).toBeNull()
  })

  it('returns aspect_ratio when data present', async () => {
    const aspect = '16:9'
    const data = { aspect_ratio: aspect }
    const mockSingle = jest.fn().mockResolvedValue({ data, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getAspectRatio(telegram_id)
    expect(result).toBe(aspect)
  })
})