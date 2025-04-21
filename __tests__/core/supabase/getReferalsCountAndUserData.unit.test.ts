// Mock supabase and logger
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'
import { createMockSupabaseClient } from '@/core/supabase/mockSupabaseClient'
import { SupabaseClient } from '@supabase/supabase-js'

describe('getReferalsCountAndUserData', () => {
  let mockSupabase: SupabaseClient

  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabase = createMockSupabaseClient() as unknown as SupabaseClient
    ;(supabase as any) = mockSupabase // Assign mock
  })

  it('should return user data and referral count on success', async () => {
    const mockUserId = 'user-123'
    const mockUserData = {
      id: mockUserId,
      name: 'Test User',
      telegram_id: '123456',
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
    const mockReferralsCount = 5

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest
      .fn()
      .mockResolvedValue({ data: mockUserData, error: null })
    const countMock = jest.fn().mockResolvedValue({ count: mockReferralsCount, error: null })

    mockSupabase.from = jest.fn(tableName => {
      if (tableName === 'users') {
        return {
          select: selectMock,
          eq: eqMock,
          single: singleMock,
        }
      } else if (tableName === 'referals') {
        return {
          select: selectMock,
          eq: eqMock,
          count: countMock,
        }
      }
      return { select: jest.fn() } // Default mock for other tables
    })

    const result = await getReferalsCountAndUserData(mockUserId)

    expect(result).toEqual({
      userData: mockUserData,
      referalsCount: mockReferralsCount,
    })
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('id', mockUserId)
    expect(singleMock).toHaveBeenCalledTimes(1)

    expect(mockSupabase.from).toHaveBeenCalledWith('referals')
    expect(selectMock).toHaveBeenCalledWith('*', { count: 'exact' })
    expect(eqMock).toHaveBeenCalledWith('parent_user_id', mockUserId)
    expect(countMock).toHaveBeenCalledTimes(1)
  })

  it('should return null user data and 0 referrals if user not found', async () => {
    const mockUserId = 'non-existent-user'

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: null })
    const countMock = jest.fn().mockResolvedValue({ count: 0, error: null })

    mockSupabase.from = jest.fn(tableName => {
      if (tableName === 'users') {
        return {
          select: selectMock,
          eq: eqMock,
          single: singleMock,
        }
      } else if (tableName === 'referals') {
        return {
          select: selectMock,
          eq: eqMock,
          count: countMock,
        }
      }
      return { select: jest.fn() } // Default mock for other tables
    })

    const result = await getReferalsCountAndUserData(mockUserId)

    expect(result).toEqual({
      userData: null,
      referalsCount: 0,
    })
    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(countMock).toHaveBeenCalledTimes(1)
  })

  it('should throw error if Supabase user query fails', async () => {
    const mockUserId = 'error-user'
    const mockError = new Error('User query failed')

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({ data: null, error: mockError })
    const countMock = jest.fn().mockResolvedValue({ count: 0, error: null })

    mockSupabase.from = jest.fn(tableName => {
      if (tableName === 'users') {
        return {
          select: selectMock,
          eq: eqMock,
          single: singleMock,
        }
      } else if (tableName === 'referals') {
        return {
          select: selectMock,
          eq: eqMock,
          count: countMock,
        }
      }
      return { select: jest.fn() }
    })

    await expect(getReferalsCountAndUserData(mockUserId)).rejects.toThrow(
      'User query failed'
    )
    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(countMock).not.toHaveBeenCalled()
  })

  it('should throw error if Supabase referral query fails', async () => {
    const mockUserId = 'referral-error-user'
    const mockUserData = { id: mockUserId, name: 'Test User' } // Assume user data is found
    const mockError = new Error('Referral query failed')

    // Mock Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const singleMock = jest
      .fn()
      .mockResolvedValue({ data: mockUserData, error: null })
    const countMock = jest.fn().mockResolvedValue({ count: null, error: mockError })

    mockSupabase.from = jest.fn(tableName => {
      if (tableName === 'users') {
        return {
          select: selectMock,
          eq: eqMock,
          single: singleMock,
        }
      } else if (tableName === 'referals') {
        return {
          select: selectMock,
          eq: eqMock,
          count: countMock,
        }
      }
      return { select: jest.fn() }
    })

    await expect(getReferalsCountAndUserData(mockUserId)).rejects.toThrow(
      'Referral query failed'
    )
    expect(singleMock).toHaveBeenCalledTimes(1)
    expect(countMock).toHaveBeenCalledTimes(1)
  })
})
