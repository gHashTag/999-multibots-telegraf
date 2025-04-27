import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { supabase } from '@/core/supabase' // Will be mocked
import { logger } from '@/utils/logger' // Will be mocked
import { getUserBalance } from '@/core/supabase/getUserBalance' // Will be mocked
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { PaymentStatus } from '@/interfaces/payments.interface'
import {
  normalizeTelegramId,
  type TelegramId,
} from '@/interfaces/telegram.interface'

// Mock dependencies
vi.mock('@/utils/logger')
vi.mock('@/core/supabase/getUserBalance')

// Mock Supabase itself - Simplest factory
vi.mock('@/core/supabase', () => {
  return {
    supabase: {
      from: vi.fn(), // The implementation will be set inside each test
    },
  }
})

// Mocked functions access
const mockedGetUserBalance = getUserBalance as Mock
const mockedSupabaseFrom = supabase.from as Mock // Access the mocked 'from'

describe('getUserDetailsSubscription', () => {
  const testTelegramId: TelegramId = '123456789'
  const testTelegramIdStr = normalizeTelegramId(testTelegramId)
  const botName = 'test-bot' // Assuming bot_name is needed somewhere or implicitly passed

  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetUserBalance.mockResolvedValue(100) // Default balance
    // Reset the core mock implementation before each test
    mockedSupabaseFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }))
  })

  it('should return default values if user does not exist and has no payments', async () => {
    // Arrange: Configure mocks specifically for this test INSIDE the implementation
    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        // Define chain for users check inline
        return {
          select: vi.fn((columns, options) => {
            if (options?.count === 'exact' && options?.head === true) {
              // Mock for the specific 'head: true' user check
              const userEqMock = vi
                .fn()
                .mockResolvedValue({ count: 0, error: null }) // User not found
              return { eq: userEqMock }
            }
            // Fallback for other user selects if needed
            const fallbackEq = vi
              .fn()
              .mockResolvedValue({ data: [], error: null })
            return { eq: fallbackEq }
          }),
        }
      } else if (tableName === 'payments_v2') {
        // Define chain for payments check inline
        const paymentMaybeSingleMock = vi
          .fn()
          .mockResolvedValue({ data: null, error: null }) // No payment found
        const paymentLimitMock = vi.fn(() => ({
          maybeSingle: paymentMaybeSingleMock,
        }))
        const paymentOrderMock = vi.fn(() => ({ limit: paymentLimitMock }))
        const paymentNotNullMock = vi.fn(() => ({ order: paymentOrderMock }))
        const paymentStatusEqMock = vi.fn(() => ({ not: paymentNotNullMock }))
        const paymentTelegramEqMock = vi.fn(() => ({ eq: paymentStatusEqMock }))
        return {
          select: vi.fn().mockReturnValue({ eq: paymentTelegramEqMock }),
        }
      }
      // Fallback for other tables
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    // Act
    const result = await getUserDetailsSubscription(testTelegramId) // Pass botName if needed

    // Assert
    expect(result).toEqual({
      stars: 100,
      subscriptionType: null,
      isSubscriptionActive: false,
      isExist: false, // Because count was 0
      subscriptionStartDate: null,
    })
    expect(mockedGetUserBalance).toHaveBeenCalledWith(testTelegramIdStr) // Ensure it checks balance regardless
    expect(mockedSupabaseFrom).toHaveBeenCalledWith('users')
    expect(mockedSupabaseFrom).toHaveBeenCalledWith('payments_v2')

    // You might need more specific assertions on the *inner* mocks if you expose them,
    // but checking the final result and top-level calls is often sufficient.
  })

  it('should return active subscription for NEUROTESTER regardless of date', async () => {
    // Arrange
    const pastDate = new Date('2023-01-01T00:00:00Z').toISOString()

    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        // User exists
        return {
          select: vi.fn((columns, options) => {
            if (options?.count === 'exact' && options?.head === true) {
              const userEqMock = vi
                .fn()
                .mockResolvedValue({ count: 1, error: null }) // User found
              return { eq: userEqMock }
            }
            const fallbackEq = vi
              .fn()
              .mockResolvedValue({ data: [], error: null })
            return { eq: fallbackEq }
          }),
        }
      } else if (tableName === 'payments_v2') {
        // NEUROTESTER payment found
        const paymentData = {
          subscription_type: 'NEUROTESTER',
          payment_date: pastDate,
        }
        const paymentMaybeSingleMock = vi
          .fn()
          .mockResolvedValue({ data: paymentData, error: null })
        const paymentLimitMock = vi.fn(() => ({
          maybeSingle: paymentMaybeSingleMock,
        }))
        const paymentOrderMock = vi.fn(() => ({ limit: paymentLimitMock }))
        const paymentNotNullMock = vi.fn(() => ({ order: paymentOrderMock }))
        const paymentStatusEqMock = vi.fn(() => ({ not: paymentNotNullMock }))
        const paymentTelegramEqMock = vi.fn(() => ({ eq: paymentStatusEqMock }))
        return {
          select: vi.fn().mockReturnValue({ eq: paymentTelegramEqMock }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    // Act
    const result = await getUserDetailsSubscription(testTelegramId)

    // Assert
    expect(result).toEqual({
      isExist: true, // User exists (count was 1)
      isSubscriptionActive: true, // NEUROTESTER is always active
      subscriptionType: SubscriptionType.NEUROTESTER,
      subscriptionStartDate: pastDate,
      stars: 100,
    })
    expect(mockedSupabaseFrom).toHaveBeenCalledTimes(2)
    expect(mockedGetUserBalance).toHaveBeenCalledWith(testTelegramIdStr)
  })

  it('should return inactive subscription if payment date is older than 30 days', async () => {
    // Arrange
    const veryOldDate = new Date()
    veryOldDate.setDate(veryOldDate.getDate() - 40) // More than 30 days ago
    const paymentDateISO = veryOldDate.toISOString()

    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        // User exists
        return {
          select: vi.fn((columns, options) => {
            if (options?.count === 'exact' && options?.head === true) {
              const userEqMock = vi
                .fn()
                .mockResolvedValue({ count: 1, error: null })
              return { eq: userEqMock }
            }
            const fallbackEq = vi
              .fn()
              .mockResolvedValue({ data: [], error: null })
            return { eq: fallbackEq }
          }),
        }
      } else if (tableName === 'payments_v2') {
        // Expired NEUROBASE payment found
        const paymentData = {
          subscription_type: 'NEUROBASE',
          payment_date: paymentDateISO,
        }
        const paymentMaybeSingleMock = vi
          .fn()
          .mockResolvedValue({ data: paymentData, error: null })
        const paymentLimitMock = vi.fn(() => ({
          maybeSingle: paymentMaybeSingleMock,
        }))
        const paymentOrderMock = vi.fn(() => ({ limit: paymentLimitMock }))
        const paymentNotNullMock = vi.fn(() => ({ order: paymentOrderMock }))
        const paymentStatusEqMock = vi.fn(() => ({ not: paymentNotNullMock }))
        const paymentTelegramEqMock = vi.fn(() => ({ eq: paymentStatusEqMock }))
        return {
          select: vi.fn().mockReturnValue({ eq: paymentTelegramEqMock }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    // Act
    const result = await getUserDetailsSubscription(testTelegramId)

    // Assert
    expect(result).toEqual({
      isExist: true,
      isSubscriptionActive: false, // Expired
      subscriptionType: SubscriptionType.NEUROBASE,
      subscriptionStartDate: paymentDateISO,
      stars: 100,
    })
    expect(mockedSupabaseFrom).toHaveBeenCalledTimes(2)
    expect(mockedGetUserBalance).toHaveBeenCalledWith(testTelegramIdStr)
  })

  it('should return active subscription if payment date is within 30 days', async () => {
    // Arrange
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 15) // 15 days ago
    const paymentDateISO = recentDate.toISOString()

    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        // User exists
        return {
          select: vi.fn((columns, options) => {
            if (options?.count === 'exact' && options?.head === true) {
              const userEqMock = vi
                .fn()
                .mockResolvedValue({ count: 1, error: null })
              return { eq: userEqMock }
            }
            const fallbackEq = vi
              .fn()
              .mockResolvedValue({ data: [], error: null })
            return { eq: fallbackEq }
          }),
        }
      } else if (tableName === 'payments_v2') {
        // Active NEUROPHOTO payment found
        const paymentData = {
          subscription_type: 'NEUROPHOTO',
          payment_date: paymentDateISO,
        }
        const paymentMaybeSingleMock = vi
          .fn()
          .mockResolvedValue({ data: paymentData, error: null })
        const paymentLimitMock = vi.fn(() => ({
          maybeSingle: paymentMaybeSingleMock,
        }))
        const paymentOrderMock = vi.fn(() => ({ limit: paymentLimitMock }))
        const paymentNotNullMock = vi.fn(() => ({ order: paymentOrderMock }))
        const paymentStatusEqMock = vi.fn(() => ({ not: paymentNotNullMock }))
        const paymentTelegramEqMock = vi.fn(() => ({ eq: paymentStatusEqMock }))
        return {
          select: vi.fn().mockReturnValue({ eq: paymentTelegramEqMock }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    // Act
    const result = await getUserDetailsSubscription(testTelegramId)

    // Assert
    expect(result).toEqual({
      isExist: true,
      isSubscriptionActive: true, // Active
      subscriptionType: SubscriptionType.NEUROPHOTO,
      subscriptionStartDate: paymentDateISO,
      stars: 100,
    })
    expect(mockedSupabaseFrom).toHaveBeenCalledTimes(2)
    expect(mockedGetUserBalance).toHaveBeenCalledWith(testTelegramIdStr)
  })

  it('should handle database error when fetching user', async () => {
    // Arrange
    const dbError = new Error('User fetch failed')
    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        // Simulate error on user fetch
        return {
          select: vi.fn((columns, options) => {
            if (options?.count === 'exact' && options?.head === true) {
              const userEqMock = vi
                .fn()
                .mockResolvedValue({ count: null, error: dbError }) // ERROR HERE
              return { eq: userEqMock }
            }
            const fallbackEq = vi
              .fn()
              .mockResolvedValue({ data: [], error: null })
            return { eq: fallbackEq }
          }),
        }
      } else if (tableName === 'payments_v2') {
        // Payment check might still run, mock it normally
        const paymentMaybeSingleMock = vi
          .fn()
          .mockResolvedValue({ data: null, error: null })
        const paymentLimitMock = vi.fn(() => ({
          maybeSingle: paymentMaybeSingleMock,
        }))
        const paymentOrderMock = vi.fn(() => ({ limit: paymentLimitMock }))
        const paymentNotNullMock = vi.fn(() => ({ order: paymentOrderMock }))
        const paymentStatusEqMock = vi.fn(() => ({ not: paymentNotNullMock }))
        const paymentTelegramEqMock = vi.fn(() => ({ eq: paymentStatusEqMock }))
        return {
          select: vi.fn().mockReturnValue({ eq: paymentTelegramEqMock }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    // Act
    const result = await getUserDetailsSubscription(testTelegramId)

    // Assert
    expect(result).toEqual({
      isExist: false, // Error treated as non-existence
      isSubscriptionActive: false,
      subscriptionType: null,
      subscriptionStartDate: null,
      stars: 100, // Balance fetched separately
    })
    expect(mockedGetUserBalance).toHaveBeenCalledWith(testTelegramIdStr)
    // Verify logger was called
    // expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error checking user existence'), expect.any(Object))
  })

  it('should handle database error when fetching payments', async () => {
    // Arrange
    const dbError = new Error('Payment fetch failed')
    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        // User exists
        return {
          select: vi.fn((columns, options) => {
            if (options?.count === 'exact' && options?.head === true) {
              const userEqMock = vi
                .fn()
                .mockResolvedValue({ count: 1, error: null })
              return { eq: userEqMock }
            }
            const fallbackEq = vi
              .fn()
              .mockResolvedValue({ data: [], error: null })
            return { eq: fallbackEq }
          }),
        }
      } else if (tableName === 'payments_v2') {
        // Simulate error on payment fetch
        const paymentMaybeSingleMock = vi
          .fn()
          .mockResolvedValue({ data: null, error: dbError }) // ERROR HERE
        const paymentLimitMock = vi.fn(() => ({
          maybeSingle: paymentMaybeSingleMock,
        }))
        const paymentOrderMock = vi.fn(() => ({ limit: paymentLimitMock }))
        const paymentNotNullMock = vi.fn(() => ({ order: paymentOrderMock }))
        const paymentStatusEqMock = vi.fn(() => ({ not: paymentNotNullMock }))
        const paymentTelegramEqMock = vi.fn(() => ({ eq: paymentStatusEqMock }))
        return {
          select: vi.fn().mockReturnValue({ eq: paymentTelegramEqMock }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    // Act
    const result = await getUserDetailsSubscription(testTelegramId)

    // Assert
    expect(result).toEqual({
      isExist: true, // User exists
      isSubscriptionActive: false, // Default due to payment error
      subscriptionType: null,
      subscriptionStartDate: null,
      stars: 100,
    })
    expect(mockedGetUserBalance).toHaveBeenCalledWith(testTelegramIdStr)
    // Verify logger was called
    // expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching latest payment'), expect.any(Object))
  })

  it('should handle error when fetching balance', async () => {
    // Arrange
    // Mock normal DB responses for user and payments
    mockedSupabaseFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        // User exists
        return {
          select: vi.fn((columns, options) => {
            if (options?.count === 'exact' && options?.head === true) {
              const userEqMock = vi
                .fn()
                .mockResolvedValue({ count: 1, error: null })
              return { eq: userEqMock }
            }
            const fallbackEq = vi
              .fn()
              .mockResolvedValue({ data: [], error: null })
            return { eq: fallbackEq }
          }),
        }
      } else if (tableName === 'payments_v2') {
        // No relevant payments found
        const paymentMaybeSingleMock = vi
          .fn()
          .mockResolvedValue({ data: null, error: null })
        const paymentLimitMock = vi.fn(() => ({
          maybeSingle: paymentMaybeSingleMock,
        }))
        const paymentOrderMock = vi.fn(() => ({ limit: paymentLimitMock }))
        const paymentNotNullMock = vi.fn(() => ({ order: paymentOrderMock }))
        const paymentStatusEqMock = vi.fn(() => ({ not: paymentNotNullMock }))
        const paymentTelegramEqMock = vi.fn(() => ({ eq: paymentStatusEqMock }))
        return {
          select: vi.fn().mockReturnValue({ eq: paymentTelegramEqMock }),
        }
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    })

    // Simulate error in getUserBalance
    const balanceError = new Error('Failed to get balance')
    mockedGetUserBalance.mockRejectedValue(balanceError)

    // Act
    const result = await getUserDetailsSubscription(testTelegramId)

    // Assert
    expect(result).toEqual({
      isExist: true, // User exists
      isSubscriptionActive: false, // No payments found
      subscriptionType: null,
      subscriptionStartDate: null,
      stars: 0, // Balance defaults to 0 on error
    })
    expect(mockedGetUserBalance).toHaveBeenCalledWith(testTelegramIdStr)
    // Verify logger was called
    // expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error getting user balance'), expect.any(Object))
  })
})
