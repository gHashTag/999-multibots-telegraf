/**
 * Tests for promoHelper.ts
 *
 * Promo link processing with bonus stars and subscription activation
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// Mock logger before imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock dynamic imports
const mockDirectPaymentProcessor = vi.fn()
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  })),
}

vi.mock('@/core/supabase/directPayment', () => ({
  directPaymentProcessor: mockDirectPaymentProcessor,
}))

vi.mock('@/core/supabase', () => ({
  supabase: mockSupabase,
}))

import {
  getPromoConfig,
  hasReceivedPromo,
  processPromoLink,
} from '@/helpers/promoHelper'
import { logger } from '@/utils/logger'

describe('promoHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getPromoConfig', () => {
    describe('known promo types', () => {
      it('should return config for neurovideo promo', () => {
        const config = getPromoConfig('neurovideo')

        expect(config).not.toBeNull()
        expect(config?.subscriptionTier).toBe(SubscriptionType.NEUROVIDEO)
        expect(config?.promoType).toBe('neurovideo_promo')
      })

      it('should return config for neurophoto promo', () => {
        const config = getPromoConfig('neurophoto')

        expect(config).not.toBeNull()
        expect(config?.subscriptionTier).toBe(SubscriptionType.NEUROPHOTO)
        expect(config?.promoType).toBe('neurophoto_promo')
      })
    })

    describe('unknown promo types', () => {
      it('should return null for unknown promo type', () => {
        const config = getPromoConfig('unknown')
        expect(config).toBeNull()
      })

      it('should return null for empty string', () => {
        const config = getPromoConfig('')
        expect(config).toBeNull()
      })

      it('should return null for case-sensitive mismatch', () => {
        const config = getPromoConfig('NEUROVIDEO')
        expect(config).toBeNull()
      })
    })
  })

  describe('hasReceivedPromo', () => {
    const telegramId = '123456789'
    const promoType = 'neurovideo_promo'

    beforeEach(() => {
      // Reset mock chain
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
      mockSupabase.from.mockReturnValue(mockChain)
    })

    it('should return false when user has not received promo', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
      mockSupabase.from.mockReturnValue(mockChain)

      const result = await hasReceivedPromo(telegramId, promoType)

      expect(result).toBe(false)
      expect(mockSupabase.from).toHaveBeenCalledWith('payments_v2')
    })

    it('should return true when user has received promo', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [{ id: 'payment-123' }],
          error: null,
        }),
      }
      mockSupabase.from.mockReturnValue(mockChain)

      const result = await hasReceivedPromo(telegramId, promoType)

      expect(result).toBe(true)
    })

    it('should return false on database error', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      }
      mockSupabase.from.mockReturnValue(mockChain)

      const result = await hasReceivedPromo(telegramId, promoType)

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error checking promo history'),
        expect.any(Object)
      )
    })

    it('should return false on exception', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Connection failed')
      })

      const result = await hasReceivedPromo(telegramId, promoType)

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Exception during promo check'),
        expect.any(Object)
      )
    })

    it('should query with correct filters', async () => {
      const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
      const mockNot = vi.fn().mockReturnValue({ limit: mockLimit })
      const mockContains = vi.fn().mockReturnValue({ not: mockNot })
      const mockEq = vi
        .fn()
        .mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ contains: mockContains }) }) })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      mockSupabase.from.mockReturnValue({ select: mockSelect })

      await hasReceivedPromo(telegramId, promoType)

      expect(mockSupabase.from).toHaveBeenCalledWith('payments_v2')
      expect(mockSelect).toHaveBeenCalledWith('id')
    })
  })

  describe('processPromoLink', () => {
    const telegramId = '123456789'
    const botName = 'TestBot'

    beforeEach(() => {
      // Default: user has not received promo
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
      mockSupabase.from.mockReturnValue(mockChain)

      // Default: payment success
      mockDirectPaymentProcessor.mockResolvedValue({
        success: true,
        payment_id: 'payment-123',
      })
    })

    describe('validation', () => {
      it('should return false for unknown promo type', async () => {
        const result = await processPromoLink(telegramId, 'unknown', botName)

        expect(result).toBe(false)
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Unknown promo type'),
          expect.any(Object)
        )
      })

      it('should return false if user already received promo', async () => {
        // User has already received promo
        const mockChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          contains: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'existing-payment' }],
            error: null,
          }),
        }
        mockSupabase.from.mockReturnValue(mockChain)

        const result = await processPromoLink(telegramId, 'neurovideo', botName)

        expect(result).toBe(false)
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('User already received this promo'),
          expect.any(Object)
        )
      })
    })

    describe('successful processing', () => {
      it('should process neurovideo promo successfully', async () => {
        const result = await processPromoLink(telegramId, 'neurovideo', botName)

        expect(result).toBe(true)
        expect(mockDirectPaymentProcessor).toHaveBeenCalledWith(
          expect.objectContaining({
            telegram_id: telegramId,
            amount: 1303, // NEUROVIDEO star amount
            subscription_type: SubscriptionType.NEUROVIDEO,
          })
        )
      })

      it('should process neurophoto promo successfully', async () => {
        const result = await processPromoLink(telegramId, 'neurophoto', botName)

        expect(result).toBe(true)
        expect(mockDirectPaymentProcessor).toHaveBeenCalledWith(
          expect.objectContaining({
            telegram_id: telegramId,
            amount: 476, // NEUROPHOTO star amount
            subscription_type: SubscriptionType.NEUROPHOTO,
          })
        )
      })

      it('should use default bot name if not provided', async () => {
        const result = await processPromoLink(telegramId, 'neurovideo')

        expect(result).toBe(true)
        expect(mockDirectPaymentProcessor).toHaveBeenCalledWith(
          expect.objectContaining({
            bot_name: 'MetaMuse_Manifest_bot',
          })
        )
      })

      it('should include promo metadata in payment', async () => {
        await processPromoLink(telegramId, 'neurovideo', botName)

        expect(mockDirectPaymentProcessor).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              is_promo: true,
              promo_type: 'neurovideo_promo',
              promo_bonus_and_subscription: true,
            }),
          })
        )
      })
    })

    describe('error handling', () => {
      it('should return false when payment fails', async () => {
        mockDirectPaymentProcessor.mockResolvedValue({
          success: false,
          error: 'Payment failed',
        })

        const result = await processPromoLink(telegramId, 'neurovideo', botName)

        expect(result).toBe(false)
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to give bonus stars'),
          expect.any(Object)
        )
      })

      it('should return false on exception', async () => {
        mockDirectPaymentProcessor.mockRejectedValue(
          new Error('Network error')
        )

        const result = await processPromoLink(telegramId, 'neurovideo', botName)

        expect(result).toBe(false)
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Exception in activatePromoSubscription'),
          expect.any(Object)
        )
      })
    })

    describe('logging', () => {
      it('should log promo processing start', async () => {
        await processPromoLink(telegramId, 'neurovideo', botName)

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Processing promo link'),
          expect.objectContaining({
            telegram_id: telegramId,
            promo_type: 'neurovideo',
          })
        )
      })

      it('should log success on completion', async () => {
        await processPromoLink(telegramId, 'neurovideo', botName)

        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Promo subscription activated successfully'),
          expect.any(Object)
        )
      })
    })
  })
})
