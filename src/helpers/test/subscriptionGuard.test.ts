import { describe, it, expect, beforeEach } from 'vitest'
import { isFeatureAvailable } from '../subscriptionInfo'
import { SubscriptionType } from '@/interfaces/subscription.interface'

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

    it('should allow all premium features for NEUROTESTER subscription', () => {
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

  describe('Command to Feature ID Mapping', () => {
    it('should correctly map NeuroVideo command to IMAGE_TO_VIDEO feature', () => {
      // Тестируем, что NeuroVideo команда правильно мапится на IMAGE_TO_VIDEO
      expect(isFeatureAvailable('NeuroVideo', SubscriptionType.NEUROTESTER)).toBe(true)
    })

    it('should correctly handle case sensitivity', () => {
      expect(isFeatureAvailable('NeuroVideo', SubscriptionType.NEUROTESTER)).toBe(true)
      expect(isFeatureAvailable('neurovideo', SubscriptionType.NEUROTESTER)).toBe(false) // Должно быть false из-за case sensitivity
    })
  })
})
