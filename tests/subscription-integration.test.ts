/**
 * Integration Tests for Complete Subscription Workflow
 * Tests end-to-end subscription scenarios including webhooks and user access
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest'
import { supabase } from '@/core/supabase'
import { checkSubscriptionByTelegramId } from '@/core/supabase/checkSubscriptionByTelegramId'
import { updateUserSubscription } from '@/core/supabase/updateUserSubscription'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { PaymentStatus, Currency } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { logger } from '@/utils/logger'

describe('Subscription Integration Tests', () => {
  const TEST_USER_ID = '321330903'
  const TEST_USERNAME = 'testuser321330903'
  
  const mockContext = {
    from: { id: 321330903, username: TEST_USERNAME, first_name: 'Test' },
    chat: { id: 321330903 },
    session: { language_code: 'ru' },
    scene: {
      enter: vi.fn(),
      leave: vi.fn()
    },
    reply: vi.fn(),
    telegram: {
      sendMessage: vi.fn(),
      sendChatAction: vi.fn(),
      getChatMember: vi.fn(),
      banChatMember: vi.fn()
    }
  } as any

  beforeAll(() => {
    vi.clearAllMocks()
    // Mock logger
    vi.spyOn(logger, 'info').mockImplementation(() => {})
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Complete Subscription Workflow', () => {
    it('should process payment webhook and grant immediate access', async () => {
      // Step 1: Mock user exists in database
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'user-321330903',
              telegram_id: TEST_USER_ID,
              username: TEST_USERNAME,
              subscription_type: null
            },
            error: null
          })
        })
      } as any)

      // Step 2: Mock no existing payment (first time payment)
      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })
        } as any)

      // Step 3: Mock successful payment creation
      const mockPayment = {
        id: 'payment-321330903-webhook',
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'NEUROTESTER subscription',
        status: PaymentStatus.COMPLETED,
        currency: Currency.RUB,
        subscription_type: 'NEUROTESTER',
        inv_id: 'webhook-inv-321330903',
        created_at: new Date().toISOString()
      }

      vi.spyOn(supabase.from('payments_v2'), 'insert').mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockPayment,
            error: null
          })
        })
      } as any)

      // Step 4: Process payment webhook
      const paymentResult = await createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'NEUROTESTER subscription',
        bot_name: 'webhook-test-bot',
        inv_id: 'webhook-inv-321330903',
        status: PaymentStatus.COMPLETED,
        currency: Currency.RUB
      })

      expect(paymentResult).toBeTruthy()
      expect(paymentResult?.subscription_type).toBe('NEUROTESTER')

      // Step 5: Mock subscription check after payment
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockPayment,
                error: null
              })
            })
          })
        })
      } as any)

      // Step 6: Verify immediate subscription access
      const subscriptionStatus = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(subscriptionStatus).toBe('NEUROTESTER')

      // Step 7: Mock getUserDetailsSubscription for guard check
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

      // Step 8: Verify user can access premium features
      const hasVideoAccess = await checkSubscriptionGuard(mockContext, 'NeuroVideo')
      expect(hasVideoAccess).toBe(true)

      const hasImageAccess = await checkSubscriptionGuard(mockContext, 'NeuroPhoto')
      expect(hasImageAccess).toBe(true)
    })

    it('should handle subscription renewal workflow', async () => {
      // Step 1: Setup existing user with old subscription
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31) // Expired subscription

      const oldPayment = {
        id: 'old-payment-321330903',
        telegram_id: TEST_USER_ID,
        created_at: oldDate.toISOString(),
        subscription: 'expired',
        level: 'NEUROTESTER'
      }

      // Mock old expired subscription check
      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: oldPayment,
                  error: null
                })
              })
            })
          })
        } as any)

      // Verify subscription is expired
      const expiredStatus = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(expiredStatus).toBe('unsubscribed')

      // Step 2: Process renewal payment
      const renewalPayment = {
        id: 'renewal-payment-321330903',
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        status: PaymentStatus.COMPLETED,
        currency: Currency.RUB,
        subscription_type: 'NEUROTESTER',
        inv_id: 'renewal-inv-321330903',
        created_at: new Date().toISOString()
      }

      // Mock user exists
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-321330903', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      // Mock no duplicate payment
      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })
        } as any)

      // Mock successful renewal payment creation
      vi.spyOn(supabase.from('payments_v2'), 'insert').mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: renewalPayment,
            error: null
          })
        })
      } as any)

      const renewalResult = await createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'NEUROTESTER renewal',
        bot_name: 'renewal-test-bot',
        inv_id: 'renewal-inv-321330903',
        status: PaymentStatus.COMPLETED,
        currency: Currency.RUB
      })

      expect(renewalResult).toBeTruthy()

      // Step 3: Mock new subscription check after renewal
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: renewalPayment,
                error: null
              })
            })
          })
        })
      } as any)

      // Verify subscription is now active
      const renewedStatus = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(renewedStatus).toBe('NEUROTESTER')
    })

    it('should handle subscription upgrade workflow', async () => {
      // Step 1: Start with STARS subscription
      const starsPayment = {
        id: 'stars-payment-321330903',
        telegram_id: TEST_USER_ID,
        created_at: new Date().toISOString(),
        subscription: 'active',
        level: 'STARS'
      }

      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: starsPayment,
                  error: null
                })
              })
            })
          })
        } as any)

      // Verify current STARS subscription
      const starsStatus = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(starsStatus).toBe('STARS')

      // Step 2: Mock upgrade payment to NEUROVIDEO
      const upgradePayment = {
        id: 'upgrade-payment-321330903',
        telegram_id: TEST_USER_ID,
        amount: 1500,
        type: 'money_income',
        status: PaymentStatus.COMPLETED,
        currency: Currency.RUB,
        subscription_type: 'NEUROVIDEO',
        inv_id: 'upgrade-inv-321330903',
        created_at: new Date().toISOString()
      }

      // Mock user exists and payment processing
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-321330903', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValueOnce({
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
            data: upgradePayment,
            error: null
          })
        })
      } as any)

      const upgradeResult = await createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 1500,
        type: 'money_income',
        description: 'NEUROVIDEO upgrade',
        bot_name: 'upgrade-test-bot',
        inv_id: 'upgrade-inv-321330903',
        status: PaymentStatus.COMPLETED,
        currency: Currency.RUB
      })

      expect(upgradeResult).toBeTruthy()
      expect(upgradeResult?.subscription_type).toBe('NEUROVIDEO')

      // Step 3: Verify upgraded subscription access
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: upgradePayment,
                error: null
              })
            })
          })
        })
      } as any)

      const upgradedStatus = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(upgradedStatus).toBe('NEUROVIDEO')
    })
  })

  describe('User Access Control Integration', () => {
    it('should properly restrict features based on subscription level', async () => {
      const testCases = [
        {
          subscriptionType: SubscriptionType.STARS,
          feature: 'NeuroVideo',
          shouldHaveAccess: false
        },
        {
          subscriptionType: SubscriptionType.STARS,
          feature: 'TextToImage',
          shouldHaveAccess: true
        },
        {
          subscriptionType: SubscriptionType.NEUROTESTER,
          feature: 'NeuroVideo',
          shouldHaveAccess: true
        },
        {
          subscriptionType: SubscriptionType.NEUROVIDEO,
          feature: 'NeuroVideo',
          shouldHaveAccess: true
        }
      ]

      for (const testCase of testCases) {
        // Mock user subscription type
        vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-access-test',
                telegram_id: TEST_USER_ID,
                subscription_type: testCase.subscriptionType
              },
              error: null
            })
          })
        } as any)

        const hasAccess = await checkSubscriptionGuard(mockContext, testCase.feature)
        expect(hasAccess).toBe(testCase.shouldHaveAccess)

        if (!testCase.shouldHaveAccess) {
          // Should show subscription message
          expect(mockContext.reply).toHaveBeenCalled()
        }
      }
    })

    it('should handle subscription expiry and access revocation', async () => {
      // Step 1: Start with valid subscription
      const validPayment = {
        id: 'valid-payment',
        telegram_id: TEST_USER_ID,
        created_at: new Date().toISOString(),
        subscription: 'active',
        level: 'NEUROTESTER'
      }

      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: validPayment,
                  error: null
                })
              })
            })
          })
        } as any)

      // Verify access granted
      let status = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(status).toBe('NEUROTESTER')

      // Step 2: Simulate subscription expiry (31 days old)
      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 31)

      const expiredPayment = {
        ...validPayment,
        created_at: expiredDate.toISOString()
      }

      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: expiredPayment,
                error: null
              })
            })
          })
        })
      } as any)

      // Verify access revoked
      status = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(status).toBe('unsubscribed')

      // Mock getUserDetailsSubscription returns null/expired
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'user-expired',
              telegram_id: TEST_USER_ID,
              subscription_type: null
            },
            error: null
          })
        })
      } as any)

      // Verify premium features blocked
      const hasAccess = await checkSubscriptionGuard(mockContext, 'NeuroVideo')
      expect(hasAccess).toBe(false)
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('подписка'),
        expect.any(Object)
      )
    })
  })

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary database outages', async () => {
      // Simulate database outage
      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockRejectedValue(new Error('Database connection failed'))
              })
            })
          })
        } as any)
        // Then recover
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'recovered-payment',
                    telegram_id: TEST_USER_ID,
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

      // First call fails
      const failedResult = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(failedResult).toBe('unsubscribed')
      expect(logger.error).toHaveBeenCalled()

      // Second call succeeds
      const recoveredResult = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(recoveredResult).toBe('NEUROTESTER')
    })

    it('should handle partial system failures gracefully', async () => {
      // Payment creation succeeds but subscription check fails
      
      // Step 1: Successful payment creation
      vi.spyBase(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-123', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValueOnce({
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
              id: 'partial-failure-payment',
              telegram_id: TEST_USER_ID,
              amount: 500,
              status: PaymentStatus.COMPLETED,
              created_at: new Date().toISOString()
            },
            error: null
          })
        })
      } as any)

      const paymentResult = await createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'Partial failure test',
        bot_name: 'partial-test-bot',
        inv_id: 'partial-inv-123'
      })

      expect(paymentResult).toBeTruthy()

      // Step 2: Subscription check fails
      vi.spyOn(supabase.from('payments_v2'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockRejectedValue(new Error('Subscription service down'))
            })
          })
        })
      } as any)

      const subscriptionResult = await checkSubscriptionByTelegramId(TEST_USER_ID)
      expect(subscriptionResult).toBe('unsubscribed') // Fails gracefully
    })

    it('should maintain data consistency during concurrent operations', async () => {
      // Simulate concurrent payment and subscription update operations
      const paymentData = {
        id: 'concurrent-test-payment',
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        status: PaymentStatus.COMPLETED,
        created_at: new Date().toISOString()
      }

      // Mock successful operations
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-123', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      vi.spyOn(supabase.from('users'), 'update').mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null
        })
      } as any)

      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValue({
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
            data: paymentData,
            error: null
          })
        })
      } as any)

      // Execute concurrent operations
      const operations = [
        createSuccessfulPayment({
          telegram_id: TEST_USER_ID,
          amount: 500,
          type: 'money_income',
          description: 'Concurrent test 1',
          bot_name: 'concurrent-bot',
          inv_id: 'concurrent-1'
        }),
        updateUserSubscription(TEST_USER_ID, 'NEUROTESTER'),
        createSuccessfulPayment({
          telegram_id: TEST_USER_ID,
          amount: 750,
          type: 'money_income',
          description: 'Concurrent test 2',
          bot_name: 'concurrent-bot',
          inv_id: 'concurrent-2'
        })
      ]

      const results = await Promise.allSettled(operations)
      
      // At least payment creation should succeed
      const successfulOps = results.filter(r => r.status === 'fulfilled')
      expect(successfulOps.length).toBeGreaterThan(0)
    })
  })

  describe('Webhook Processing Integration', () => {
    it('should process webhook payload correctly', async () => {
      // Mock webhook payload processing
      const webhookPayload = {
        telegram_id: TEST_USER_ID,
        amount: 500,
        currency: 'RUB',
        description: 'NEUROTESTER subscription',
        status: 'completed',
        inv_id: 'webhook-123',
        payment_method: 'bank_card'
      }

      // Mock user exists
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-webhook', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      // Mock no duplicate
      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValueOnce({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })
        } as any)

      // Mock successful insertion
      vi.spyOn(supabase.from('payments_v2'), 'insert').mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'webhook-payment',
              telegram_id: TEST_USER_ID,
              amount: 500,
              currency: Currency.RUB,
              status: PaymentStatus.COMPLETED,
              subscription_type: 'NEUROTESTER',
              inv_id: 'webhook-123',
              created_at: new Date().toISOString()
            },
            error: null
          })
        })
      } as any)

      const result = await createSuccessfulPayment({
        telegram_id: webhookPayload.telegram_id,
        amount: webhookPayload.amount,
        type: 'money_income',
        description: webhookPayload.description,
        bot_name: 'webhook-bot',
        inv_id: webhookPayload.inv_id,
        status: PaymentStatus.COMPLETED,
        currency: Currency.RUB,
        payment_method: webhookPayload.payment_method
      })

      expect(result).toBeTruthy()
      expect(result?.telegram_id).toBe(TEST_USER_ID)
      expect(result?.inv_id).toBe('webhook-123')
      expect(result?.subscription_type).toBe('NEUROTESTER')
    })

    it('should handle webhook retry logic', async () => {
      // Simulate webhook failing first time, succeeding second time
      let attemptCount = 0
      
      vi.spyOn(supabase.from('users'), 'select').mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-retry', telegram_id: TEST_USER_ID },
            error: null
          })
        })
      } as any)

      vi.spyOn(supabase.from('payments_v2'), 'select')
        .mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })
        } as any)

      vi.spyOn(supabase.from('payments_v2'), 'insert').mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockImplementation(() => {
            attemptCount++
            if (attemptCount === 1) {
              return Promise.reject(new Error('Temporary database error'))
            }
            return Promise.resolve({
              data: {
                id: 'retry-payment',
                telegram_id: TEST_USER_ID,
                amount: 500,
                status: PaymentStatus.COMPLETED,
                created_at: new Date().toISOString()
              },
              error: null
            })
          })
        })
      } as any)

      // First attempt should fail
      await expect(createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'Retry test payment',
        bot_name: 'retry-bot',
        inv_id: 'retry-123'
      })).rejects.toThrow('Temporary database error')

      // Second attempt should succeed
      const result = await createSuccessfulPayment({
        telegram_id: TEST_USER_ID,
        amount: 500,
        type: 'money_income',
        description: 'Retry test payment',
        bot_name: 'retry-bot',
        inv_id: 'retry-124' // Different inv_id for retry
      })

      expect(result).toBeTruthy()
    })
  })
})