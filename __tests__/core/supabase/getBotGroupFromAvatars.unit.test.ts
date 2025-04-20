
// Mock supabase and logger
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getBotGroupFromAvatars } from '@/core/supabase/getBotGroupFromAvatars'

describe('getBotGroupFromAvatars', () => {
  const bot_name = 'botX'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns group when data present', async () => {
    const data = { group: 'grp1' }
    const mockSingle = jest.fn().mockResolvedValue({ data, error: null })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getBotGroupFromAvatars(bot_name)
    expect(result).toBe('grp1')
  })

  it('returns null on error and logs', async () => {
    const err = { message: 'failTbl' }
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: err })
    const eqMock = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: mockSelect })
    const result = await getBotGroupFromAvatars(bot_name)
    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      '❌ Ошибка при получении данных из Avatars:',
      expect.objectContaining({ description: expect.any(String), error: err, bot_name })
    )
  })

  it('returns null on exception and logs', async () => {
    (supabase.from as jest.Mock).mockImplementation(() => { throw new Error('boom') })
    const result = await getBotGroupFromAvatars(bot_name)
    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      '❌ Непредвиденная ошибка при получении данных из Avatars:',
      expect.objectContaining({ description: expect.any(String), error: expect.any(Error), bot_name })
    )
  })
})