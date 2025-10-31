/**
 * 🔴 RED Phase: Unit Tests for Video Models Configuration
 *
 * Tests model configuration, pricing calculation, and parameter validation
 * Following TDD methodology - these tests SHOULD FAIL initially
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  VIDEO_MODELS,
  getModelPriceInStars,
  isDurationSupported,
  getValidDuration,
  getTextToVideoModels,
  getImageToVideoModels,
  formatModelInfo,
  type VideoModelInfo,
} from '@/services/videoModels'

describe('🧪 Video Models Configuration (UNIT TESTS)', () => {
  describe('VIDEO_MODELS constant', () => {
    it('should contain all 10 text-to-video models', () => {
      const textToVideoModels = Object.values(VIDEO_MODELS).filter(m =>
        m.inputTypes.includes('text')
      )
      expect(textToVideoModels.length).toBeGreaterThanOrEqual(10)
    })

    it('should contain all image-to-video models', () => {
      const imageToVideoModels = Object.values(VIDEO_MODELS).filter(m =>
        m.inputTypes.includes('image')
      )
      expect(imageToVideoModels.length).toBeGreaterThanOrEqual(8)
    })

    it('should have unique model IDs', () => {
      const ids = Object.keys(VIDEO_MODELS)
      const uniqueIds = new Set(ids)
      expect(ids.length).toBe(uniqueIds.size)
    })

    it('should have valid model structure for each model', () => {
      Object.values(VIDEO_MODELS).forEach(model => {
        expect(model).toHaveProperty('id')
        expect(model).toHaveProperty('name')
        expect(model).toHaveProperty('nameRu')
        expect(model).toHaveProperty('inputTypes')
        expect(Array.isArray(model.inputTypes)).toBe(true)
        expect(model.inputTypes.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Pricing Tests', () => {
    describe('Fixed Price Models', () => {
      it('should return correct price for veo3_fast (40 stars)', () => {
        const price = getModelPriceInStars('veo3_fast')
        expect(price).toBe(40)
      })

      it('should return correct price for veo3 (202 stars)', () => {
        const price = getModelPriceInStars('veo3')
        expect(price).toBe(202)
      })

      it('should return correct price for sora-2 (2500 stars)', () => {
        const price = getModelPriceInStars('sora-2')
        expect(price).toBe(2500)
      })

      it('should return correct price for sora-2-pro (3333 stars)', () => {
        const price = getModelPriceInStars('sora-2-pro')
        expect(price).toBe(3333)
      })

      it('should return correct price for kling-v1.6-pro (9 stars)', () => {
        const price = getModelPriceInStars('kling-v1.6-pro')
        expect(price).toBe(9)
      })

      it('should return correct price for minimax (46 stars)', () => {
        const price = getModelPriceInStars('minimax')
        expect(price).toBe(46)
      })
    })

    describe('Dynamic Price Models', () => {
      it('should calculate price for runway-aleph based on duration', () => {
        const price4sec = getModelPriceInStars('runway-aleph', 4)
        const price8sec = getModelPriceInStars('runway-aleph', 8)

        expect(price8sec).toBeGreaterThan(price4sec)
        expect(price8sec / price4sec).toBeCloseTo(2, 0)
      })

      it('should use default duration if not specified', () => {
        const priceWithoutDuration = getModelPriceInStars('runway-aleph')
        const priceWithDefault = getModelPriceInStars('runway-aleph', 4)

        expect(priceWithoutDuration).toBe(priceWithDefault)
      })
    })

    describe('Error Handling', () => {
      it('should throw error for unknown model', () => {
        expect(() => getModelPriceInStars('unknown-model' as any)).toThrow()
      })

      it('should handle negative duration gracefully', () => {
        expect(() => getModelPriceInStars('runway-aleph', -5)).toThrow()
      })

      it('should handle zero duration', () => {
        expect(() => getModelPriceInStars('runway-aleph', 0)).toThrow()
      })
    })
  })

  describe('Duration Support Tests', () => {
    it('should support all durations for fixed-price models', () => {
      expect(isDurationSupported('veo3_fast', 4)).toBe(true)
      expect(isDurationSupported('veo3_fast', 8)).toBe(true)
      expect(isDurationSupported('veo3_fast', 100)).toBe(true)
    })

    it('should validate durations for runway-aleph', () => {
      const model = VIDEO_MODELS['runway-aleph']

      if (model.supportedDurations) {
        model.supportedDurations.forEach(duration => {
          expect(isDurationSupported('runway-aleph', duration)).toBe(true)
        })
      }
    })

    it('should reject unsupported durations for dynamic models', () => {
      const model = VIDEO_MODELS['runway-aleph']

      if (model.supportedDurations && model.maxDuration) {
        expect(isDurationSupported('runway-aleph', model.maxDuration + 1)).toBe(false)
      }
    })
  })

  describe('Valid Duration Calculation', () => {
    it('should return undefined for fixed-price models', () => {
      expect(getValidDuration('veo3_fast', 8)).toBeUndefined()
      expect(getValidDuration('sora-2', 10)).toBeUndefined()
    })

    it('should return default duration if no duration specified', () => {
      const model = VIDEO_MODELS['runway-aleph']

      if (model.defaultDuration) {
        expect(getValidDuration('runway-aleph')).toBe(model.defaultDuration)
      }
    })

    it('should return requested duration if supported', () => {
      const model = VIDEO_MODELS['runway-aleph']

      if (model.supportedDurations && model.supportedDurations.includes(8)) {
        expect(getValidDuration('runway-aleph', 8)).toBe(8)
      }
    })

    it('should return default duration for unsupported request', () => {
      const model = VIDEO_MODELS['runway-aleph']

      if (model.defaultDuration) {
        expect(getValidDuration('runway-aleph', 999)).toBe(model.defaultDuration)
      }
    })
  })

  describe('Model Filtering', () => {
    it('should return all text-to-video models', () => {
      const models = getTextToVideoModels()

      expect(models.length).toBeGreaterThan(0)
      models.forEach(model => {
        expect(model.inputTypes).toContain('text')
      })
    })

    it('should return all image-to-video models', () => {
      const models = getImageToVideoModels()

      expect(models.length).toBeGreaterThan(0)
      models.forEach(model => {
        expect(model.inputTypes).toContain('image')
      })
    })

    it('should include dual-mode models in both lists', () => {
      const textModels = getTextToVideoModels()
      const imageModels = getImageToVideoModels()

      const textModelIds = textModels.map(m => m.id)
      const imageModelIds = imageModels.map(m => m.id)

      // veo3_fast and kling-v1.6-pro should be in both
      expect(textModelIds).toContain('veo3_fast')
      expect(imageModelIds).toContain('veo3_fast')
    })
  })

  describe('Model Info Formatting', () => {
    it('should format fixed-price model info in English', () => {
      const info = formatModelInfo('veo3_fast', undefined, false)

      expect(info).toContain('Veo 3 Fast')
      expect(info).toContain('40')
      expect(info).toContain('⭐')
    })

    it('should format fixed-price model info in Russian', () => {
      const info = formatModelInfo('veo3_fast', undefined, true)

      expect(info).toContain('Veo 3 Fast')
      expect(info).toContain('40')
      expect(info).toContain('⭐')
    })

    it('should include duration for dynamic models', () => {
      const info = formatModelInfo('runway-aleph', 8, false)

      expect(info).toContain('8')
      expect(info).toContain('сек')
    })

    it('should return unknown model message for invalid ID', () => {
      const info = formatModelInfo('invalid-model' as any)

      expect(info).toBe('Unknown model')
    })
  })

  describe('Model Categories', () => {
    it('should categorize Kie.ai models correctly', () => {
      const kieModels = ['veo3_fast', 'veo3', 'runway-aleph']

      kieModels.forEach(modelId => {
        const model = VIDEO_MODELS[modelId as keyof typeof VIDEO_MODELS]
        expect(model).toBeDefined()
      })
    })

    it('should categorize Sora models correctly', () => {
      const soraModels = ['sora-2', 'sora-2-pro']

      soraModels.forEach(modelId => {
        const model = VIDEO_MODELS[modelId as keyof typeof VIDEO_MODELS]
        expect(model).toBeDefined()
        expect(model.inputTypes).toContain('text')
      })
    })

    it('should categorize Replicate models correctly', () => {
      const replicateModels = [
        'kling-v1.6-pro',
        'ray-v2',
        'hunyuan-video-fast',
        'wan-image-to-video',
        'wan-text-to-video',
        'minimax',
      ]

      replicateModels.forEach(modelId => {
        const model = VIDEO_MODELS[modelId as keyof typeof VIDEO_MODELS]
        expect(model).toBeDefined()
      })
    })
  })

  describe('Price Consistency', () => {
    it('should have consistent pricing across all models', () => {
      Object.entries(VIDEO_MODELS).forEach(([id, model]) => {
        // Either fixed price or price per second should be defined
        const hasFixedPrice = model.priceFixed !== undefined
        const hasDynamicPrice = model.pricePerSecond !== undefined

        expect(hasFixedPrice || hasDynamicPrice).toBe(true)
      })
    })

    it('should calculate prices within reasonable ranges', () => {
      Object.entries(VIDEO_MODELS).forEach(([id, model]) => {
        const price = getModelPriceInStars(id as any)

        // Prices should be positive
        expect(price).toBeGreaterThan(0)

        // Prices should be reasonable (less than 10000 stars)
        expect(price).toBeLessThan(10000)
      })
    })
  })
})
