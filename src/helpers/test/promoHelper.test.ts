import { describe, it, expect } from 'vitest'
import { getPromoConfig, processPromoLink } from '../promoHelper'
import { SubscriptionType } from '../../interfaces/subscription.interface'

describe('PromoHelper Tests', () => {
  describe('getPromoConfig', () => {
    it('should return correct config for neurovideo', () => {
      const config = getPromoConfig('neurovideo')
      
      expect(config).not.toBeNull()
      expect(config?.subscriptionTier).toBe(SubscriptionType.NEUROVIDEO)
      expect(config?.promoType).toBe('neurovideo_promo')
    })

    it('should return correct config for neurophoto', () => {
      const config = getPromoConfig('neurophoto')
      
      expect(config).not.toBeNull()
      expect(config?.subscriptionTier).toBe(SubscriptionType.NEUROPHOTO)
      expect(config?.promoType).toBe('neurophoto_promo')
    })

    it('should return null for unknown promo type', () => {
      const config = getPromoConfig('unknown')
      
      expect(config).toBeNull()
    })

    it('should handle case sensitivity', () => {
      const config = getPromoConfig('NEUROVIDEO')
      
      expect(config).toBeNull() // Should be case sensitive
    })
  })

  describe('processPromoLink', () => {
    it('should handle unknown promo type gracefully', async () => {
      const result = await processPromoLink('123456789', 'unknown', 'test_bot')
      
      expect(result).toBe(false)
    })

    // Note: We can't easily test the full processPromoLink function 
    // because it depends on database operations and imports that
    // require full app context. This would need integration tests.
  })
})
