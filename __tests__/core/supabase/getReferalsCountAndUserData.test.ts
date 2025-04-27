import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'
import { supabase } from '@/core/supabase' // Mocked
import { logger } from '@/utils/logger' // Mocked
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription' // Mocked
import { SubscriptionType } from '@/interfaces/subscription.interface'
import type { UserType } from '@/interfaces/supabase.interface'
import {
  normalizeTelegramId,
  type TelegramId,
} from '@/interfaces/telegram.interface'

// Mock dependencies
vi.mock('@/utils/logger')
vi.mock('@/core/supabase/getUserDetailsSubscription')

// Mock Supabase itself
vi.mock('@/core/supabase', () => {
  return {
    supabase: {
      from: vi.fn(), // Implementation set inside tests
    },
  }
})

// Access mocked functions
const mockedGetUserDetailsSubscription = getUserDetailsSubscription as Mock
const mockedSupabaseFrom = supabase.from as Mock

describe('getReferalsCountAndUserData', () => {
  const testTelegramId: TelegramId = '987654321'
  const testTelegramIdStr = normalizeTelegramId(testTelegramId)
  const mockUserData: UserType = {
    user_id: 'mock-user-uuid',
    telegram_id: BigInt(testTelegramIdStr),
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
    language_code: 'en',
    level: 5,
    inviter: null,
    created_at: new Date(),
    updated_at: new Date(),
    last_activity_at: new Date(),
    account_status: 'ACTIVE',
    is_banned: false,
  }
  const mockActiveSubscription = {
    subscriptionType: SubscriptionType.NEUROBASE,
    isSubscriptionActive: true,
    stars: 100,
    isExist: true,
    subscriptionStartDate: new Date().toISOString(),
  }
  const mockInactiveSubscription = {
    subscriptionType: SubscriptionType.STARS,
    isSubscriptionActive: false,
    stars: 50,
    isExist: true,
    subscriptionStartDate: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetUserDetailsSubscription.mockResolvedValue(mockActiveSubscription)
    // Reset general mock behavior
    mockedSupabaseFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }))
  })

  it('should return correct data for existing user with active subscription and referrals', async () => {
    // Arrange
    const referralCount = 5

    const fromUserMock = vi.fn()
    mockedSupabaseFrom.mockImplementation(fromUserMock)

    // Mock setup for Get User Data
    const userEqMock = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }),
    })

    // Mock setup for Count Referrals
    const countEqMock = vi.fn().mockImplementation((col, val) => {
      if (col === 'inviter' && val === mockUserData.user_id) {
        // eq should return a Promise that resolves to the count result
        return Promise.resolve({
          data: null,
          count: referralCount,
          error: null,
        })
      }
      // Default for eq if called with other args in count context
      return Promise.resolve({ data: null, count: 0, error: null })
    })

    const userTableMock = {
      select: vi.fn((cols, opts) => {
        if (cols === 'inviter' && opts?.count === 'exact') {
          // Select for count returns object with the specific eq mock
          return { eq: countEqMock }
        } else {
          // Select for user data returns object with its specific eq mock
          return { eq: userEqMock }
        }
      }),
    }

    fromUserMock.mockImplementation(tableName => {
      if (tableName === 'users') {
        return userTableMock
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    mockedGetUserDetailsSubscription.mockResolvedValue(mockActiveSubscription)

    // Act
    const result = await getReferalsCountAndUserData(testTelegramId)

    // Assert
    expect(result).toEqual({
      count: referralCount, // Should be 5
      level: mockUserData.level,
      subscriptionType: mockActiveSubscription.subscriptionType,
      userData: mockUserData,
      isExist: true,
    })
    expect(mockedGetUserDetailsSubscription).toHaveBeenCalledWith(
      testTelegramIdStr
    )
    expect(mockedSupabaseFrom).toHaveBeenCalledWith('users')
    expect(mockedSupabaseFrom).toHaveBeenCalledTimes(2) // User fetch + referral count
  })

  it('should return default data if user does not exist', async () => {
    // Arrange: Simulate user not found
    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        const selectMock = vi.fn().mockReturnThis()
        const eqMock = vi.fn((column, value) => {
          if (column === 'telegram_id') {
            // Simulate error or null data for the specific user fetch
            return {
              single: vi.fn().mockResolvedValue({
                data: null,
                error: new Error('User not found'),
              }),
            }
          }
          return {
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        })
        return { select: selectMock, eq: eqMock }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    // Act
    const result = await getReferalsCountAndUserData(testTelegramId)

    // Assert
    expect(result).toEqual({
      count: 0,
      level: 0,
      subscriptionType: SubscriptionType.STARS,
      userData: null,
      isExist: false,
    })
    expect(mockedSupabaseFrom).toHaveBeenCalledWith('users')
    expect(mockedGetUserDetailsSubscription).not.toHaveBeenCalled()
    expect(mockedSupabaseFrom).toHaveBeenCalledTimes(1) // Only called once
  })

  it('should use STARS subscription type if getUserDetailsSubscription fails', async () => {
    // Arrange
    const referralCount = 3
    const subError = new Error('Failed to get subscription')
    mockedGetUserDetailsSubscription.mockRejectedValue(subError) // Simulate error

    const fromUserMock = vi.fn()
    mockedSupabaseFrom.mockImplementation(fromUserMock)

    // Mock setup for Get User Data
    const userEqMock = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }),
    })

    // Mock setup for Count Referrals
    const countEqMock = vi.fn().mockImplementation((col, val) => {
      if (col === 'inviter' && val === mockUserData.user_id) {
        // eq returns a Promise resolving to the count
        return Promise.resolve({
          data: null,
          count: referralCount,
          error: null,
        })
      }
      return Promise.resolve({ data: null, count: 0, error: null })
    })

    const userTableMock = {
      select: vi.fn((cols, opts) => {
        if (cols === 'inviter' && opts?.count === 'exact') {
          return { eq: countEqMock } // Route to count logic
        } else {
          return { eq: userEqMock } // Route to user data logic
        }
      }),
    }

    fromUserMock.mockImplementation(tableName => {
      if (tableName === 'users') {
        return userTableMock
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    // Act
    const result = await getReferalsCountAndUserData(testTelegramId)

    // Assert
    expect(result).toEqual({
      count: referralCount, // Should be 3
      level: mockUserData.level,
      subscriptionType: SubscriptionType.STARS, // Default on error
      userData: mockUserData,
      isExist: true,
    })
    expect(mockedGetUserDetailsSubscription).toHaveBeenCalledWith(
      testTelegramIdStr
    )
    expect(mockedSupabaseFrom).toHaveBeenCalledTimes(2) // User fetch + referral count
    // expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Ошибка при вызове getUserDetailsSubscription'), subError)
  })

  it('should return 0 referrals if referral count query fails', async () => {
    // Arrange
    const countError = new Error('Referral count failed')
    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        const selectMock = vi.fn()
        const eqMock = vi.fn()

        selectMock.mockImplementation((columns, options) => {
          // Handle referral count request - SIMULATE ERROR
          if (columns === 'inviter' && options?.count === 'exact') {
            const eqInviterMock = vi
              .fn()
              .mockResolvedValue({ data: null, count: null, error: countError })
            return { eq: eqInviterMock }
          }
          // Default select for user data
          return { eq: eqMock }
        })

        eqMock.mockImplementation((column, value) => {
          // Handle getting user by telegram_id
          if (column === 'telegram_id' && value === testTelegramIdStr) {
            return {
              single: vi
                .fn()
                .mockResolvedValue({ data: mockUserData, error: null }),
            }
          }
          // Default eq
          return {
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        })

        return { select: selectMock, eq: eqMock }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })
    mockedGetUserDetailsSubscription.mockResolvedValue(mockActiveSubscription)

    // Act
    const result = await getReferalsCountAndUserData(testTelegramId)

    // Assert
    expect(result).toEqual({
      count: 0, // Returns 0 on error
      level: mockUserData.level,
      subscriptionType: mockActiveSubscription.subscriptionType,
      userData: mockUserData,
      isExist: true,
    })
    expect(mockedGetUserDetailsSubscription).toHaveBeenCalledWith(
      testTelegramIdStr
    )
    expect(mockedSupabaseFrom).toHaveBeenCalledTimes(2)
    // expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Ошибка при получении количества рефералов'), countError)
  })

  it('should return 0 referrals if user has no referrals', async () => {
    // Arrange
    const referralCount = 0 // No referrals
    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        const selectMock = vi.fn()
        const eqMock = vi.fn()

        selectMock.mockImplementation((columns, options) => {
          // Handle referral count request - return 0
          if (columns === 'inviter' && options?.count === 'exact') {
            const eqInviterMock = vi.fn().mockResolvedValue({
              data: [],
              count: referralCount,
              error: null,
            })
            return { eq: eqInviterMock }
          }
          // Default select for user data
          return { eq: eqMock }
        })

        eqMock.mockImplementation((column, value) => {
          // Handle getting user by telegram_id
          if (column === 'telegram_id' && value === testTelegramIdStr) {
            return {
              single: vi
                .fn()
                .mockResolvedValue({ data: mockUserData, error: null }),
            }
          }
          // Default eq
          return {
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        })

        return { select: selectMock, eq: eqMock }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })
    mockedGetUserDetailsSubscription.mockResolvedValue(mockActiveSubscription)

    // Act
    const result = await getReferalsCountAndUserData(testTelegramId)

    // Assert
    expect(result).toEqual({
      count: referralCount, // Expect 0
      level: mockUserData.level,
      subscriptionType: mockActiveSubscription.subscriptionType,
      userData: mockUserData,
      isExist: true,
    })
    expect(mockedGetUserDetailsSubscription).toHaveBeenCalledWith(
      testTelegramIdStr
    )
    expect(mockedSupabaseFrom).toHaveBeenCalledTimes(2)
  })
})
