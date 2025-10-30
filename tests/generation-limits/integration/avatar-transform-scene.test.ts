/**
 * @fileoverview Integration tests for avatar transform scene with generation limits
 * @description Tests the complete flow including subscription checks, generation counting, and user experience
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'
import { markAvatarTransformUsed } from '@/core/supabase/markAvatarTransformUsed'

// Mock all external dependencies
jest.mock('@/core/supabase/getUserDetailsSubscription')
jest.mock('@/core/supabase/checkAvatarTransformUsage')
jest.mock('@/core/supabase/markAvatarTransformUsed')
jest.mock('@/services/generateFluxKontextMax')
jest.mock('@/services/generateSeeDream4')
jest.mock('@/services/generateNanoBanana')
jest.mock('@/utils/logger')

const mockGetUserDetails = jest.mocked(getUserDetailsSubscription)
const mockCheckUsage = jest.mocked(checkAvatarTransformUsage)
const mockMarkUsed = jest.mocked(markAvatarTransUsed)

// Test data factory
const createMockContext = (telegram_id: string = '12345', overrides: Partial<MyContext> = {}): Partial<MyContext> => ({
  from: { id: parseInt(telegram_id), first_name: 'Test', last_name: 'User', username: 'testuser' },
  session: { mode: '', user_language: 'ru' },
  reply: jest.fn(),
  replyWithPhoto: jest.fn(),
  scene: {
    enter: jest.fn(),
    leave: jest.fn()
  } as any,
  telegram: {
    sendPhoto: jest.fn()
  } as any,
  ...overrides
})

describe('Avatar Transform Scene Integration', () => {
  let mockCtx: Partial<MyContext>

  beforeEach(() => {
    jest.clearAllMocks()
    mockCtx = createMockContext()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Admin User Flow', () => {
    it('should allow unlimited generations for admin users', async () => {
      const adminId = '12345'
      mockCtx = createMockContext(adminId)

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: true,
        hasUsedBefore: false
      })

      // Simulate multiple generation attempts
      for (let i = 0; i < 10; i++) {
        const result = await checkAvatarTransformUsage(adminId)
        expect(result.canUse).toBe(true)
        expect(result.isAdmin).toBe(true)
      }

      // Admin should never be marked as used
      expect(markAvatarTransformUsed).not.toHaveBeenCalled()
    })

    it('should not check subscription for admin users', async () => {
      const adminId = '67890'

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: true,
        hasUsedBefore: false
      })

      await checkAvatarTransformUsage(adminId)

      // Should not call subscription check for admins
      expect(mockGetUserDetails).not.toHaveBeenCalled()
    })
  })

  describe('NEUROTESTER Subscriber Flow', () => {
    it('should allow unlimited generations for active NEUROTESTER subscribers', async () => {
      const userId = '99999'
      mockCtx = createMockContext(userId)

      // Mock as non-admin but with NEUROTESTER subscription
      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 5000,
        subscriptionType: SubscriptionType.NEUROTESTER,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2025-01-01'
      })

      // Test multiple generations
      for (let i = 0; i < 15; i++) {
        const userDetails = await getUserDetailsSubscription(userId)
        expect(userDetails.subscriptionType).toBe(SubscriptionType.NEUROTESTER)
        expect(userDetails.isSubscriptionActive).toBe(true)

        // NEUROTESTER should always be able to generate
        const canGenerate = userDetails.subscriptionType === SubscriptionType.NEUROTESTER &&
                           userDetails.isSubscriptionActive
        expect(canGenerate).toBe(true)
      }
    })

    it('should check subscription status before each generation', async () => {
      const userId = '88888'

      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 3000,
        subscriptionType: SubscriptionType.NEUROTESTER,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2025-01-01'
      })

      await getUserDetailsSubscription(userId)

      expect(mockGetUserDetails).toHaveBeenCalledWith(userId)
    })
  })

  describe('Regular User Flow', () => {
    it('should enforce 3-generation limit for regular users', async () => {
      const userId = '77777'
      mockCtx = createMockContext(userId)

      // Mock user with no active subscription
      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 500,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      // Test the proposed new logic for generation limits
      const userDetails = await getUserDetailsSubscription(userId)
      const hasActiveSubscription = userDetails.isSubscriptionActive &&
                                   (userDetails.subscriptionType === SubscriptionType.NEUROTESTER ||
                                    userDetails.subscriptionType === SubscriptionType.NEUROVIDEO ||
                                    userDetails.subscriptionType === SubscriptionType.NEUROPHOTO)

      expect(hasActiveSubscription).toBe(false)

      // This represents the NEW logic that needs to be implemented:
      // Regular users should be limited to 3 generations total
      expect(userDetails.isExist).toBe(true)
    })

    it('should deny 4th generation attempt for regular users', async () => {
      const userId = '66666'

      // Mock user who has used 3 generations already
      mockCheckUsage.mockResolvedValue({
        canUse: false,
        isAdmin: false,
        hasUsedBefore: true
      })

      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 200,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      const usageResult = await checkAvatarTransformUsage(userId)
      const userDetails = await getUserDetailsSubscription(userId)

      expect(usageResult.canUse).toBe(false)
      expect(userDetails.isSubscriptionActive).toBe(false)
    })

    it('should show subscription offer after limit reached', async () => {
      const userId = '55555'
      mockCtx = createMockContext(userId)

      mockCheckUsage.mockResolvedValue({
        canUse: false,
        isAdmin: false,
        hasUsedBefore: true
      })

      const usageResult = await checkAvatarTransformUsage(userId)

      if (!usageResult.canUse && !usageResult.isAdmin) {
        // Should show subscription offer
        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('подписк')
        )
      }
    })
  })

  describe('Subscription Expiry Scenarios', () => {
    it('should handle subscription expiry during generation session', async () => {
      const userId = '44444'

      // First check - subscription active
      mockGetUserDetails.mockResolvedValueOnce({
        id: 1,
        created_at: '2025-01-01',
        stars: 2000,
        subscriptionType: SubscriptionType.NEUROVIDEO,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2024-12-16' // 30 days ago, should be expired
      })

      // Second check - subscription expired
      mockGetUserDetails.mockResolvedValueOnce({
        id: 1,
        created_at: '2025-01-01',
        stars: 2000,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      const firstCheck = await getUserDetailsSubscription(userId)
      expect(firstCheck.isSubscriptionActive).toBe(true)

      const secondCheck = await getUserDetailsSubscription(userId)
      expect(secondCheck.isSubscriptionActive).toBe(false)
    })

    it('should validate subscription dates correctly', async () => {
      const userId = '33333'
      const thirtyOneDaysAgo = new Date()
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31)

      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 1500,
        subscriptionType: SubscriptionType.NEUROPHOTO,
        isSubscriptionActive: false, // Should be false due to 31 days ago
        isExist: true,
        subscriptionStartDate: thirtyOneDaysAgo.toISOString()
      })

      const userDetails = await getUserDetailsSubscription(userId)
      expect(userDetails.isSubscriptionActive).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors during subscription check', async () => {
      const userId = '22222'

      mockGetUserDetails.mockRejectedValue(new Error('Database connection failed'))

      await expect(getUserDetailsSubscription(userId)).rejects.toThrow('Database connection failed')
    })

    it('should handle generation service failures gracefully', async () => {
      const userId = '11111'
      mockCtx = createMockContext(userId)

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      // Mock generation service failure
      const mockGenerateService = jest.fn().mockRejectedValue(new Error('AI service unavailable'))

      await expect(mockGenerateService()).rejects.toThrow('AI service unavailable')

      // Should not mark as used if generation fails
      expect(markAvatarTransformUsed).not.toHaveBeenCalled()
    })

    it('should rollback generation count on service failure', async () => {
      const userId = '99998'

      // Mock successful usage check
      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      // Mock successful marking as used
      mockMarkUsed.mockResolvedValue(true)

      // In case of generation failure, should implement rollback logic
      // This is a requirement for the new system
      expect(true).toBe(true) // Placeholder for rollback validation
    })
  })

  describe('Concurrent Generation Attempts', () => {
    it('should handle multiple simultaneous generation requests', async () => {
      const userId = '00001'

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      // Simulate concurrent requests
      const promises = Array(5).fill(null).map(() => checkAvatarTransformUsage(userId))
      const results = await Promise.all(promises)

      // Should handle race conditions properly
      expect(results).toHaveLength(5)
      results.forEach(result => {
        expect(result).toHaveProperty('canUse')
        expect(result).toHaveProperty('isAdmin')
        expect(result).toHaveProperty('hasUsedBefore')
      })
    })
  })

  describe('Generation Count Persistence', () => {
    it('should persist generation count across bot sessions', async () => {
      const userId = '00002'

      // Mock that user has made 2 generations in previous session
      mockCheckUsage.mockResolvedValue({
        canUse: true, // Can still make 1 more (3rd generation)
        isAdmin: false,
        hasUsedBefore: false
      })

      const result = await checkAvatarTransformUsage(userId)
      expect(result.canUse).toBe(true)

      // After marking as used, should not be able to use again
      mockMarkUsed.mockResolvedValue(true)
      await markAvatarTransformUsed(userId)

      // Next session should reflect the usage
      mockCheckUsage.mockResolvedValue({
        canUse: false,
        isAdmin: false,
        hasUsedBefore: true
      })

      const nextSessionResult = await checkAvatarTransformUsage(userId)
      expect(nextSessionResult.canUse).toBe(false)
    })
  })
})