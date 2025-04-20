import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock supabase client
jest.mock('@/core/supabase', () => ({
  supabase: { from: jest.fn() }
}))
import { supabase } from '@/core/supabase'
import { getUserModel } from '@/core/supabase/getUserModel'

describe('getUserModel', () => {
  const telegramId = '42'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns default model when supabase returns error', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } })
    const builderEq = { single: mockSingle }
    const mockEq = jest.fn().mockReturnValue(builderEq)
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getUserModel(telegramId)
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith('model')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegramId)
    expect(mockSingle).toHaveBeenCalled() // single() called
    expect(result).toBe('gpt-4o')
  })

  it('returns user model when data is present', async () => {
    const data = { model: 'custom-model' }
    const mockSingle = jest.fn().mockResolvedValue({ data, error: null })
    const builderEq = { single: mockSingle }
    const mockEq = jest.fn().mockReturnValue(builderEq)
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getUserModel(telegramId)
    expect(mockSingle).toHaveBeenCalled()
    expect(result).toBe('custom-model')
  })

  it('returns default model when data.model is undefined', async () => {
    const data = { model: undefined }
    const mockSingle = jest.fn().mockResolvedValue({ data, error: null })
    const builderEq = { single: mockSingle }
    const mockEq = jest.fn().mockReturnValue(builderEq)
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getUserModel(telegramId)
    expect(mockSingle).toHaveBeenCalled()
    expect(result).toBe('gpt-4o')
  })
})