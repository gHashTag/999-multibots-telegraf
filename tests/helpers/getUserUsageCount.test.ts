import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test'
import { getUserUsageCount, isReturningUser, shouldSkipOnboarding } from '@/helpers/getUserUsageCount'

/**
 * @test getUserUsageCount Function Testing
 * @description Tests the new usage count logic for determining user experience level
 * @focus Transaction history analysis, returning user detection, onboarding skip logic
 */

describe('getUserUsageCount Function Tests', () => {
  let mockGetUserBalanceStatsOptimized: any

  beforeEach(() => {
    // Reset all mocks
    mockGetUserBalanceStatsOptimized = mock(() => Promise.resolve(null))

    // Mock the module
    mock.module('@/core/supabase/getUserBalanceStatsOptimized', () => ({
      getUserBalanceStatsOptimized: mockGetUserBalanceStatsOptimized
    }))

    // Mock logger
    mock.module('@/utils/logger', () => ({
      logger: {
        info: mock(() => {}),
        error: mock(() => {}),
        warn: mock(() => {}),
        debug: mock(() => {})
      }
    }))
  })

  describe('getUserUsageCount', () => {
    it('should return 0 for new users with no transactions', async () => {
      // Setup: No transaction history
      mockGetUserBalanceStatsOptimized.mockReturnValue(Promise.resolve(null))

      const result = await getUserUsageCount('123456789', 'test_bot')

      expect(result).toBe(0)
      expect(mockGetUserBalanceStatsOptimized).toHaveBeenCalledTimes(1)
    })

    it('should return correct usage count for experienced users', async () => {
      // Setup: User with transaction history
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 15,
        current_balance: 1000,
        total_real_income: 500,
        total_bonus_income: 200,
        total_outcome: 300,
        services_breakdown: [
          { service_name: 'AI_HERO', transaction_count: 10 },
          { service_name: 'AI_PHOTOSHOP', transaction_count: 5 }
        ]
      })

      const result = await getUserUsageCount('987654321', 'test_bot')

      expect(result).toBe(15)
    })

    it('should handle missing total_transactions field gracefully', async () => {
      // Setup: Stats exist but total_transactions is undefined
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        current_balance: 500,
        total_real_income: 100,
        total_bonus_income: 50,
        total_outcome: 75,
        services_breakdown: []
        // total_transactions missing
      })

      const result = await getUserUsageCount('555666777', 'test_bot')

      expect(result).toBe(0) // Should default to 0
    })

    it('should handle database errors gracefully', async () => {
      // Setup: Database error
      mockGetUserBalanceStatsOptimized.mockRejectedValue(new Error('Database connection failed'))

      const result = await getUserUsageCount('111222333', 'test_bot')

      expect(result).toBe(0) // Should return 0 as fallback for UX safety
    })

    it('should work with or without bot name parameter', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 8,
        current_balance: 200
      })

      // With bot name
      const result1 = await getUserUsageCount('123456789', 'specific_bot')
      expect(result1).toBe(8)

      // Without bot name
      const result2 = await getUserUsageCount('123456789')
      expect(result2).toBe(8)
    })
  })

  describe('isReturningUser', () => {
    it('should identify new users correctly', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue(null)

      const result = await isReturningUser('123456789', 'test_bot')

      expect(result).toBe(false)
    })

    it('should identify returning users with default threshold', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 3,
        current_balance: 100
      })

      const result = await isReturningUser('123456789', 'test_bot')

      expect(result).toBe(true) // 3 >= 1 (default threshold)
    })

    it('should respect custom threshold values', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 2,
        current_balance: 100
      })

      const result1 = await isReturningUser('123456789', 'test_bot', 1)
      expect(result1).toBe(true) // 2 >= 1

      const result2 = await isReturningUser('123456789', 'test_bot', 3)
      expect(result2).toBe(false) // 2 < 3

      const result3 = await isReturningUser('123456789', 'test_bot', 5)
      expect(result3).toBe(false) // 2 < 5
    })

    it('should handle edge case at threshold boundary', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 1,
        current_balance: 50
      })

      const result = await isReturningUser('123456789', 'test_bot', 1)

      expect(result).toBe(true) // Exactly at threshold should return true
    })
  })

  describe('shouldSkipOnboarding', () => {
    it('should not skip onboarding for completely new users', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue(null)

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(false)
    })

    it('should skip onboarding for users with multiple transactions', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 5, // > 2
        total_real_income: 0,
        total_bonus_income: 0,
        services_breakdown: [
          { service_name: 'AI_HERO', transaction_count: 5 }
        ]
      })

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(true) // Should skip due to multiple transactions
    })

    it('should skip onboarding for users with any income', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 1, // <= 2
        total_real_income: 100, // Has real income
        total_bonus_income: 0,
        services_breakdown: [
          { service_name: 'AI_PHOTOSHOP', transaction_count: 1 }
        ]
      })

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(true) // Should skip due to income
    })

    it('should skip onboarding for users with bonus income', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 2, // <= 2
        total_real_income: 0,
        total_bonus_income: 50, // Has bonus income
        services_breakdown: [
          { service_name: 'AI_HERO', transaction_count: 2 }
        ]
      })

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(true) // Should skip due to bonus income
    })

    it('should skip onboarding for users who used multiple services', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 2, // <= 2
        total_real_income: 0,
        total_bonus_income: 0,
        services_breakdown: [
          { service_name: 'AI_HERO', transaction_count: 1 },
          { service_name: 'AI_PHOTOSHOP', transaction_count: 1 } // Multiple services
        ]
      })

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(true) // Should skip due to multiple services used
    })

    it('should not skip onboarding for minimal usage users', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 1, // <= 2
        total_real_income: 0,  // No income
        total_bonus_income: 0, // No bonus income
        services_breakdown: [
          { service_name: 'AI_HERO', transaction_count: 1 } // Single service only
        ]
      })

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(false) // Should NOT skip - minimal usage
    })

    it('should fallback to isReturningUser on error', async () => {
      // First call fails (advanced analysis)
      mockGetUserBalanceStatsOptimized
        .mockRejectedValueOnce(new Error('Advanced analysis failed'))
        .mockResolvedValueOnce({ total_transactions: 3 }) // Fallback call succeeds

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(true) // Should fallback to simple returning user check
      expect(mockGetUserBalanceStatsOptimized).toHaveBeenCalledTimes(2)
    })

    it('should handle complete database failure gracefully', async () => {
      // Both calls fail
      mockGetUserBalanceStatsOptimized.mockRejectedValue(new Error('Complete database failure'))

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(false) // Should default to false (show onboarding) for safety
    })
  })

  describe('Edge Cases and Performance', () => {
    it('should handle very large transaction counts', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 999999, // Very large number
        total_real_income: 50000,
        total_bonus_income: 25000,
        services_breakdown: new Array(50).fill(null).map((_, i) => ({
          service_name: `SERVICE_${i}`,
          transaction_count: Math.floor(999999 / 50)
        }))
      })

      const result = await getUserUsageCount('123456789', 'test_bot')

      expect(result).toBe(999999)
      expect(typeof result).toBe('number')
      expect(Number.isFinite(result)).toBe(true)
    })

    it('should handle malformed service breakdown data', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 5,
        total_real_income: 100,
        total_bonus_income: 50,
        services_breakdown: null // Malformed data
      })

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(true) // Should still work based on transactions and income
    })

    it('should handle empty services breakdown', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 1,
        total_real_income: 0,
        total_bonus_income: 0,
        services_breakdown: [] // Empty array
      })

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(false) // Should not skip with minimal usage
    })

    it('should handle inconsistent data gracefully', async () => {
      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 0, // Inconsistent with services
        total_real_income: 100,
        total_bonus_income: 0,
        services_breakdown: [
          { service_name: 'AI_HERO', transaction_count: 5 } // More than total
        ]
      })

      const result = await shouldSkipOnboarding('123456789', 'test_bot')

      expect(result).toBe(true) // Should skip due to income, despite inconsistent data
    })

    it('should normalize telegram IDs consistently', async () => {
      const telegramIds = [
        123456789,      // number
        '123456789',    // string
        '0123456789',   // string with leading zero
      ]

      mockGetUserBalanceStatsOptimized.mockResolvedValue({
        total_transactions: 3,
        current_balance: 100
      })

      for (const id of telegramIds) {
        const result = await getUserUsageCount(id as any, 'test_bot')
        expect(result).toBe(3)
      }

      // Should normalize all IDs to string format
      expect(mockGetUserBalanceStatsOptimized).toHaveBeenCalledWith(
        expect.any(String), // Should be normalized to string
        'test_bot',
        1,
        1
      )
    })
  })

  describe('Performance Characteristics', () => {
    it('should complete usage count check within performance threshold', async () => {
      mockGetUserBalanceStatsOptimized.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              total_transactions: 42,
              current_balance: 500
            })
          }, 5) // 5ms delay
        })
      )

      const start = performance.now()
      const result = await getUserUsageCount('123456789', 'test_bot')
      const end = performance.now()

      expect(result).toBe(42)
      expect(end - start).toBeLessThan(50) // Should complete under 50ms
    })

    it('should handle concurrent usage count requests efficiently', async () => {
      const userIds = Array.from({ length: 20 }, (_, i) => `12345${i.toString().padStart(4, '0')}`)

      mockGetUserBalanceStatsOptimized.mockImplementation((telegramId) => {
        const userId = parseInt(telegramId.slice(-1))
        return Promise.resolve({
          total_transactions: userId * 5,
          current_balance: userId * 100
        })
      })

      const start = performance.now()
      const promises = userIds.map(id => getUserUsageCount(id, 'test_bot'))
      const results = await Promise.all(promises)
      const end = performance.now()

      expect(results).toHaveLength(20)
      expect(end - start).toBeLessThan(100) // Should complete all within 100ms

      // Verify different usage counts were processed
      const uniqueResults = [...new Set(results)]
      expect(uniqueResults.length).toBeGreaterThan(1)
    })
  })
})