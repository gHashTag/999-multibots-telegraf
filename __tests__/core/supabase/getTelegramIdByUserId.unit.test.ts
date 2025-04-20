import { jest, describe, it, expect, beforeEach } from '@jest/globals'
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getTelegramIdByUserId } from '@/core/supabase/getTelegramIdByUserId'

describe('getTelegramIdByUserId', () => {
  const userId = '200'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns null on error', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getTelegramIdByUserId(userId)
    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Ошибка при получении telegram_id:', { message: 'err' })
    consoleErrorSpy.mockRestore()
  })

  it('returns telegram_id when data present', async () => {
    const data = { telegram_id: 300 }
    const mockSingle = jest.fn().mockResolvedValue({ data, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const result = await getTelegramIdByUserId(userId)
    expect(result).toBe(300)
  })

  it('throws on exception', async () => {
    (supabase.from as jest.Mock).mockImplementation(() => { throw new Error('boom') })
    await expect(getTelegramIdByUserId(userId)).rejects.toThrow('boom')
  })
})