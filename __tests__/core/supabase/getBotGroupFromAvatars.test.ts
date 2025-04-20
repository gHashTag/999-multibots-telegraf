import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

describe('getBotGroupFromAvatars', () => {
  let mockSingle: jest.Mock<any, any>
  let mockEq: jest.Mock<any, any>
  let mockSelect: jest.Mock<any, any>
  let mockFrom: jest.Mock<any, any>
  let getBotGroupFromAvatars: (bot_name: string) => Promise<string | null>
  let logger: any

  beforeEach(() => {
    jest.resetModules()
    // Setup supabase.from chain mocks
    mockSingle = jest.fn()
    mockEq = jest.fn(() => ({ single: mockSingle }))
    mockSelect = jest.fn(() => ({ eq: mockEq }))
    mockFrom = jest.fn(() => ({ select: mockSelect }))
    // Mock supabase client
    jest.doMock('@/core/supabase', () => ({
      supabase: { from: mockFrom }
    }))
    // Spy on logger.error
    // Get default logger instance
    logger = require('@/utils/logger').logger || require('@/utils/logger').default
    jest.spyOn(logger, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getBotGroupFromAvatars = require('@/core/supabase/getBotGroupFromAvatars').getBotGroupFromAvatars
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns group when data found', async () => {
    mockSingle.mockResolvedValueOnce({ data: { group: 'group1' }, error: null })
    const result = await getBotGroupFromAvatars('bot1')
    expect(mockFrom).toHaveBeenCalledWith('avatars')
    expect(mockSelect).toHaveBeenCalledWith('group')
    expect(mockEq).toHaveBeenCalledWith('bot_name', 'bot1')
    expect(mockSingle).toHaveBeenCalled()
    expect(result).toBe('group1')
  })

  it('returns null when error in response', async () => {
    const err = new Error('fetch error')
    mockSingle.mockResolvedValueOnce({ data: null, error: err })
    const result = await getBotGroupFromAvatars('bot2')
    expect(logger.error).toHaveBeenCalledWith(
      '❌ Ошибка при получении данных из Avatars:',
      { description: 'Error fetching data from Avatars table', error: err, bot_name: 'bot2' }
    )
    expect(result).toBeNull()
  })

  it('returns null when exception thrown', async () => {
    const unexpected = new Error('unexpected')
    mockSingle.mockRejectedValueOnce(unexpected)
    const result = await getBotGroupFromAvatars('bot3')
    expect(logger.error).toHaveBeenCalledWith(
      '❌ Непредвиденная ошибка при получении данных из Avatars:',
      { description: 'Unexpected error fetching data from Avatars table', error: unexpected, bot_name: 'bot3' }
    )
    expect(result).toBeNull()
  })
})