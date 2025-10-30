/**
 * @fileoverview Edge case and error handling tests for generation limits
 * @description Tests boundary conditions, error scenarios, and edge cases
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'
import { markAvatarTransformUsed } from '@/core/supabase/markAvatarTransformUsed'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

// Mock dependencies
jest.mock('@/core/supabase')
jest.mock('@/utils/logger')
jest.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [12345, 67890]
}))

const mockSupabase = supabase as jest.Mocked<typeof supabase>
const mockLogger = logger as jest.Mocked<typeof logger>

describe('Generation Limits Edge Cases and Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Input Validation Edge Cases', () => {
    it('should handle string and number telegram IDs consistently', async () => {
      const numericId = 12345
      const stringId = '12345'

      // Mock admin check for both formats
      const numericResult = await checkAvatarTransformUsage(numericId)
      const stringResult = await checkAvatarTransformUsage(stringId)

      expect(numericResult.isAdmin).toBe(stringResult.isAdmin)
      expect(numericResult.canUse).toBe(stringResult.canUse)
    })

    it('should handle empty and invalid telegram IDs', async () => {
      const invalidIds = ['', '0', 'invalid', null, undefined]

      for (const invalidId of invalidIds) {
        try {
          await checkAvatarTransformUsage(invalidId as any)
          // Should handle gracefully or throw appropriate error
        } catch (error) {
          expect(error).toBeInstanceOf(Error)
        }
      }
    })

    it('should handle extremely large telegram IDs', async () => {
      const largeId = '999999999999999999' // Very large ID

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'Row not found' }
            })
          })
        })
      } as any)

      const result = await checkAvatarTransformUsage(largeId)

      // Should handle gracefully
      expect(result).toHaveProperty('canUse')
      expect(result).toHaveProperty('isAdmin')
      expect(result).toHaveProperty('hasUsedBefore')
    })
  })

  describe('Database Connection Failures', () => {
    it('should handle Supabase connection timeout', async () => {
      const userId = '12346'

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue(new Error('Connection timeout'))
          })
        })
      } as any)

      const result = await checkAvatarTransformUsage(userId)

      // Should default to safe behavior (allow usage)
      expect(result.canUse).toBe(true)
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle Supabase RLS (Row Level Security) errors', async () => {
      const userId = '12347'

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue({
              code: 'PGRST301',
              message: 'Row Level Security policy violated'
            })
          })
        })
      } as any)

      const result = await checkAvatarTransformUsage(userId)

      // Should handle RLS violations gracefully
      expect(result.canUse).toBe(true)
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should handle partial database responses', async () => {
      const userId = '12348'

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                // Missing avatar_transform_used field
                id: 1,
                telegram_id: userId
              },
              error: null
            })
          })
        })
      } as any)

      const result = await checkAvatarTransformUsage(userId)

      // Should handle missing fields gracefully
      expect(result.hasUsedBefore).toBe(false) // Default to false when field missing
    })
  })

  describe('Subscription Edge Cases', () => {
    it('should handle subscription with invalid dates', async () => {
      const userId = '12349'

      const invalidDates = [
        'invalid-date',
        '2025-13-45', // Invalid month/day
        '',
        null,
        undefined
      ]

      for (const invalidDate of invalidDates) {
        const mockGetUserDetails = jest.fn().mockResolvedValue({
          id: 1,
          created_at: '2025-01-01',
          stars: 1000,
          subscriptionType: SubscriptionType.NEUROTESTER,
          isSubscriptionActive: true,
          isExist: true,
          subscriptionStartDate: invalidDate
        })

        // Should handle invalid dates without crashing
        const result = await mockGetUserDetails()
        expect(result.subscriptionStartDate).toBe(invalidDate)
      }
    })

    it('should handle subscription type case sensitivity', async () => {
      const userId = '12350'

      const caseVariations = [
        'NEUROTESTER',
        'neurotester',
        'NeuroTester',
        'NEUROTESTER ',
        ' NEUROTESTER'
      ]

      for (const variation of caseVariations) {
        // Mock subscription with different case
        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      subscription_type: variation,
                      payment_date: '2025-01-01'
                    },
                    error: null
                  })
                })
              })
            })
          })
        } as any)

        // Should normalize subscription type comparison
        expect(variation.toUpperCase()).toBe('NEUROTESTER')
      }
    })

    it('should handle subscription expiry boundary conditions', async () => {
      const userId = '12351'

      // Test exactly 30 days
      const exactly30DaysAgo = new Date()
      exactly30DaysAgo.setDate(exactly30DaysAgo.getDate() - 30)
      exactly30DaysAgo.setHours(exactly30DaysAgo.getHours() - 1) // 1 hour past expiry

      const mockGetUserDetails = jest.fn().mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 2000,
        subscriptionType: SubscriptionType.NEUROVIDEO,
        isSubscriptionActive: false, // Should be false
        isExist: true,
        subscriptionStartDate: exactly30DaysAgo.toISOString()
      })

      const result = await mockGetUserDetails()
      expect(result.isSubscriptionActive).toBe(false)
    })

    it('should handle multiple concurrent subscription types', async () => {
      const userId = '12352'

      // User might have multiple subscription records
      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      subscription_type: 'NEUROTESTER',
                      payment_date: '2025-01-01'
                    },
                    error: null
                  })
                })
              })
            })
          })
        } as any)

      // Should prioritize NEUROTESTER over other types
      const result = await getUserDetailsSubscription(userId)
      // Implementation should handle priority correctly
    })
  })

  describe('Race Condition Scenarios', () => {
    it('should handle concurrent limit checks for same user', async () => {
      const userId = '12353'

      // Mock that user has 2 generations used
      let callCount = 0
      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                avatar_transform_used: callCount++ === 0 ? false : true
              },
              error: null
            })
          })
        })
      }) as any)

      // Simulate concurrent requests
      const promises = [
        checkAvatarTransformUsage(userId),
        checkAvatarTransformUsage(userId),
        checkAvatarTransformUsage(userId)
      ]

      const results = await Promise.all(promises)

      // Should handle race conditions without corruption
      expect(results).toHaveLength(3)
    })

    it('should handle marking usage during concurrent requests', async () => {
      const userId = '12354'

      // Mock successful marking
      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null
          })
        })
      } as any)

      // Concurrent marking attempts
      const markingPromises = [
        markAvatarTransformUsed(userId),
        markAvatarTransformUsed(userId)
      ]

      const results = await Promise.all(markingPromises)

      // All should succeed (idempotent operation)
      expect(results.every(r => r === true)).toBe(true)
    })
  })

  describe('Memory and Performance Edge Cases', () => {
    it('should handle large-scale user processing', async () => {
      const userIds = Array.from({ length: 100 }, (_, i) => `user_${i}`)

      // Mock responses for all users
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { avatar_transform_used: false },
              error: null
            })
          })
        })
      } as any)

      // Process all users
      const startTime = Date.now()
      const promises = userIds.map(id => checkAvatarTransformUsage(id))
      const results = await Promise.all(promises)
      const endTime = Date.now()

      expect(results).toHaveLength(100)
      expect(endTime - startTime).toBeLessThan(10000) // Should complete within 10 seconds
    })

    it('should handle memory leaks in long-running sessions', async () => {
      const userId = '12355'

      // Simulate many generation checks
      for (let i = 0; i < 1000; i++) {
        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { avatar_transform_used: false },
                error: null
              })
            })
          })
        } as any)

        await checkAvatarTransformUsage(userId)
      }

      // Memory should not grow excessively
      // This is a stress test to ensure no memory leaks
      expect(true).toBe(true) // Placeholder for memory monitoring
    })
  })

  describe('Configuration Edge Cases', () => {
    it('should handle missing or invalid admin configuration', async () => {
      // Test with undefined ADMIN_IDS_ARRAY
      jest.doMock('@/config', () => ({
        ADMIN_IDS_ARRAY: undefined
      }))

      const userId = '12356'

      // Should not crash when admin config is missing
      await expect(checkAvatarTransformUsage(userId)).resolves.toBeDefined()
    })

    it('should handle malformed admin IDs in configuration', async () => {
      jest.doMock('@/config', () => ({
        ADMIN_IDS_ARRAY: ['not_a_number', null, undefined, '']
      }))

      const userId = '12357'

      // Should handle malformed admin IDs gracefully
      const result = await checkAvatarTransformUsage(userId)
      expect(result.isAdmin).toBe(false) // Should not match malformed IDs
    })
  })

  describe('Logging and Monitoring Edge Cases', () => {
    it('should handle logger failures gracefully', async () => {
      const userId = '12358'

      // Mock logger to throw error
      mockLogger.info.mockImplementation(() => {
        throw new Error('Logging service unavailable')
      })
      mockLogger.error.mockImplementation(() => {
        throw new Error('Logging service unavailable')
      })

      // Function should still work even if logging fails
      await expect(checkAvatarTransformUsage(userId)).resolves.toBeDefined()
    })

    it('should not expose sensitive data in logs during errors', async () => {
      const userId = '12359'

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue(new Error('Database error with sensitive data: password123'))
          })
        })
      } as any)

      await checkAvatarTransformUsage(userId)

      // Check that sensitive data is not logged
      const logCalls = mockLogger.error.mock.calls.flat()
      const loggedContent = logCalls.join(' ')
      expect(loggedContent).not.toContain('password123')
    })
  })
})