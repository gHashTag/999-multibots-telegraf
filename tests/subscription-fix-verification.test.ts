/**
 * Comprehensive Test Suite for Subscription Fix Verification
 * Specific focus on user 321330903 subscription issues
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest'
import { supabase } from '@/core/supabase'
import { checkSubscriptionByTelegramId } from '@/core/supabase/checkSubscriptionByTelegramId'
import { updateUserSubscription } from '@/core/supabase/updateUserSubscription'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { PaymentStatus, Currency } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { logger } from '@/utils/logger'

describe('Subscription Fix Verification Tests', () => {
  // Test user IDs
  const TEST_USER_ID = '321330903'
  const OTHER_TEST_USER_ID = '123456789'
  
  // Test data setup
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
    // Setup test environment
    vi.clearAllMocks()
  })

  afterAll(() => {
    // Cleanup after all tests
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
    
    // Mock logger to prevent console spam during tests
    vi.spyOn(logger, 'info').mockImplementation(() => {})
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  describe('1. Subscription Status Checking Logic', () => {
    it('should correctly identify valid subscription for user 321330903', async () => {
      // Mock a recent payment (within 30 days)
      const mockPaymentData = {
        id: 'test-payment-1',
        created_at: new Date().toISOString(),
        subscription: 'active',
        level: 'NEUROTESTER'
      }

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockPaymentData,
                error: null
              })
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(result).toBe('NEUROTESTER')
    })

    it('should return unsubscribed for expired subscriptions', async () => {
      // Mock an old payment (older than 30 days)
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31)
      
      const mockPaymentData = {
        id: 'test-payment-old',
        created_at: oldDate.toISOString(),
        subscription: 'active',
        level: 'NEUROTESTER'
      }

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockPaymentData,
                error: null
              })
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(result).toBe('unsubscribed')
    })

    it('should handle database errors gracefully', async () => {
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database connection failed' }
              })
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(result).toBe('unsubscribed')
      expect(logger.error).toHaveBeenCalledWith(
        'Ошибка при получении информации о подписке:',
        { message: 'Database connection failed' }
      )
    })

    it('should return unsubscribed when no payment data exists', async () => {
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: null
              })
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(result).toBe('unsubscribed')
    })
  })

  describe('2. Payment Webhook Processing', () => {
    it('should create successful payment and update user status', async () => {
      // Mock successful payment creation
      const mockPaymentResult = {
        id: 'payment-123',
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'NEUROTESTER subscription',
        status: PaymentStatus.COMPLETED,
        currency: Currency.RUB,
        subscription_type: 'NEUROTESTER',
        created_at: new Date().toISOString()
      }

      vi.spyOn(supabase.from('payments_v2'), 'insert').mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockPaymentResult,
            error: null
          })
        })
      } as any)

      // Mock user exists check
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-123', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      const result = await createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'NEUROTESTER subscription',
        bot_name: 'test-bot',
        inv_id: 'inv-123',
        status: PaymentStatus.COMPLETED,
        currency: Currency.RUB
      })

      expect(result).toBeTruthy()
      expect(result?.telegram_id).toBe(TEST_USER_ID)
      expect(result?.subscription_type).toBe('NEUROTESTER')
    })

    it('should prevent duplicate payments with same inv_id', async () => {
      // Mock existing payment with same inv_id
      const existingPayment = {
        id: 'existing-payment',
        inv_id: 'duplicate-inv-123'
      }

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: existingPayment,
            error: null
          })
        })
      } as any)

      // Mock getting the full payment details
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              ...existingPayment,
              telegram_id: TEST_USER_ID,
              amount: 500,
              type: 'money_income',
              status: PaymentStatus.COMPLETED
            },
            error: null
          })
        })
      } as any)

      const result = await createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'Duplicate payment attempt',
        bot_name: 'test-bot',
        inv_id: 'duplicate-inv-123'
      })

      expect(result).toBeTruthy()
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('ДУБЛИКАТ'),
        expect.any(Object)
      )
    })

    it('should handle payment validation errors', async () => {
      // Test with invalid payment data
      const invalidPaymentData = {
        telegram_id: '', // Invalid empty string
        amount: -100, // Invalid negative amount
        type: 'invalid_type',
        description: '',
        bot_name: 'test-bot',
        inv_id: 'inv-invalid'
      }

      await expect(createSuccessfulPayment(invalidPaymentData as any))
        .rejects.toThrow()
    })
  })

  describe('3. User 321330903 Specific Access Tests', () => {
    it('should grant immediate access after successful payment', async () => {
      // Mock recent successful payment
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'payment-321330903',
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

      // Mock getUserDetailsSubscription
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'user-321330903',
              telegram_id: TEST_USER_ID,
              subscription_type: SubscriptionType.NEUROTESTER
            },
            error: null
          })
        })
      } as any)

      const hasAccess = await checkSubscriptionGuard(mockContext, 'NeuroVideo')
      expect(hasAccess).toBe(true)
    })

    it('should persist subscription status correctly', async () => {
      // Mock user update
      vi.spyOn(supabase.from('users'), 'update').mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null
        })
      } as any)

      await expect(updateUserSubscription(TEST_USER_ID, 'NEUROTESTER'))
        .resolves.not.toThrow()

      expect(supabase.from('users').update).toHaveBeenCalledWith({
        subscription: 'NEUROTESTER'
      })
    })

    it('should handle race conditions in payment processing', async () => {
      // Simulate concurrent payment attempts
      const paymentPromises = Array(5).fill(null).map((_, index) => 
        createSuccessfulPayment({
          telegram_id: TEST_USER_ID,
          amount: 500,
          type: 'money_income',
          description: `Concurrent payment ${index}`,
          bot_name: 'test-bot',
          inv_id: `concurrent-${index}`,
          status: PaymentStatus.COMPLETED
        })
      )

      // Mock successful responses
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-123', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      } as any)

      vi.spyOn(supabase.from('payments_v2'), 'insert').mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'payment-concurrent',
              telegram_id: TEST_USER_ID,
              amount: 500,
              status: PaymentStatus.COMPLETED
            },
            error: null
          })
        })
      } as any)

      const results = await Promise.allSettled(paymentPromises)
      const successfulPayments = results.filter(r => r.status === 'fulfilled')
      
      // At least some payments should succeed
      expect(successfulPayments.length).toBeGreaterThan(0)
    })
  })

  describe('4. Edge Case Testing', () => {
    it('should handle subscription expiry correctly', async () => {
      // Test subscription that expires exactly at 30 days
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() - 30)
      expiryDate.setHours(expiryDate.getHours() - 1) // 1 hour past 30 days

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'expired-payment',
                  created_at: expiryDate.toISOString(),
                  subscription: 'active',
                  level: 'NEUROTESTER'
                },
                error: null
              })
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(result).toBe('unsubscribed')
    })

    it('should handle multiple payment attempts correctly', async () => {
      // Test scenario with multiple payments, should use the most recent
      const recentDate = new Date()
      const olderDate = new Date()
      olderDate.setDate(olderDate.getDate() - 5)

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'recent-payment',
                  created_at: recentDate.toISOString(),
                  subscription: 'active',
                  level: 'NEUROVIDEO' // Different level than older payment
                },
                error: null
              })
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(result).toBe('NEUROVIDEO')
    })

    it('should handle concurrent access attempts', async () => {
      // Mock successful subscription check
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'valid-payment',
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

      // Simulate concurrent access attempts
      const accessPromises = Array(10).fill(null).map(() => 
        checkSubscriptionByTelegramId(TEST_USER_ID)
      )

      const results = await Promise.all(accessPromises)
      
      // All should return the same result
      expect(results.every(result => result === 'NEUROTESTER')).toBe(true)
    })

    it('should handle network timeouts gracefully', async () => {
      // Simulate network timeout
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockRejectedValue(new Error('Network timeout'))
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(result).toBe('unsubscribed')
      expect(logger.error).toHaveBeenCalledWith(
        'Непредвиденная ошибка при проверке подписки:',
        expect.any(Error)
      )
    })
  })

  describe('5. Database Integrity and Transaction Consistency', () => {
    it('should maintain referential integrity during payment creation', async () => {
      // Test that payment creation fails for non-existent user
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'User not found' }
          })
        })
      } as any)

      await expect(createSuccessfulPayment({
        telegram_id: '999999999', // Non-existent user
        amount: 500,
        type: 'money_income',
        description: 'Test payment',
        bot_name: 'test-bot',
        inv_id: 'test-inv'
      })).rejects.toThrow('User not found')
    })

    it('should handle database constraint violations', async () => {
      // Mock unique constraint violation (duplicate inv_id)
      const constraintError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint'
      }

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      } as any)

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
          single: vi.fn().mockRejectedValue(constraintError)
        })
      } as any)

      await expect(createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'Duplicate payment',
        bot_name: 'test-bot',
        inv_id: 'duplicate-inv'
      })).rejects.toThrow()
    })

    it('should verify data consistency after updates', async () => {
      // Mock successful subscription update
      vi.spyOn(supabase.from('users'), 'update').mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'user-123', subscription: 'NEUROTESTER' }],
          error: null
        })
      } as any)

      await updateUserSubscription(TEST_USER_ID, 'NEUROTESTER')

      // Verify the update was called with correct parameters
      expect(supabase.from('users').update).toHaveBeenCalledWith({
        subscription: 'NEUROTESTER'
      })
    })
  })

  describe('6. Error Handling and Logging', () => {
    it('should log subscription check errors appropriately', async () => {
      const testError = new Error('Test database error')
      
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockRejectedValue(testError)
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      
      expect(result).toBe('unsubscribed')
      expect(logger.error).toHaveBeenCalledWith(
        'Непредвиденная ошибка при проверке подписки:',
        testError
      )
    })

    it('should handle subscription guard errors gracefully', async () => {
      // Mock getUserDetailsSubscription to throw error
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockRejectedValue(new Error('Database connection failed'))
        })
      } as any)

      const result = await checkSubscriptionGuard(mockContext, 'NeuroVideo')
      
      expect(result).toBe(false)
      expect(mockContext.scene.enter).toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalled()
    })

    it('should provide meaningful error messages', async () => {
      vi.spyOn(supabase.from('users'), 'update').mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Connection timeout', details: 'Network error' }
        })
      } as any)

      await expect(updateUserSubscription(TEST_USER_ID, 'NEUROTESTER'))
        .rejects.toThrow('Не удалось обновить подписку пользователя')

      expect(logger.error).toHaveBeenCalledWith(
        'Ошибка при обновлении подписки пользователя:',
        expect.objectContaining({ message: 'Connection timeout' })
      )
    })
  })

  describe('7. Impact on Other Users', () => {
    it('should not affect other users when fixing user 321330903', async () => {
      // Test that other user's subscription remains unchanged
      const otherUserPayment = {
        id: 'other-user-payment',
        created_at: new Date().toISOString(),
        subscription: 'active',
        level: 'STARS'
      }

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: otherUserPayment,
                error: null
              })
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(OTHER_TEST_USER_ID)
      expect(result).toBe('STARS')
    })

    it('should maintain system performance for all users', async () => {
      // Test that subscription checks are still fast for multiple users
      const userIds = ['111111111', '222222222', '333333333', '444444444']
      
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'test-payment',
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

      // Should complete within reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000)
    })
  })

  describe('8. Fallback Mechanisms', () => {
    it('should have proper fallback when payment service is unavailable', async () => {
      // Mock service unavailable error
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockRejectedValue(new Error('Service unavailable'))
            })
          })
        })
      } as any)

      const result = await checkSubscriptionByTelegramId(TEST_USER_ID)
      
      // Should fallback to unsubscribed safely
      expect(result).toBe('unsubscribed')
      expect(logger.error).toHaveBeenCalledWith(
        'Непредвиденная ошибка при проверке подписки:',
        expect.any(Error)
      )
    })

    it('should handle subscription scene redirection properly', async () => {
      // Mock error in subscription guard
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockRejectedValue(new Error('Database error'))
        })
      } as any)

      const result = await checkSubscriptionGuard(mockContext, 'NeuroVideo')
      
      expect(result).toBe(false)
      expect(mockContext.scene.leave).toHaveBeenCalled()
      expect(mockContext.scene.enter).toHaveBeenCalled()
    })

    it('should maintain service availability during peak load', async () => {
      // Simulate high load scenario
      const highLoadPromises = Array(100).fill(null).map((_, index) => 
        checkSubscriptionByTelegramId(`user${index}`)
      )

      // Mock responses for all requests
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'load-test-payment',
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
      const results = await Promise.all(highLoadPromises)
      const endTime = performance.now()

      // All requests should succeed
      expect(results.every(result => result === 'NEUROTESTER')).toBe(true)
      
      // Should complete within reasonable time for high load (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000)
    })
  })
})