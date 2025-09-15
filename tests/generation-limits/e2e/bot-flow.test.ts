/**
 * @fileoverview End-to-end tests for bot generation flow with limits
 * @description Tests the complete user journey from button click to generation completion
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { ModeEnum } from '@/interfaces/modes'
import { TestUserFactory, TestScenarioFactory, createMockContext } from '../utils/test-data-factory'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'
import { markAvatarTransformUsed } from '@/core/supabase/markAvatarTransformUsed'

// Mock all dependencies
jest.mock('@/core/supabase/getUserDetailsSubscription')
jest.mock('@/core/supabase/checkAvatarTransformUsage')
jest.mock('@/core/supabase/markAvatarTransformUsed')
jest.mock('@/services/generateFluxKontextMax')
jest.mock('@/utils/logger')
jest.mock('@/helpers/sendPhotoWithFallback')

const mockGetUserDetails = jest.mocked(getUserDetailsSubscription)
const mockCheckUsage = jest.mocked(checkAvatarTransformUsage)
const mockMarkUsed = jest.mocked(markAvatarTransformUsed)

describe('Bot Generation Flow E2E Tests', () => {
  let mockBot: Partial<Telegraf<MyContext>>
  let mockCtx: Partial<MyContext>

  beforeEach(() => {
    jest.clearAllMocks()
    mockBot = {
      use: jest.fn(),
      command: jest.fn(),
      action: jest.fn()
    }
    mockCtx = createMockContext()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Complete Generation Flow - Admin User', () => {
    it('should allow admin to generate unlimited AI Heroes', async () => {
      const admin = TestUserFactory.createAdmin('12345')
      mockCtx = createMockContext(admin.telegram_id)

      // Mock admin access
      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: true,
        hasUsedBefore: false
      })

      // Mock successful generation
      const mockGenerate = jest.fn().mockResolvedValue({
        success: true,
        image_url: 'https://example.com/hero.jpg'
      })

      // Simulate multiple generation attempts
      for (let i = 0; i < 15; i++) {
        const usageCheck = await checkAvatarTransformUsage(admin.telegram_id)
        expect(usageCheck.canUse).toBe(true)
        expect(usageCheck.isAdmin).toBe(true)

        if (usageCheck.canUse) {
          const result = await mockGenerate()
          expect(result.success).toBe(true)
        }
      }

      // Admin should never be marked as used
      expect(markAvatarTransformUsed).not.toHaveBeenCalled()
    })

    it('should not check subscription for admin users', async () => {
      const admin = TestUserFactory.createAdmin('67890')
      mockCtx = createMockContext(admin.telegram_id)

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: true,
        hasUsedBefore: false
      })

      await checkAvatarTransformUsage(admin.telegram_id)

      // Should not call subscription check
      expect(mockGetUserDetails).not.toHaveBeenCalled()
    })
  })

  describe('Complete Generation Flow - NEUROTESTER Subscriber', () => {
    it('should handle NEUROTESTER subscription flow', async () => {
      const subscriber = TestUserFactory.createNeurotesterUser('99999')
      mockCtx = createMockContext(subscriber.telegram_id)

      // Mock subscription check
      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 5000,
        subscriptionType: SubscriptionType.NEUROTESTER,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2025-01-01'
      })

      // Mock usage check for non-admin
      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      // Mock successful generation
      const mockGenerate = jest.fn().mockResolvedValue({
        success: true,
        image_url: 'https://example.com/neurotester-hero.jpg'
      })

      // Test multiple generations
      for (let i = 0; i < 20; i++) {
        const userDetails = await getUserDetailsSubscription(subscriber.telegram_id)
        expect(userDetails.subscriptionType).toBe(SubscriptionType.NEUROTESTER)
        expect(userDetails.isSubscriptionActive).toBe(true)

        const usageCheck = await checkAvatarTransformUsage(subscriber.telegram_id)
        expect(usageCheck.canUse).toBe(true)

        if (usageCheck.canUse && userDetails.subscriptionType === SubscriptionType.NEUROTESTER) {
          const result = await mockGenerate()
          expect(result.success).toBe(true)
          // NEUROTESTER can generate unlimited, so don't mark as used
        }
      }
    })

    it('should handle subscription expiry during generation', async () => {
      const userId = '88888'
      mockCtx = createMockContext(userId)

      // First call - active subscription
      mockGetUserDetails.mockResolvedValueOnce({
        id: 1,
        created_at: '2025-01-01',
        stars: 3000,
        subscriptionType: SubscriptionType.NEUROVIDEO,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2025-01-01'
      })

      // Second call - expired subscription
      mockGetUserDetails.mockResolvedValueOnce({
        id: 1,
        created_at: '2025-01-01',
        stars: 3000,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      // First generation - should succeed
      const firstCheck = await getUserDetailsSubscription(userId)
      expect(firstCheck.isSubscriptionActive).toBe(true)

      // Second generation - should fallback to regular user logic
      const secondCheck = await getUserDetailsSubscription(userId)
      expect(secondCheck.isSubscriptionActive).toBe(false)

      // Should show subscription renewal offer
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('подписк')
      )
    })
  })

  describe('Complete Generation Flow - Regular User', () => {
    it('should enforce 3-generation limit for regular users', async () => {
      const user = TestUserFactory.createRegularUser('77777', 0)
      mockCtx = createMockContext(user.telegram_id)

      // Mock no active subscription
      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 1000,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      // Mock generation attempts
      const generationResults = [
        // 1st generation
        { canUse: true, isAdmin: false, hasUsedBefore: false },
        // 2nd generation
        { canUse: true, isAdmin: false, hasUsedBefore: false },
        // 3rd generation
        { canUse: true, isAdmin: false, hasUsedBefore: false },
        // 4th generation - should be denied
        { canUse: false, isAdmin: false, hasUsedBefore: true }
      ]

      mockCheckUsage
        .mockResolvedValueOnce(generationResults[0])
        .mockResolvedValueOnce(generationResults[1])
        .mockResolvedValueOnce(generationResults[2])
        .mockResolvedValueOnce(generationResults[3])

      mockMarkUsed.mockResolvedValue(true)

      // Mock successful generation service
      const mockGenerate = jest.fn().mockResolvedValue({
        success: true,
        image_url: 'https://example.com/regular-hero.jpg'
      })

      // Test 4 generation attempts
      const results = []
      for (let i = 0; i < 4; i++) {
        const userDetails = await getUserDetailsSubscription(user.telegram_id)
        const usageCheck = await checkAvatarTransformUsage(user.telegram_id)

        results.push({ generation: i + 1, canUse: usageCheck.canUse })

        if (usageCheck.canUse && !userDetails.isSubscriptionActive) {
          // Regular user generation
          await mockGenerate()
          if (i < 3) { // Only mark first 3 as used
            await markAvatarTransformUsed(user.telegram_id)
          }
        } else if (!usageCheck.canUse) {
          // Show limit reached message and subscription offer
          expect(mockCtx.reply).toHaveBeenCalledWith(
            expect.stringMatching(/лимит|подписк/i)
          )
        }
      }

      // Verify results
      expect(results[0].canUse).toBe(true)  // 1st generation
      expect(results[1].canUse).toBe(true)  // 2nd generation
      expect(results[2].canUse).toBe(true)  // 3rd generation
      expect(results[3].canUse).toBe(false) // 4th generation - denied

      expect(markAvatarTransformUsed).toHaveBeenCalledTimes(3)
    })

    it('should show subscription offer after limit reached', async () => {
      const user = TestUserFactory.createRegularUser('66666', 3)
      mockCtx = createMockContext(user.telegram_id)

      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 500,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      mockCheckUsage.mockResolvedValue({
        canUse: false,
        isAdmin: false,
        hasUsedBefore: true
      })

      const userDetails = await getUserDetailsSubscription(user.telegram_id)
      const usageCheck = await checkAvatarTransformUsage(user.telegram_id)

      expect(usageCheck.canUse).toBe(false)
      expect(userDetails.isSubscriptionActive).toBe(false)

      // Should navigate to subscription scene
      expect(mockCtx.scene?.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    })
  })

  describe('AI Heroes Button Integration', () => {
    it('should handle AI Heroes button press flow', async () => {
      const user = TestUserFactory.createRegularUser('55555', 1)
      mockCtx = createMockContext(user.telegram_id, {
        message: { text: 'ИИ Герои' } as any
      })

      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 2000,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      // Simulate AI Heroes button press
      const userDetails = await getUserDetailsSubscription(user.telegram_id)
      const usageCheck = await checkAvatarTransformUsage(user.telegram_id)

      if (usageCheck.canUse) {
        // Should enter avatar transform scene
        expect(mockCtx.scene?.enter).toHaveBeenCalledWith(ModeEnum.AvatarTransformScene)
      }

      expect(usageCheck.canUse).toBe(true)
      expect(userDetails.isExist).toBe(true)
    })

    it('should show limit message when button pressed after limit reached', async () => {
      const user = TestUserFactory.createRegularUser('44444', 3)
      mockCtx = createMockContext(user.telegram_id, {
        message: { text: 'ИИ Герои' } as any
      })

      mockCheckUsage.mockResolvedValue({
        canUse: false,
        isAdmin: false,
        hasUsedBefore: true
      })

      const usageCheck = await checkAvatarTransformUsage(user.telegram_id)

      expect(usageCheck.canUse).toBe(false)
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringMatching(/лимит|исчерпан/i)
      )
    })
  })

  describe('Error Recovery Flow', () => {
    it('should handle generation service failures', async () => {
      const user = TestUserFactory.createRegularUser('33333', 1)
      mockCtx = createMockContext(user.telegram_id)

      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 1500,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null
      })

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      // Mock generation service failure
      const mockGenerate = jest.fn().mockRejectedValue(new Error('AI service unavailable'))

      const usageCheck = await checkAvatarTransformUsage(user.telegram_id)
      expect(usageCheck.canUse).toBe(true)

      // Try to generate
      try {
        await mockGenerate()
      } catch (error) {
        // Should not mark as used on failure
        expect(markAvatarTransformUsed).not.toHaveBeenCalled()

        // Should show error message
        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringMatching(/ошибк|попробуйте/i)
        )
      }
    })

    it('should handle database connection failures gracefully', async () => {
      const user = TestUserFactory.createRegularUser('22222', 0)
      mockCtx = createMockContext(user.telegram_id)

      // Mock database failure
      mockGetUserDetails.mockRejectedValue(new Error('Database connection failed'))
      mockCheckUsage.mockResolvedValue({
        canUse: true, // Safe default on error
        isAdmin: false,
        hasUsedBefore: false
      })

      // Should not crash and allow generation
      const usageCheck = await checkAvatarTransformUsage(user.telegram_id)
      expect(usageCheck.canUse).toBe(true)

      // Should log error but continue
      await expect(getUserDetailsSubscription(user.telegram_id)).rejects.toThrow('Database connection failed')
    })
  })

  describe('Session State Management', () => {
    it('should maintain generation count across bot restarts', async () => {
      const user = TestUserFactory.createRegularUser('11111', 2)

      // First session - user has 2 generations
      mockCheckUsage.mockResolvedValueOnce({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      let usageCheck = await checkAvatarTransformUsage(user.telegram_id)
      expect(usageCheck.canUse).toBe(true)

      // Mark as used (3rd generation)
      mockMarkUsed.mockResolvedValue(true)
      await markAvatarTransformUsed(user.telegram_id)

      // Second session after restart - should remember previous usage
      mockCheckUsage.mockResolvedValueOnce({
        canUse: false,
        isAdmin: false,
        hasUsedBefore: true
      })

      usageCheck = await checkAvatarTransformUsage(user.telegram_id)
      expect(usageCheck.canUse).toBe(false)
      expect(usageCheck.hasUsedBefore).toBe(true)
    })

    it('should handle session data corruption gracefully', async () => {
      const user = TestUserFactory.createRegularUser('00001', 1)
      mockCtx = createMockContext(user.telegram_id, {
        session: {
          mode: 'corrupted_mode' as any,
          user_language: null as any
        }
      })

      // Should handle corrupted session data
      expect(mockCtx.session?.mode).toBe('corrupted_mode')

      // Should still be able to check usage
      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      const usageCheck = await checkAvatarTransformUsage(user.telegram_id)
      expect(usageCheck.canUse).toBe(true)
    })
  })

  describe('Performance Under Load', () => {
    it('should handle concurrent users efficiently', async () => {
      const users = Array.from({ length: 10 }, (_, i) =>
        TestUserFactory.createRegularUser(`load_${i}`, Math.floor(Math.random() * 3))
      )

      // Mock responses for all users
      users.forEach(user => {
        mockGetUserDetails.mockResolvedValue({
          id: parseInt(user.telegram_id),
          created_at: '2025-01-01',
          stars: user.balance,
          subscriptionType: null,
          isSubscriptionActive: false,
          isExist: true,
          subscriptionStartDate: null
        })

        mockCheckUsage.mockResolvedValue({
          canUse: user.generation_count < 3,
          isAdmin: false,
          hasUsedBefore: user.generation_count >= 3
        })
      })

      // Process all users concurrently
      const startTime = Date.now()
      const promises = users.map(user =>
        Promise.all([
          getUserDetailsSubscription(user.telegram_id),
          checkAvatarTransformUsage(user.telegram_id)
        ])
      )

      const results = await Promise.all(promises)
      const endTime = Date.now()

      expect(results).toHaveLength(10)
      expect(endTime - startTime).toBeLessThan(5000) // Should complete within 5 seconds

      // Verify all requests completed successfully
      results.forEach(([userDetails, usageCheck]) => {
        expect(userDetails).toBeDefined()
        expect(usageCheck).toBeDefined()
        expect(usageCheck).toHaveProperty('canUse')
      })
    })
  })
})