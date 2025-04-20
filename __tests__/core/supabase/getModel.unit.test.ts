import { jest, describe, it, expect, beforeEach } from '@jest/globals'
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getModel } from '@/core/supabase/getModel'

describe('getModel', () => {
  const telegram_id = '200'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('throws error on supabase error', async () => {
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } })
    const selectMock = jest.fn().mockReturnValue({ single: singleMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    await expect(getModel(telegram_id)).rejects.toThrow('Error getModel: [object Object]')
  })

  it('throws error when data null', async () => {
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: null })
    const selectMock = jest.fn().mockReturnValue({ single: singleMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    await expect(getModel(telegram_id)).rejects.toThrow('Error getModel: null')
  })

  it('returns data.model on success', async () => {
    const singleMock = jest.fn().mockResolvedValue({ data: { model: 'm1' }, error: null })
    const selectMock = jest.fn().mockReturnValue({ single: singleMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const result = await getModel(telegram_id)
    expect(result).toBe('m1')
  })
})