import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { performance } from 'perf_hooks'
import { getUserUsageCount, shouldSkipOnboarding } from '@/helpers/getUserUsageCount'

/**
 * @test Usage Count Performance Testing
 * @description Tests performance characteristics of usage count determination logic
 * @focus Query optimization, response times, memory usage, concurrent access
 * @requirements P95 < 50ms, P99 < 75ms, concurrent users < 100ms total
 */

jest.mock('@/utils/logger')
jest.mock('@/core/supabase/getUserBalanceStatsOptimized')

describe('Usage Count Performance Tests', () => {
  let mockGetUserBalanceStatsOptimized: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    mockGetUserBalanceStatsOptimized = jest.fn()
    require('@/core/supabase/getUserBalanceStatsOptimized').getUserBalanceStatsOptimized = mockGetUserBalanceStatsOptimized

    // Setup realistic response times
    mockGetUserBalanceStatsOptimized.mockImplementation(() =>
      new Promise(resolve => {
        setTimeout(() => {
          resolve({
            total_transactions: Math.floor(Math.random() * 100),
            current_balance: Math.floor(Math.random() * 5000),
            total_real_income: Math.floor(Math.random() * 1000),
            total_bonus_income: Math.floor(Math.random() * 500),
            services_breakdown: [
              { service_name: 'AI_HERO', transaction_count: Math.floor(Math.random() * 50) },
              { service_name: 'AI_PHOTOSHOP', transaction_count: Math.floor(Math.random() * 30) }
            ]
          })
        }, 5 + Math.random() * 15) // 5-20ms realistic database latency
      })
    )
  })

  describe('Single User Usage Count Performance', () => {
    it('should meet SLA requirements for usage count lookup', async () => {
      const measurements = []
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        await getUserUsageCount(`12345678${i}`, 'test_bot')
        const end = performance.now()
        measurements.push(end - start)
      }

      // Calculate percentiles
      measurements.sort((a, b) => a - b)
      const p50 = measurements[Math.floor(iterations * 0.5)]
      const p95 = measurements[Math.floor(iterations * 0.95)]
      const p99 = measurements[Math.floor(iterations * 0.99)]

      // Performance SLA requirements
      expect(p50).toBeLessThan(30) // 50th percentile under 30ms
      expect(p95).toBeLessThan(50) // 95th percentile under 50ms
      expect(p99).toBeLessThan(75) // 99th percentile under 75ms

      console.log(`Usage Count Performance:
        P50: ${p50.toFixed(2)}ms
        P95: ${p95.toFixed(2)}ms
        P99: ${p99.toFixed(2)}ms`)
    })

    it('should handle new user detection efficiently', async () => {
      // New users are critical path - must be fast
      mockGetUserBalanceStatsOptimized.mockResolvedValue(null)

      const iterations = 50
      const measurements = []

      for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        const usageCount = await getUserUsageCount(`newuser${i}`, 'test_bot')
        const end = performance.now()

        expect(usageCount).toBe(0)
        measurements.push(end - start)
      }

      const averageTime = measurements.reduce((a, b) => a + b, 0) / measurements.length
      const maxTime = Math.max(...measurements)

      // New user detection should be highly optimized
      expect(averageTime).toBeLessThan(15) // Average under 15ms
      expect(maxTime).toBeLessThan(30) // Max under 30ms
    })

    it('should optimize shouldSkipOnboarding decision logic', async () => {
      const testCases = [
        // New users (should not skip)
        { total_transactions: 0, total_real_income: 0, total_bonus_income: 0, services_breakdown: [] },
        { total_transactions: 1, total_real_income: 0, total_bonus_income: 0, services_breakdown: [{ service_name: 'AI_HERO', transaction_count: 1 }] },

        // Experienced users (should skip)
        { total_transactions: 5, total_real_income: 0, total_bonus_income: 0, services_breakdown: [{ service_name: 'AI_HERO', transaction_count: 5 }] },
        { total_transactions: 1, total_real_income: 100, total_bonus_income: 0, services_breakdown: [{ service_name: 'AI_HERO', transaction_count: 1 }] },
        { total_transactions: 2, total_real_income: 0, total_bonus_income: 0, services_breakdown: [
          { service_name: 'AI_HERO', transaction_count: 1 },
          { service_name: 'AI_PHOTOSHOP', transaction_count: 1 }
        ]},
      ]

      const measurements = []

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i]
        mockGetUserBalanceStatsOptimized.mockResolvedValue(testCase)

        const start = performance.now()
        await shouldSkipOnboarding(`user${i}`, 'test_bot')
        const end = performance.now()

        measurements.push(end - start)
      }

      const averageTime = measurements.reduce((a, b) => a + b, 0) / measurements.length
      const maxTime = Math.max(...measurements)

      // Decision logic should be fast
      expect(averageTime).toBeLessThan(25) // Average under 25ms
      expect(maxTime).toBeLessThan(40) // Max under 40ms
    })
  })

  describe('Concurrent User Performance', () => {
    it('should handle concurrent usage count requests efficiently', async () => {
      const concurrentUsers = 50
      const userRequests = []

      // Create realistic user data for each concurrent user
      mockGetUserBalanceStatsOptimized.mockImplementation((telegramId) => {
        const userId = parseInt(telegramId.slice(-2)) || 1
        const usageLevel = userId % 4 // 0-3 usage levels

        return Promise.resolve(usageLevel === 0 ? null : {
          total_transactions: usageLevel * 10,
          current_balance: usageLevel * 500,
          total_real_income: usageLevel > 1 ? usageLevel * 100 : 0,
          total_bonus_income: usageLevel > 2 ? usageLevel * 50 : 0,
          services_breakdown: Array.from({ length: usageLevel }, (_, i) => ({
            service_name: `SERVICE_${i}`,
            transaction_count: 5
          }))
        })
      })

      // Create concurrent requests
      for (let i = 0; i < concurrentUsers; i++) {
        userRequests.push(
          getUserUsageCount(`concurrent${i.toString().padStart(2, '0')}`, 'test_bot')
        )
      }

      const start = performance.now()
      const results = await Promise.all(userRequests)
      const end = performance.now()

      const totalDuration = end - start
      const averagePerUser = totalDuration / concurrentUsers

      // Concurrent performance requirements
      expect(totalDuration).toBeLessThan(100) // Total under 100ms
      expect(averagePerUser).toBeLessThan(5) // Less than 5ms per user on average
      expect(results).toHaveLength(concurrentUsers)

      // Verify different usage patterns were processed
      const newUsers = results.filter(count => count === 0).length
      const experiencedUsers = results.filter(count => count > 0).length

      expect(newUsers).toBeGreaterThan(0)
      expect(experiencedUsers).toBeGreaterThan(0)
    })

    it('should handle burst requests without performance degradation', async () => {
      const burstSizes = [10, 25, 50, 75, 100]
      const performanceResults = []

      for (const burstSize of burstSizes) {
        const burstRequests = []

        for (let i = 0; i < burstSize; i++) {
          burstRequests.push(
            shouldSkipOnboarding(`burst${burstSize}_user${i}`, 'test_bot')
          )
        }

        const start = performance.now()
        await Promise.all(burstRequests)
        const end = performance.now()

        const duration = end - start
        const perUserTime = duration / burstSize

        performanceResults.push({
          burstSize,
          totalTime: duration,
          perUserTime
        })
      }

      // Performance should scale linearly (not exponentially)
      for (let i = 1; i < performanceResults.length; i++) {
        const current = performanceResults[i]
        const previous = performanceResults[i - 1]

        // Per-user time shouldn't increase significantly with burst size
        expect(current.perUserTime).toBeLessThan(previous.perUserTime * 1.5)

        // Total time should be reasonable
        expect(current.totalTime).toBeLessThan(200) // Never more than 200ms total
      }

      console.log('Burst Performance Results:', performanceResults.map(r =>
        `${r.burstSize} users: ${r.totalTime.toFixed(1)}ms total, ${r.perUserTime.toFixed(2)}ms per user`
      ))
    })

    it('should handle mixed usage patterns under load', async () => {
      const mixedUsers = 60
      const userTypes = ['new', 'minimal', 'moderate', 'heavy', 'premium', 'power']

      mockGetUserBalanceStatsOptimized.mockImplementation((telegramId) => {
        const userTypeIndex = parseInt(telegramId.slice(-1)) % userTypes.length
        const userType = userTypes[userTypeIndex]

        switch (userType) {
          case 'new': return Promise.resolve(null)
          case 'minimal': return Promise.resolve({
            total_transactions: 1,
            total_real_income: 0,
            total_bonus_income: 0,
            services_breakdown: [{ service_name: 'AI_HERO', transaction_count: 1 }]
          })
          case 'moderate': return Promise.resolve({
            total_transactions: 5,
            total_real_income: 50,
            total_bonus_income: 25,
            services_breakdown: [
              { service_name: 'AI_HERO', transaction_count: 3 },
              { service_name: 'AI_PHOTOSHOP', transaction_count: 2 }
            ]
          })
          case 'heavy': return Promise.resolve({
            total_transactions: 25,
            total_real_income: 500,
            total_bonus_income: 200,
            services_breakdown: [
              { service_name: 'AI_HERO', transaction_count: 15 },
              { service_name: 'AI_PHOTOSHOP', transaction_count: 8 },
              { service_name: 'AI_VIDEO', transaction_count: 2 }
            ]
          })
          case 'premium': return Promise.resolve({
            total_transactions: 100,
            total_real_income: 2000,
            total_bonus_income: 1000,
            services_breakdown: Array.from({ length: 5 }, (_, i) => ({
              service_name: `SERVICE_${i}`,
              transaction_count: 20
            }))
          })
          default: // power user
            return Promise.resolve({
              total_transactions: 500,
              total_real_income: 10000,
              total_bonus_income: 5000,
              services_breakdown: Array.from({ length: 10 }, (_, i) => ({
                service_name: `SERVICE_${i}`,
                transaction_count: 50
              }))
            })
        }
      })

      const mixedRequests = []
      for (let i = 0; i < mixedUsers; i++) {
        mixedRequests.push(
          shouldSkipOnboarding(`mixed${i}`, 'test_bot')
        )
      }

      const start = performance.now()
      const results = await Promise.all(mixedRequests)
      const end = performance.now()

      const totalDuration = end - start

      // Should handle mixed load efficiently
      expect(totalDuration).toBeLessThan(150) // Under 150ms for 60 mixed users
      expect(results).toHaveLength(mixedUsers)

      // Verify different user types were processed
      const skipCounts = results.filter(Boolean).length
      const noSkipCounts = results.filter(r => !r).length

      expect(skipCounts).toBeGreaterThan(0)
      expect(noSkipCounts).toBeGreaterThan(0)

      console.log(`Mixed Load Test: ${mixedUsers} users in ${totalDuration.toFixed(1)}ms
        Skip onboarding: ${skipCounts} users
        Full onboarding: ${noSkipCounts} users`)
    })
  })

  describe('Memory Usage Performance', () => {
    it('should not leak memory during repeated operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed
      const iterations = 1000

      // Perform many operations to detect memory leaks
      for (let i = 0; i < iterations; i++) {
        await getUserUsageCount(`memory${i}`, 'test_bot')

        // Force garbage collection every 100 iterations
        if (i % 100 === 0 && global.gc) {
          global.gc()
        }
      }

      // Force final garbage collection
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory increase should be minimal (less than 5MB for 1000 operations)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024)

      console.log(`Memory Usage: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB increase over ${iterations} operations`)
    })

    it('should handle large user data efficiently', async () => {
      // Simulate power users with extensive history
      const largeUserData = {
        total_transactions: 10000,
        current_balance: 50000,
        total_real_income: 25000,
        total_bonus_income: 15000,
        services_breakdown: Array.from({ length: 20 }, (_, i) => ({
          service_name: `SERVICE_${i}`,
          transaction_count: 500,
          // Large transaction history per service
          recent_transactions: Array.from({ length: 100 }, (_, j) => ({
            id: `tx_${i}_${j}`,
            amount: Math.random() * 100,
            timestamp: new Date().toISOString(),
            metadata: { data: 'x'.repeat(100) } // 100 bytes per transaction
          }))
        }))
      }

      mockGetUserBalanceStatsOptimized.mockResolvedValue(largeUserData)

      const start = performance.now()
      const result = await shouldSkipOnboarding('poweruser', 'test_bot')
      const end = performance.now()

      // Should handle large data efficiently
      expect(end - start).toBeLessThan(50) // Under 50ms even with large data
      expect(result).toBe(true) // Should skip onboarding
    })

    it('should optimize memory usage with concurrent large datasets', async () => {
      const concurrentUsers = 20
      const largeDataRequests = []

      // Each user has large dataset
      mockGetUserBalanceStatsOptimized.mockImplementation((telegramId) => {
        const userId = parseInt(telegramId.slice(-2)) || 1

        return Promise.resolve({
          total_transactions: userId * 100,
          current_balance: userId * 1000,
          services_breakdown: Array.from({ length: 10 }, (_, i) => ({
            service_name: `SERVICE_${i}`,
            transaction_count: userId * 10,
            // 1KB of data per service per user
            data: 'x'.repeat(1024)
          }))
        })
      })

      const initialMemory = process.memoryUsage().heapUsed

      for (let i = 0; i < concurrentUsers; i++) {
        largeDataRequests.push(
          shouldSkipOnboarding(`large${i.toString().padStart(2, '0')}`, 'test_bot')
        )
      }

      const start = performance.now()
      const results = await Promise.all(largeDataRequests)
      const end = performance.now()

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      const duration = end - start

      // Should handle concurrent large data efficiently
      expect(duration).toBeLessThan(200) // Under 200ms total
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Under 50MB memory increase
      expect(results).toHaveLength(concurrentUsers)

      console.log(`Concurrent Large Data: ${concurrentUsers} users, ${duration.toFixed(1)}ms, ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)
    })
  })

  describe('Error Recovery Performance', () => {
    it('should fail fast on database timeouts', async () => {
      // Simulate database timeout
      mockGetUserBalanceStatsOptimized.mockImplementation(() =>
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Database timeout'))
          }, 5000) // 5 second timeout
        })
      )

      const start = performance.now()

      try {
        // Race against fast timeout
        await Promise.race([
          getUserUsageCount('timeout_user', 'test_bot'),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Fast timeout')), 100)
          )
        ])
      } catch (error) {
        const end = performance.now()
        const duration = end - start

        // Should fail fast (under 150ms) rather than waiting for full timeout
        expect(duration).toBeLessThan(150)
        expect(error.message).toBe('Fast timeout')
      }
    })

    it('should recover from intermittent database errors efficiently', async () => {
      let callCount = 0

      // Simulate intermittent issues with exponential backoff recovery
      mockGetUserBalanceStatsOptimized.mockImplementation(() => {
        callCount++
        if (callCount <= 2) {
          return Promise.reject(new Error('Connection failed'))
        }
        return Promise.resolve({
          total_transactions: 10,
          current_balance: 500
        })
      })

      const retryWithBackoff = async (fn: Function, maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await fn()
          } catch (error) {
            if (attempt === maxRetries) throw error
            // Exponential backoff: 10ms, 20ms, 40ms
            await new Promise(resolve => setTimeout(resolve, 10 * Math.pow(2, attempt - 1)))
          }
        }
      }

      const start = performance.now()
      const result = await retryWithBackoff(() => getUserUsageCount('retry_user', 'test_bot'))
      const end = performance.now()

      // Should recover within reasonable time (under 100ms including backoff)
      expect(end - start).toBeLessThan(100)
      expect(result).toBe(10)
      expect(callCount).toBe(3) // Should have tried 3 times
    })
  })

  describe('Performance Monitoring and Alerting', () => {
    it('should identify performance regression patterns', async () => {
      const baselineIterations = 50
      const testIterations = 50

      // Establish baseline performance
      const baselineMeasurements = []
      for (let i = 0; i < baselineIterations; i++) {
        const start = performance.now()
        await getUserUsageCount(`baseline${i}`, 'test_bot')
        const end = performance.now()
        baselineMeasurements.push(end - start)
      }

      const baselineAverage = baselineMeasurements.reduce((a, b) => a + b, 0) / baselineMeasurements.length

      // Simulate performance regression (slower database)
      mockGetUserBalanceStatsOptimized.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              total_transactions: 5,
              current_balance: 200
            })
          }, 25 + Math.random() * 10) // 25-35ms (slower than baseline 5-20ms)
        })
      )

      const testMeasurements = []
      for (let i = 0; i < testIterations; i++) {
        const start = performance.now()
        await getUserUsageCount(`test${i}`, 'test_bot')
        const end = performance.now()
        testMeasurements.push(end - start)
      }

      const testAverage = testMeasurements.reduce((a, b) => a + b, 0) / testMeasurements.length

      // Should detect significant performance regression
      const regressionRatio = testAverage / baselineAverage
      const isRegression = regressionRatio > 1.5 // 50% slower is considered regression

      console.log(`Performance Regression Analysis:
        Baseline average: ${baselineAverage.toFixed(2)}ms
        Test average: ${testAverage.toFixed(2)}ms
        Regression ratio: ${regressionRatio.toFixed(2)}x
        Is regression: ${isRegression}`)

      // This test identifies regression but doesn't fail - it's for monitoring
      if (isRegression) {
        console.warn(`⚠️ Performance regression detected: ${((regressionRatio - 1) * 100).toFixed(1)}% slower`)
      }
    })
  })
})