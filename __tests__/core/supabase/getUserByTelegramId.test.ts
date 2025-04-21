// Mock supabase and logger
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'

describe('getUserByTelegramId', () => {
  const ctx: any = {
    from: { id: 5 },
    botInfo: { username: 'botA' },
    reply: jest.fn(),
  }
  beforeEach(() => jest.clearAllMocks())

  it('returns null when supabase select errors', async () => {
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'fail' } })
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getUserByTelegramId(ctx)
    expect(result).toBeNull()
  })

  it('returns data and skips update when bot_name matches', async () => {
    const userData = { bot_name: 'botA', foo: 'bar' }
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: userData, error: null })
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getUserByTelegramId(ctx)
    expect(result).toEqual(userData)
  })

  it('updates bot_name when differs and returns data', async () => {
    const userData = { bot_name: 'oldBot' }
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: userData, error: null })
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
    const mockUpdate = jest.fn().mockResolvedValue({ error: null })
    // first call: select
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock)
      .mockReturnValueOnce({ select: mockSelect })
      .mockReturnValueOnce({ update: mockUpdate, eq: mockEq })
    // Actually implement properly
    const sel = jest.fn().mockReturnValue({ eq: mockEq })
    ;(supabase.from as jest.Mock)
      .mockReturnValueOnce({ select: sel })
      .mockReturnValueOnce({ update: mockUpdate })
    const result = await getUserByTelegramId(ctx)
    expect(mockUpdate).toHaveBeenCalled()
    expect(result).toEqual(userData)
  })
})
