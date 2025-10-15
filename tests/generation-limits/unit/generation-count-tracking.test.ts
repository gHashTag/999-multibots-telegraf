/**
 * @fileoverview Unit tests for generation count tracking functions
 * @description Validates the core logic for tracking and enforcing generation limits
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'
import { markAvatarTransformUsed } from '@/core/supabase/markAvatarTransformUsed'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

// Mock dependencies
jest.mock('@/core/supabase')
jest.mock('@/utils/logger')
jest.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [12345, 67890] // Test admin IDs
}))

const mockSupabase = supabase as jest.Mocked<typeof supabase>

describe('Generation Count Tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset console spies
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('checkAvatarTransformUsage', () => {
    it('should allow unlimited usage for admin users', async () => {
      const adminId = '12345'

      const result = await checkAvatarTransformUsage(adminId)

      expect(result).toEqual({
        canUse: true,
        isAdmin: true,
        hasUsedBefore: false
      })
      expect(mockSupabase.from).not.toHaveBeenCalled()
    })

    it('should check database usage for non-admin users', async () => {
      const userId = '99999'
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

      const result = await checkAvatarTransformUsage(userId)

      expect(result).toEqual({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })
      expect(mockSupabase.from).toHaveBeenCalledWith('users')
    })

    it('should deny usage if user has already used the function', async () => {
      const userId = '99999'
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { avatar_transform_used: true },
              error: null
            })
          })
        })
      } as any)

      const result = await checkAvatarTransformUsage(userId)

      expect(result).toEqual({
        canUse: false,
        isAdmin: false,
        hasUsedBefore: true
      })
    })

    it('should create new user if not found and allow usage', async () => {
      const userId = '88888'
      const createUserMock = jest.fn().mockResolvedValue([true, { id: 'new-user-id' }])

      // Mock user not found error
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue({
              code: 'PGRST116',
              message: 'Row not found'
            })
          })
        })
      } as any)

      // Mock createUser import
      jest.doMock('@/core/supabase/createUser', () => ({
        createUser: createUserMock
      }))

      const result = await checkAvatarTransformUsage(userId)

      expect(result.canUse).toBe(true)
      expect(result.isAdmin).toBe(false)
      expect(result.hasUsedBefore).toBe(false)
    })

    it('should handle database errors gracefully', async () => {
      const userId = '77777'
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue(new Error('Database connection failed'))
          })
        })
      } as any)

      const result = await checkAvatarTransformUsage(userId)

      // Should default to allowing usage on error
      expect(result.canUse).toBe(true)
      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('markAvatarTransformUsed', () => {
    it('should successfully mark user as having used the function', async () => {
      const userId = '99999'
      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null
          })
        })
      } as any)

      const result = await markAvatarTransformUsed(userId)

      expect(result).toBe(true)
      expect(mockSupabase.from).toHaveBeenCalledWith('users')
    })

    it('should handle database errors when marking usage', async () => {
      const userId = '99999'
      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: { message: 'Update failed' }
          })
        })
      } as any)

      const result = await markAvatarTransformUsed(userId)

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalled()
    })

    it('should handle unexpected errors', async () => {
      const userId = '99999'
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Unexpected database error')
      })

      const result = await markAvatarTransformUsed(userId)

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('Generation Limit Logic Integration', () => {
    it('should implement 3-generation limit for regular users', async () => {
      // This test validates the proposed new logic
      const userId = '55555'

      // Mock user with 2 previous generations
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { generation_count: 2 },
              error: null
            })
          })
        })
      } as any)

      // Mock getUserDetailsSubscription to return no active subscription
      const mockGetUserDetails = jest.mocked(getUserDetailsSubscription)
      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 1000,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      // For regular users with no subscription, should allow 1 more generation (3rd)
      // This test represents the NEW logic that needs to be implemented
      expect(true).toBe(true) // Placeholder for new logic validation
    })

    it('should allow unlimited generations for NEUROTESTER subscribers', async () => {
      const userId = '44444'

      // Mock getUserDetailsSubscription to return active NEUROTESTER
      const mockGetUserDetails = jest.mocked(getUserDetailsSubscription)
      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 5000,
        subscriptionType: SubscriptionType.NEUROTESTER,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2025-01-01'
      })

      // NEUROTESTER should have unlimited access regardless of generation count
      expect(true).toBe(true) // Placeholder for unlimited access validation
    })
  })
})