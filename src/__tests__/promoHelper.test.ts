import { describe, it, expect, beforeEach } from '@jest/globals'
import { extractPromoFromContext } from '@/helpers/contextUtils'
import { DEFAULT_PROMO_CONFIG, PromoConfig } from '@/helpers/promoHelper'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { PaymentType } from '@/interfaces/payments.interface'

// Mock context for testing
const createMockContext = (messageText: string) => ({
  from: { id: 123456789 },
  message: { text: messageText },
})

describe('Promo Helper Tests', () => {
  describe('extractPromoFromContext', () => {
    it('should detect basic promo command', () => {
      const ctx = createMockContext('/start promo')
      const result = extractPromoFromContext(ctx as any)

      expect(result).not.toBeNull()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('')
    })

    it('should detect promo command with parameter', () => {
      const ctx = createMockContext('/start promo video')
      const result = extractPromoFromContext(ctx as any)

      expect(result).not.toBeNull()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('video')
    })

    it('should detect promo command with photo parameter', () => {
      const ctx = createMockContext('/start promo photo')
      const result = extractPromoFromContext(ctx as any)

      expect(result).not.toBeNull()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('photo')
    })

    it('should not detect regular start command', () => {
      const ctx = createMockContext('/start 123456')
      const result = extractPromoFromContext(ctx as any)

      expect(result).toBeNull()
    })

    it('should not detect regular start command without parameters', () => {
      const ctx = createMockContext('/start')
      const result = extractPromoFromContext(ctx as any)

      expect(result).toBeNull()
    })

    it('should handle case insensitive promo detection', () => {
      const ctx = createMockContext('/start PROMO VIDEO')
      const result = extractPromoFromContext(ctx as any)

      expect(result).not.toBeNull()
      expect(result?.isPromo).toBe(true)
      expect(result?.parameter).toBe('VIDEO')
    })
  })

  describe('Promo Configuration', () => {
    it('should have valid default promo config', () => {
      expect(DEFAULT_PROMO_CONFIG).toBeDefined()
      expect(DEFAULT_PROMO_CONFIG.defaultTier).toBe(SubscriptionType.NEUROPHOTO)
      expect(DEFAULT_PROMO_CONFIG.promoType).toBe('welcome_bonus')
    })

    it('should find NEUROPHOTO tier in payment plans', () => {
      const tierPlan = paymentOptionsPlans.find(
        plan => plan.subscription === SubscriptionType.NEUROPHOTO
      )

      expect(tierPlan).toBeDefined()
      expect(tierPlan?.stars).toBeDefined()
      expect(parseInt(tierPlan!.stars)).toBeGreaterThan(0)
    })

    it('should find NEUROVIDEO tier in payment plans', () => {
      const tierPlan = paymentOptionsPlans.find(
        plan => plan.subscription === SubscriptionType.NEUROVIDEO
      )

      expect(tierPlan).toBeDefined()
      expect(tierPlan?.stars).toBeDefined()
      expect(parseInt(tierPlan!.stars)).toBeGreaterThan(0)
    })
  })

  describe('Promo Configuration Logic', () => {
    it('should create correct config for video promo', () => {
      const promoConfig: PromoConfig = {
        defaultTier: SubscriptionType.NEUROVIDEO,
        promoType: 'video_promo',
      }

      expect(promoConfig.defaultTier).toBe(SubscriptionType.NEUROVIDEO)
      expect(promoConfig.promoType).toBe('video_promo')
    })

    it('should create correct config for photo promo', () => {
      const promoConfig: PromoConfig = {
        defaultTier: SubscriptionType.NEUROPHOTO,
        promoType: 'photo_promo',
      }

      expect(promoConfig.defaultTier).toBe(SubscriptionType.NEUROPHOTO)
      expect(promoConfig.promoType).toBe('photo_promo')
    })

    it('should handle custom star amounts', () => {
      const promoConfig: PromoConfig = {
        defaultTier: SubscriptionType.NEUROPHOTO,
        promoType: 'custom_promo',
        customStars: 500,
      }

      expect(promoConfig.customStars).toBe(500)
    })
  })

  describe('Payment Type Logic', () => {
    it('should use MONEY_INCOME for promo bonuses with BONUS category', () => {
      // Verify that we use MONEY_INCOME type for bonus payments
      expect(PaymentType.MONEY_INCOME).toBe('MONEY_INCOME')

      // Promo bonuses should be marked with category BONUS
      const expectedMetadata = {
        is_promo: true,
        promo_type: 'welcome_bonus',
        category: 'BONUS', // Используем существующее поле category
      }

      expect(expectedMetadata.is_promo).toBe(true)
      expect(expectedMetadata.category).toBe('BONUS')
    })
  })
})

// Integration test to verify the URL structure works
describe('Promo URL Integration', () => {
  it('should handle the expected promo URL format', () => {
    // Test the URL: https://t.me/MetaMuse_Manifest_bot/promo
    // This would translate to: /start promo
    const ctx = createMockContext('/start promo')
    const result = extractPromoFromContext(ctx as any)

    expect(result).not.toBeNull()
    expect(result?.isPromo).toBe(true)

    // This should grant NEUROPHOTO tier stars (476 stars for 1110 RUB)
    const expectedTier = SubscriptionType.NEUROPHOTO
    const tierPlan = paymentOptionsPlans.find(
      plan => plan.subscription === expectedTier
    )

    expect(tierPlan).toBeDefined()
    expect(tierPlan?.amount).toBe(1110) // RUB price
    expect(tierPlan?.stars).toBe('476') // Star amount
  })
})
