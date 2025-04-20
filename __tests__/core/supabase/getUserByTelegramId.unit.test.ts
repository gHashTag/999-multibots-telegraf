import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock supabase client
jest.mock('@/core/supabase', () => ({
  supabase: { from: jest.fn() }
}))
import { supabase } from '@/core/supabase'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'

describe('getUserByTelegramId', () => {
  const ctx: any = {
    from: { id: 123 },
    botInfo: { username: 'newBot' }
  }
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns null if select returns error', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } })
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getUserByTelegramId(ctx)
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(result).toBeNull()
  })

  it('returns data and does not update if bot_name matches', async () => {
    const userData = { bot_name: 'newBot', foo: 'bar' }
    const mockSingle = jest.fn().mockResolvedValue({ data: userData, error: null })
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getUserByTelegramId(ctx)
    expect(result).toEqual(userData)
    expect(mockEq).toHaveBeenCalledTimes(1)
  })

  it('updates bot_name when differs and returns data', async () => {
    const oldData = { bot_name: 'oldBot' }
    const mockSingle = jest.fn().mockResolvedValue({ data: oldData, error: null })
    const mockEqSelect = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEqSelect })
    const mockEqUpdate = jest.fn().mockResolvedValue({ error: null })
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEqUpdate })
    const fromMock = supabase.from as jest.Mock
    fromMock.mockImplementationOnce(() => ({ select: mockSelect }))
    fromMock.mockImplementationOnce(() => ({ update: mockUpdate }))
    const result = await getUserByTelegramId(ctx)
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockUpdate).toHaveBeenCalledWith({ bot_name: 'newBot' })
    expect(mockEqUpdate).toHaveBeenCalledWith('telegram_id', '123')
    expect(result).toEqual(oldData)
  })

  it('returns null on unexpected exception', async () => {
    (supabase.from as jest.Mock).mockImplementation(() => { throw new Error('fail') })
    const result = await getUserByTelegramId(ctx)
    expect(result).toBeNull()
  })
})