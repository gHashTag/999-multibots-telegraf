import { describe, it, expect } from 'vitest'
import { isFeatureAvailable, getSubscriptionMessage } from '../subscriptionInfo'
import { SubscriptionType } from '../../interfaces/subscription.interface'

describe('SubscriptionInfo Tests', () => {
  describe('Feature Availability for NEUROTESTER', () => {
    it('should allow NeuroVideo for NEUROTESTER subscription', () => {
      const result = isFeatureAvailable('NeuroVideo', SubscriptionType.NEUROTESTER)
      expect(result).toBe(true)
    })

    it('should allow TextToVideo for NEUROTESTER subscription', () => {
      const result = isFeatureAvailable('TextToVideo', SubscriptionType.NEUROTESTER)
      expect(result).toBe(true)
    })

    it('should allow ImageToVideo for NEUROTESTER subscription', () => {
      const result = isFeatureAvailable('ImageToVideo', SubscriptionType.NEUROTESTER)
      expect(result).toBe(true)
    })

    it('should allow all features for NEUROTESTER subscription', () => {
      const features = ['NeuroVideo', 'TextToVideo', 'NeuroPhoto', 'TextToImage']
      features.forEach(feature => {
        expect(isFeatureAvailable(feature, SubscriptionType.NEUROTESTER)).toBe(true)
      })
    })
  })

  describe('Feature Availability for STARS', () => {
    it('should block NeuroVideo for STARS subscription', () => {
      const result = isFeatureAvailable('NeuroVideo', SubscriptionType.STARS)
      expect(result).toBe(false)
    })

    it('should block all premium features for STARS subscription', () => {
      const premiumFeatures = ['NeuroVideo', 'TextToVideo', 'NeuroPhoto']
      premiumFeatures.forEach(feature => {
        expect(isFeatureAvailable(feature, SubscriptionType.STARS)).toBe(false)
      })
    })
  })

  describe('Feature Availability for NEUROVIDEO', () => {
    it('should allow all features for NEUROVIDEO subscription', () => {
      const features = ['NeuroVideo', 'TextToVideo', 'NeuroPhoto', 'TextToImage']
      features.forEach(feature => {
        expect(isFeatureAvailable(feature, SubscriptionType.NEUROVIDEO)).toBe(true)
      })
    })
  })

  describe('Subscription Messages', () => {
    it('should return appropriate message for NEUROTESTER', () => {
      const message = getSubscriptionMessage(SubscriptionType.NEUROTESTER, true, 'NeuroVideo')
      expect(message).toContain('полный доступ')
    })

    it('should return blocking message for STARS users', () => {
      const message = getSubscriptionMessage(SubscriptionType.STARS, true, 'NeuroVideo')
      expect(message).toContain('недоступна без подписки')
    })
  })
})
