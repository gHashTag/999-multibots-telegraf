import { jest, describe, it, expect, beforeEach } from '@jest/globals'
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getPrompt } from '@/core/supabase/getPrompt'

describe('getPrompt', () => {
  const prompt_id = 'p1'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns null on error', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getPrompt(prompt_id)
    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Ошибка при получении промпта по prompt_id:', { message: 'fail' })
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('returns data when present', async () => {
    const data = { prompt_id, text: 'hi' }
    const mockSingle = jest.fn().mockResolvedValue({ data, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const result = await getPrompt(prompt_id)
    expect(result).toEqual(data)
    expect(consoleLogSpy).toHaveBeenCalledWith(data, 'data')
    consoleLogSpy.mockRestore()
  })
})