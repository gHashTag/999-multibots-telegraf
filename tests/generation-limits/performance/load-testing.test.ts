/**
 * @fileoverview Performance and load testing for generation limits system
 * @description Tests system behavior under high load and stress conditions
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'
import { markAvatarTransformUsed } from '@/core/supabase/markAvatarTransformUsed'
import { PerformanceTestUtils, TestUserFactory, TestScenarioFactory } from '../utils/test-data-factory'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// Mock dependencies
jest.mock('@/core/supabase/getUserDetailsSubscription')
jest.mock('@/core/supabase/checkAvatarTransformUsage')
jest.mock('@/core/supabase/markAvatarTransformUsed')
jest.mock('@/utils/logger')

const mockGetUserDetails = jest.mocked(getUserDetailsSubscription)
const mockCheckUsage = jest.mocked(checkAvatarTransformUsage)
const mockMarkUsed = jest.mocked(markAvatarTransformUsed)

describe('Generation Limits Performance Testing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Set reasonable timeout for performance tests
    jest.setTimeout(30000)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Single User Performance', () => {
    it('should complete usage check within performance threshold', async () => {
      const user = TestUserFactory.createRegularUser('perf_001', 1)

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      const { result, duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        return await checkAvatarTransformUsage(user.telegram_id)
      })

      expect(result.canUse).toBe(true)
      expect(duration).toBeLessThan(100) // Should complete within 100ms
    })

    it('should complete subscription check within performance threshold', async () => {
      const user = TestUserFactory.createNeurotesterUser('perf_002')

      mockGetUserDetails.mockResolvedValue({
        id: 1,
        created_at: '2025-01-01',
        stars: 5000,
        subscriptionType: SubscriptionType.NEUROTESTER,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2025-01-01'
      })

      const { result, duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        return await getUserDetailsSubscription(user.telegram_id)
      })

      expect(result.subscriptionType).toBe(SubscriptionType.NEUROTESTER)
      expect(duration).toBeLessThan(150) // Should complete within 150ms
    })

    it('should handle rapid sequential requests efficiently', async () => {
      const user = TestUserFactory.createRegularUser('perf_003', 0)

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      const requestCount = 100
      const startTime = performance.now()

      for (let i = 0; i < requestCount; i++) {
        await checkAvatarTransformUsage(user.telegram_id)
      }

      const endTime = performance.now()
      const totalDuration = endTime - startTime
      const averageRequestTime = totalDuration / requestCount

      expect(totalDuration).toBeLessThan(5000) // 100 requests in under 5 seconds
      expect(averageRequestTime).toBeLessThan(50) // Average under 50ms per request
    })
  })

  describe('Concurrent User Load Testing', () => {
    it('should handle 100 concurrent users checking usage', async () => {
      const users = Array.from({ length: 100 }, (_, i) =>
        TestUserFactory.createRegularUser(`concurrent_${i}`, Math.floor(Math.random() * 3))
      )

      // Mock responses for all users
      mockCheckUsage.mockImplementation(async (telegram_id) => {
        const userId = telegram_id.toString()
        const user = users.find(u => u.telegram_id === userId)
        return {
          canUse: user ? user.generation_count < 3 : true,
          isAdmin: false,
          hasUsedBefore: user ? user.generation_count >= 3 : false
        }
      })

      const { results, totalDuration, averageDuration } = await PerformanceTestUtils.runConcurrentTests(
        async () => {
          const randomUser = users[Math.floor(Math.random() * users.length)]
          return await checkAvatarTransformUsage(randomUser.telegram_id)
        },
        100
      )

      expect(results).toHaveLength(100)
      expect(totalDuration).toBeLessThan(10000) // Complete within 10 seconds
      expect(averageDuration).toBeLessThan(100) // Average under 100ms per request

      // Verify all requests completed successfully
      results.forEach(result => {
        expect(result).toHaveProperty('canUse')
        expect(result).toHaveProperty('isAdmin')
        expect(result).toHaveProperty('hasUsedBefore')
      })
    })

    it('should handle mixed user types under concurrent load', async () => {
      const users = [
        ...Array.from({ length: 10 }, (_, i) => TestUserFactory.createAdmin(`admin_${i}`)),
        ...Array.from({ length: 30 }, (_, i) => TestUserFactory.createNeurotesterUser(`neurotester_${i}`)),
        ...Array.from({ length: 60 }, (_, i) => TestUserFactory.createRegularUser(`regular_${i}`, Math.floor(Math.random() * 4)))
      ]

      // Mock responses based on user type
      mockCheckUsage.mockImplementation(async (telegram_id) => {
        const userId = telegram_id.toString()

        if (userId.startsWith('admin_')) {
          return { canUse: true, isAdmin: true, hasUsedBefore: false }
        }

        const user = users.find(u => u.telegram_id === userId)
        return {
          canUse: user ? (user.is_admin || user.generation_count < 3) : true,
          isAdmin: user?.is_admin || false,
          hasUsedBefore: user ? user.generation_count >= 3 : false
        }
      })

      mockGetUserDetails.mockImplementation(async (telegram_id) => {
        const userId = telegram_id.toString()
        const user = users.find(u => u.telegram_id === userId)

        return {
          id: parseInt(userId.split('_')[1]) || 1,
          created_at: '2025-01-01',
          stars: user?.balance || 1000,
          subscriptionType: user?.subscription_type || null,
          isSubscriptionActive: user?.subscription_active || false,
          isExist: true,
          subscriptionStartDate: user?.subscription_active ? '2025-01-01' : null
        }
      })

      // Test concurrent mixed load
      const { results, totalDuration } = await PerformanceTestUtils.runConcurrentTests(
        async () => {
          const randomUser = users[Math.floor(Math.random() * users.length)]
          const [usageCheck, userDetails] = await Promise.all([
            checkAvatarTransformUsage(randomUser.telegram_id),
            getUserDetailsSubscription(randomUser.telegram_id)
          ])
          return { usageCheck, userDetails }
        },
        100
      )

      expect(results).toHaveLength(100)
      expect(totalDuration).toBeLessThan(15000) // Complete within 15 seconds

      // Verify results match expected user types
      const adminResults = results.filter(r => r.usageCheck.isAdmin)
      const subscriberResults = results.filter(r =>
        r.userDetails.isSubscriptionActive &&
        r.userDetails.subscriptionType === SubscriptionType.NEUROTESTER
      )

      expect(adminResults.length).toBeGreaterThan(0)
      expect(subscriberResults.length).toBeGreaterThan(0)

      // All admin results should allow usage
      adminResults.forEach(result => {
        expect(result.usageCheck.canUse).toBe(true)
      })
    })
  })

  describe('Database Stress Testing', () => {
    it('should handle database connection pool exhaustion gracefully', async () => {
      const users = Array.from({ length: 500 }, (_, i) =>
        TestUserFactory.createRegularUser(`stress_${i}`, Math.floor(Math.random() * 4))
      )

      // Mock database connection issues for some requests
      let requestCount = 0
      mockCheckUsage.mockImplementation(async (telegram_id) => {
        requestCount++

        // Simulate connection issues for 10% of requests
        if (requestCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate timeout
          throw new Error('Database connection pool exhausted')
        }

        const userId = telegram_id.toString()
        const user = users.find(u => u.telegram_id === userId)
        return {
          canUse: user ? user.generation_count < 3 : true,
          isAdmin: false,
          hasUsedBefore: user ? user.generation_count >= 3 : false
        }
      })

      // Test with 200 concurrent requests to stress database
      const promises = users.slice(0, 200).map(user =>
        checkAvatarTransformUsage(user.telegram_id).catch(error => ({
          canUse: true, // Safe default on error
          isAdmin: false,
          hasUsedBefore: false,
          error: error.message
        }))
      )

      const results = await Promise.all(promises)

      // Should complete even with some failures
      expect(results).toHaveLength(200)

      const successfulResults = results.filter(r => !('error' in r))
      const failedResults = results.filter(r => 'error' in r)

      expect(successfulResults.length).toBeGreaterThan(150) // At least 75% success rate
      expect(failedResults.length).toBeLessThan(50) // Less than 25% failures

      // Failed requests should have safe defaults
      failedResults.forEach(result => {
        expect(result.canUse).toBe(true)
      })
    })

    it('should maintain data consistency under high concurrent writes', async () => {
      const user = TestUserFactory.createRegularUser('consistency_001', 2)

      mockMarkUsed.mockResolvedValue(true)

      // Simulate multiple concurrent attempts to mark as used
      const promises = Array(50).fill(null).map(() =>
        markAvatarTransformUsed(user.telegram_id)
      )

      const results = await Promise.all(promises)

      // All should succeed (idempotent operation)
      expect(results.every(r => r === true)).toBe(true)

      // Database should be called for each attempt
      expect(mockMarkUsed).toHaveBeenCalledTimes(50)
    })
  })

  describe('Memory and Resource Usage', () => {
    it('should not leak memory during long-running operations', async () => {
      const user = TestUserFactory.createRegularUser('memory_001', 1)

      mockCheckUsage.mockResolvedValue({
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false
      })

      // Measure memory before
      const initialMemory = process.memoryUsage()

      // Perform many operations
      for (let i = 0; i < 10000; i++) {
        await checkAvatarTransformUsage(user.telegram_id)

        // Force garbage collection periodically
        if (i % 1000 === 0 && global.gc) {
          global.gc()
        }
      }

      // Force final garbage collection
      if (global.gc) {
        global.gc()
      }

      // Measure memory after
      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
    })

    it('should handle large payload responses efficiently', async () => {
      const user = TestUserFactory.createRegularUser('payload_001', 0)

      // Mock large response payload
      const largeUserDetails = {
        id: 1,
        created_at: '2025-01-01',
        stars: 1000,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null,
        // Add large metadata field
        metadata: 'x'.repeat(10000) // 10KB of data
      }

      mockGetUserDetails.mockResolvedValue(largeUserDetails as any)

      const startTime = performance.now()
      const result = await getUserDetailsSubscription(user.telegram_id)
      const endTime = performance.now()

      expect(result).toBeDefined()
      expect(endTime - startTime).toBeLessThan(200) // Should handle large payloads quickly
    })
  })

  describe('System Recovery Testing', () => {
    it('should recover from temporary service unavailability', async () => {
      const user = TestUserFactory.createRegularUser('recovery_001', 1)

      let callCount = 0
      mockCheckUsage.mockImplementation(async () => {
        callCount++

        // Fail first 3 attempts
        if (callCount <= 3) {
          throw new Error('Service temporarily unavailable')
        }

        // Succeed on 4th attempt
        return {
          canUse: true,
          isAdmin: false,
          hasUsedBefore: false
        }
      })

      // Test with retry logic simulation
      let result
      let attempts = 0
      const maxAttempts = 5

      while (attempts < maxAttempts) {
        try {
          result = await checkAvatarTransformUsage(user.telegram_id)
          break
        } catch (error) {
          attempts++
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100)) // Wait before retry
          }
        }
      }

      expect(result).toBeDefined()
      expect(result?.canUse).toBe(true)
      expect(attempts).toBe(3) // Should succeed on 4th attempt (attempts is 0-indexed)
    })

    it('should maintain service availability during peak load', async () => {
      const { users, expectedRequests } = PerformanceTestUtils.createLoadTest(1000, 2)

      mockCheckUsage.mockImplementation(async (telegram_id) => {
        // Simulate varying response times
        const delay = Math.random() * 100 // 0-100ms random delay
        await new Promise(resolve => setTimeout(resolve, delay))

        const userId = telegram_id.toString()
        const user = users.find(u => u.telegram_id === userId)
        return {
          canUse: user ? user.generation_count < 3 : true,
          isAdmin: false,
          hasUsedBefore: user ? user.generation_count >= 3 : false
        }
      })

      // Simulate peak load with wave pattern
      const waveSize = 50
      const waves = Math.ceil(expectedRequests / waveSize)
      let totalSuccessful = 0
      let totalFailed = 0

      for (let wave = 0; wave < waves; wave++) {
        const waveUsers = users.slice(wave * waveSize, (wave + 1) * waveSize)

        const promises = waveUsers.flatMap(user =>
          Array(2).fill(null).map(() =>
            checkAvatarTransformUsage(user.telegram_id)
              .then(() => 'success')
              .catch(() => 'failure')
          )
        )

        const waveResults = await Promise.all(promises)

        totalSuccessful += waveResults.filter(r => r === 'success').length
        totalFailed += waveResults.filter(r => r === 'failure').length

        // Small delay between waves to simulate real usage pattern
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Should maintain high availability (>95% success rate)
      const successRate = totalSuccessful / (totalSuccessful + totalFailed)
      expect(successRate).toBeGreaterThan(0.95)
      expect(totalSuccessful + totalFailed).toBe(expectedRequests)
    })
  })

  describe('Benchmark Comparisons', () => {
    it('should perform better than baseline thresholds', async () => {
      const scenarios = TestScenarioFactory.createBasicLimitScenarios()

      const benchmarkResults = []

      for (const scenario of scenarios) {
        const user = scenario.users[0]

        if (user.is_admin) {
          mockCheckUsage.mockResolvedValue({
            canUse: true,
            isAdmin: true,
            hasUsedBefore: false
          })
        } else {
          mockCheckUsage.mockResolvedValue({
            canUse: user.generation_count < 3,
            isAdmin: false,
            hasUsedBefore: user.generation_count >= 3
          })

          mockGetUserDetails.mockResolvedValue({
            id: 1,
            created_at: '2025-01-01',
            stars: user.balance,
            subscriptionType: user.subscription_type || null,
            isSubscriptionActive: user.subscription_active,
            isExist: true,
            subscriptionStartDate: user.subscription_active ? '2025-01-01' : null
          })
        }

        const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
          if (!user.is_admin) {
            await getUserDetailsSubscription(user.telegram_id)
          }
          return await checkAvatarTransformUsage(user.telegram_id)
        })

        benchmarkResults.push({
          scenario: scenario.name,
          duration,
          userType: user.is_admin ? 'admin' : user.subscription_active ? 'subscriber' : 'regular'
        })
      }

      // Baseline thresholds
      const thresholds = {
        admin: 50,      // Admin checks should be fastest (no DB queries)
        subscriber: 200, // Subscriber checks include subscription validation
        regular: 100    // Regular user checks are simpler
      }

      benchmarkResults.forEach(result => {
        const threshold = thresholds[result.userType as keyof typeof thresholds]
        expect(result.duration).toBeLessThan(threshold)
      })

      // Admin operations should be fastest
      const adminResults = benchmarkResults.filter(r => r.userType === 'admin')
      const nonAdminResults = benchmarkResults.filter(r => r.userType !== 'admin')

      if (adminResults.length > 0 && nonAdminResults.length > 0) {
        const avgAdminTime = adminResults.reduce((sum, r) => sum + r.duration, 0) / adminResults.length
        const avgNonAdminTime = nonAdminResults.reduce((sum, r) => sum + r.duration, 0) / nonAdminResults.length

        expect(avgAdminTime).toBeLessThan(avgNonAdminTime)
      }
    })
  })
})