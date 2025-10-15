/**
 * Performance Tests for Subscription System
 * Tests system performance under various load conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest'
import { supabase } from '@/core/supabase'
import { checkSubscriptionByTelegramId } from '@/core/supabase/checkSubscriptionByTelegramId'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { PaymentStatus, Currency } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'

describe('Subscription System Performance Tests', () => {
  const TEST_USER_ID = '321330903'
  
  const mockContext = {
    from: { id: 321330903, username: 'testuser' },
    chat: { id: 321330903 },
    session: {},
    scene: {
      enter: vi.fn(),
      leave: vi.fn()
    },
    reply: vi.fn(),
    telegram: {
      sendMessage: vi.fn(),
      sendChatAction: vi.fn()
    }
  } as any

  beforeAll(() => {
    vi.clearAllMocks()
    // Mock logger to prevent console spam
    vi.spyOn(logger, 'info').mockImplementation(() => {})
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Single User Performance', () => {
    it('should check subscription status within 100ms', async () => {
      // Mock fast database response
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'perf-test-payment',
                  created_at: new Date().toISOString(),
                  subscription: 'active',
                  level: 'NEUROTESTER'
                },
                error: null
              })
            })
          })
        })
      } as any)

      const startTime = performance.now()
      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      const endTime = performance.now()

      expect(result).toBe('NEUROTESTER')
      expect(endTime - startTime).toBeLessThan(100)
    })

    it('should process payment creation within 200ms', async () => {
      // Mock user exists
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-123', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      // Mock no existing payment with same inv_id
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      } as any)

      // Mock successful payment insertion
      vi.spyOn(supabase.from('payments_v2'), 'insert').mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'perf-payment-123',
              telegram_id: TEST_USER_ID,
              amount: 500,
              type: 'money_income',
              status: PaymentStatus.COMPLETED,
              created_at: new Date().toISOString()
            },
            error: null
          })
        })
      } as any)

      const startTime = performance.now()
      const result = await createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'Performance test payment',
        bot_name: 'perf-test-bot',
        inv_id: 'perf-inv-123'
      })
      const endTime = performance.now()

      expect(result).toBeTruthy()
      expect(endTime - startTime).toBeLessThan(200)
    })

    it('should handle subscription guard check within 150ms', async () => {
      // Mock getUserDetailsSubscription
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'user-perf-test',
              telegram_id: TEST_USER_ID,
              subscription_type: 'NEUROTESTER'
            },
            error: null
          })
        })
      } as any)

      const startTime = performance.now()
      const result = await checkSubscriptionGuard(mockContext, 'NeuroVideo')
      const endTime = performance.now()

      expect(result).toBe(true)
      expect(endTime - startTime).toBeLessThan(150)
    })
  })

  describe('Concurrent User Load Testing', () => {
    it('should handle 50 concurrent subscription checks within 1 second', async () => {
      const userCount = 50
      const userIds = Array(userCount).fill(0).map((_, i) => `user${i}`)

      // Mock database responses for all users
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'concurrent-payment',
                  created_at: new Date().toISOString(),
                  subscription: 'active',
                  level: 'NEUROTESTER'
                },
                error: null
              })
            })
          })
        })
      } as any)

      const startTime = performance.now()
      const promises = userIds.map(id => checkSubscriptionByTelegramId(id))
      const results = await Promise.all(promises)
      const endTime = performance.now()

      expect(results).toHaveLength(userCount)
      expect(results.every(result => result === 'NEUROTESTER')).toBe(true)
      expect(endTime - startTime).toBeLessThan(1000)
    })

    it('should handle 20 concurrent payment creations within 2 seconds', async () => {
      const paymentCount = 20

      // Mock user exists for all payments
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-123', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      // Mock no existing payments
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      } as any)

      // Mock successful payment insertions
      vi.spyOn(supabase.from('payments_v2'), 'insert').mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'concurrent-payment',
              telegram_id: TEST_USER_ID,
              amount: 500,
              type: 'money_income',
              status: PaymentStatus.COMPLETED,
              created_at: new Date().toISOString()
            },
            error: null
          })
        })
      } as any)

      const startTime = performance.now()
      const promises = Array(paymentCount).fill(0).map((_, i) => 
        createSuccessfulPayment({
          telegram_id: TEST_USER_ID,
          amount: 500,
          type: 'money_income',
          description: `Concurrent payment ${i}`,
          bot_name: 'concurrent-test-bot',
          inv_id: `concurrent-inv-${i}`
        })
      )
      const results = await Promise.allSettled(promises)
      const endTime = performance.now()

      const successfulResults = results.filter(r => r.status === 'fulfilled')
      expect(successfulResults.length).toBeGreaterThan(0)
      expect(endTime - startTime).toBeLessThan(2000)
    })

    it('should maintain performance under mixed load (checks + payments)', async () => {
      const checkCount = 30
      const paymentCount = 10

      // Mock for subscription checks
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'mixed-load-payment',
                  created_at: new Date().toISOString(),
                  subscription: 'active',
                  level: 'NEUROTESTER'
                },
                error: null
              })
            })
          })
        })
      } as any)

      // Mock for payments
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-123', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      vi.spyOn(supabase.from('payments_v2'), 'insert').mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'mixed-load-payment-insert',
              telegram_id: TEST_USER_ID,
              amount: 500,
              status: PaymentStatus.COMPLETED,
              created_at: new Date().toISOString()
            },
            error: null
          })
        })
      } as any)

      const startTime = performance.now()

      // Create mixed load of checks and payments
      const checkPromises = Array(checkCount).fill(0).map((_, i) => 
        checkSubscriptionByTelegramId(`check-user-${i}`)
      )
      
      const paymentPromises = Array(paymentCount).fill(0).map((_, i) => 
        createSuccessfulPayment({
          telegram_id: `payment-user-${i}`,
          amount: 500,
          type: 'money_income',
          description: `Mixed load payment ${i}`,
          bot_name: 'mixed-load-bot',
          inv_id: `mixed-inv-${i}`
        })
      )

      const [checkResults, paymentResults] = await Promise.all([
        Promise.all(checkPromises),
        Promise.allSettled(paymentPromises)
      ])
      
      const endTime = performance.now()

      expect(checkResults).toHaveLength(checkCount)
      expect(paymentResults).toHaveLength(paymentCount)
      expect(endTime - startTime).toBeLessThan(3000)
    })
  })

  describe('High Load Stress Testing', () => {
    it('should survive 100 concurrent subscription checks', async () => {
      const userCount = 100
      const userIds = Array(userCount).fill(0).map((_, i) => `stress-user-${i}`)

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'stress-payment',
                  created_at: new Date().toISOString(),
                  subscription: 'active',
                  level: 'NEUROTESTER'
                },
                error: null
              })
            })
          })
        })
      } as any)

      const startTime = performance.now()
      const promises = userIds.map(id => checkSubscriptionByTelegramId(id))
      const results = await Promise.all(promises)
      const endTime = performance.now()

      expect(results).toHaveLength(userCount)
      expect(results.every(result => result === 'NEUROTESTER')).toBe(true)
      // Allow more time for high load (5 seconds)
      expect(endTime - startTime).toBeLessThan(5000)
    })

    it('should handle database errors gracefully under load', async () => {
      const userCount = 50
      const userIds = Array(userCount).fill(0).map((_, i) => `error-user-${i}`)

      // Mock database errors for some requests
      let callCount = 0
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(() => {
                callCount++
                if (callCount % 5 === 0) {
                  // Every 5th call fails
                  return Promise.resolve({
                    data: null,
                    error: { message: 'Database overloaded' }
                  })
                }
                return Promise.resolve({
                  data: {
                    id: 'error-test-payment',
                    created_at: new Date().toISOString(),
                    subscription: 'active',
                    level: 'NEUROTESTER'
                  },
                  error: null
                })
              })
            })
          })
        })
      } as any)

      const promises = userIds.map(id => checkSubscriptionByTelegramId(id))
      const results = await Promise.all(promises)

      // All should return some result (either valid subscription or 'unsubscribed')
      expect(results).toHaveLength(userCount)
      expect(results.every(result => typeof result === 'string')).toBe(true)

      // Some should be successful, some should fallback to 'unsubscribed'
      const successCount = results.filter(r => r === 'NEUROTESTER').length
      const failureCount = results.filter(r => r === 'unsubscribed').length
      
      expect(successCount).toBeGreaterThan(0)
      expect(failureCount).toBeGreaterThan(0)
      expect(successCount + failureCount).toBe(userCount)
    })

    it('should maintain memory efficiency under sustained load', async () => {
      const iterations = 5
      const usersPerIteration = 20

      // Track memory usage
      const initialMemory = process.memoryUsage()

      for (let i = 0; i < iterations; i++) {
        const userIds = Array(usersPerIteration).fill(0).map((_, j) => 
          `memory-test-${i}-${j}`
        )

        vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: `memory-payment-${i}`,
                    created_at: new Date().toISOString(),
                    subscription: 'active',
                    level: 'NEUROTESTER'
                  },
                  error: null
                })
              })
            })
          })
        } as any)

        const promises = userIds.map(id => checkSubscriptionByTelegramId(id))
        await Promise.all(promises)

        // Force garbage collection if available
        if (global.gc) {
          global.gc()
        }
      }

      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
    })
  })

  describe('Performance Regression Detection', () => {
    it('should maintain consistent performance across multiple runs', async () => {
      const runCount = 5
      const usersPerRun = 20
      const times: number[] = []

      for (let run = 0; run < runCount; run++) {
        const userIds = Array(usersPerRun).fill(0).map((_, i) => 
          `regression-test-${run}-${i}`
        )

        vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'regression-payment',
                    created_at: new Date().toISOString(),
                    subscription: 'active',
                    level: 'NEUROTESTER'
                  },
                  error: null
                })
              })
            })
          })
        } as any)

        const startTime = performance.now()
        const promises = userIds.map(id => checkSubscriptionByTelegramId(id))
        await Promise.all(promises)
        const endTime = performance.now()

        times.push(endTime - startTime)
      }

      // Calculate statistics
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length
      const maxTime = Math.max(...times)
      const minTime = Math.min(...times)
      const variance = times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length

      // Performance should be consistent
      expect(avgTime).toBeLessThan(1000) // Average under 1 second
      expect(maxTime - minTime).toBeLessThan(500) // Variance under 500ms
      expect(Math.sqrt(variance)).toBeLessThan(200) // Standard deviation under 200ms
    })

    it('should scale linearly with user count', async () => {
      const testSizes = [10, 20, 30]
      const timings: Array<{ size: number; time: number }> = []

      for (const size of testSizes) {
        const userIds = Array(size).fill(0).map((_, i) => `scale-test-${size}-${i}`)

        vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'scale-payment',
                    created_at: new Date().toISOString(),
                    subscription: 'active',
                    level: 'NEUROTESTER'
                  },
                  error: null
                })
              })
            })
          })
        } as any)

        const startTime = performance.now()
        const promises = userIds.map(id => checkSubscriptionByTelegramId(id))
        await Promise.all(promises)
        const endTime = performance.now()

        timings.push({ size, time: endTime - startTime })
      }

      // Check that performance scales reasonably (not exponentially)
      const timePerUser = timings.map(t => t.time / t.size)
      const avgTimePerUser = timePerUser.reduce((sum, tpu) => sum + tpu, 0) / timePerUser.length
      
      // Time per user should be consistent and reasonable
      expect(avgTimePerUser).toBeLessThan(50) // Under 50ms per user
      
      // Variance in time per user should be low (linear scaling)
      const variance = timePerUser.reduce((sum, tpu) => sum + Math.pow(tpu - avgTimePerUser, 2), 0) / timePerUser.length
      expect(Math.sqrt(variance)).toBeLessThan(20) // Low variance indicates good scaling
    })
  })
})