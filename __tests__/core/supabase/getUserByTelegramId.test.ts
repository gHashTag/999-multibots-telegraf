// Mock supabase and logger
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import { createMockSupabaseClient } from '@/core/supabase/createMockSupabaseClient'
import { SupabaseClient } from '@supabase/supabase-js'

describe('getUserByTelegramId', () => {
  let mockSupabase: SupabaseClient

  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabase = createMockSupabaseClient() as unknown as SupabaseClient
    ;(supabase as any) = mockSupabase // Assign mock
  })

  it('should return user data if found', async () => {
    const mockTelegramId = '123456789'
    const mockUserData = {
      id: 'user-123',
      name: 'Test User',
      telegram_id: mockTelegramId,
      ref_parent_id: null,
      ref_parent_id_second: null,
      stars: 100,
      limit: 10,
      limit_dalle: 5,
      limit_video: 2,
      limit_music: 3,
      limit_voice: 1,
      generated_images: 0,
      generated_videos: 0,
      email: 'test@example.com',
      is_subscribed: true,
      subscription_type: 'PRO',
      active_until: '2024-12-31',
      level: 5,
      experience: 500,
      created_at: '2023-01-01',
      last_activity: '2023-10-26',
      language_code: 'en',
    }

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest
      .fn()
      .mockResolvedValue({ data: mockUserData, error: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      single: singleMock,
    })

    const result = await getUserByTelegramId(mockTelegramId)

    expect(result).toEqual(mockUserData)
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('telegram_id', mockTelegramId)
    expect(singleMock).toHaveBeenCalledTimes(1)
  })

  it('should return null if user not found', async () => {
    const mockTelegramId = '987654321'

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      single: singleMock,
    })

    const result = await getUserByTelegramId(mockTelegramId)

    expect(result).toBeNull()
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('telegram_id', mockTelegramId)
    expect(singleMock).toHaveBeenCalledTimes(1)
  })

  it('should throw an error if Supabase query fails', async () => {
    const mockTelegramId = '112233445'
    const mockError = new Error('Supabase query failed')

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest
      .fn()
      .mockResolvedValue({ data: null, error: mockError })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      single: singleMock,
    })

    await expect(getUserByTelegramId(mockTelegramId)).rejects.toThrow(
      'Supabase query failed'
    )
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('telegram_id', mockTelegramId)
    expect(singleMock).toHaveBeenCalledTimes(1)
  })
})
