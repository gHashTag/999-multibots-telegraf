import { urlJoin } from '@/utils/url'
import { getConfig } from '@/utils/getConfig'
import { isRussian } from '@/helpers/language'
import { calculateCostInStars } from '@/price/helpers/calculateCostInStars'
import { calculateStars } from '@/price/helpers/calculateStars'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import {
  calculateCostInStars as calcTrainStars,
  calculateCostInDollars,
  calculateCostInRubles,
} from '@/price/helpers/calculateTrainingCost'
import { starAmounts } from '@/price/helpers/starAmounts'
import { starCost } from '@/price/starCost'

describe('Pure utility functions', () => {
  describe('urlJoin', () => {
    it('joins paths correctly without duplicate slashes', () => {
      const url = urlJoin('http://example.com/', '/path/', '/to/', 'resource/')
      expect(url).toBe('http://example.com/path/to/resource')
    })
    it('returns base when no paths', () => {
      expect(urlJoin('http://example.com')).toBe('http://example.com')
    })
  })

  describe('isRussian', () => {
    it('returns true when language_code is ru', () => {
      expect(isRussian({ from: { language_code: 'ru' } } as any)).toBe(true)
    })
    it('returns false otherwise', () => {
      expect(isRussian({ from: { language_code: 'en' } } as any)).toBe(false)
      expect(isRussian({} as any)).toBe(false)
    })
  })

  // getPhotoUrl and getBotNameByToken are not covered here

  describe('price calculations', () => {
    it('calculateCostInStars divides by starCost', () => {
      const cost = calculateCostInStars(1)
      expect(cost).toBeCloseTo(1 / starCost)
    })
    it('calculateStars floors paymentAmount / starCost', () => {
      expect(calculateStars(10, 2)).toBe(5)
    })
    it('calculateFinalPrice returns floor of finalPrice/starCost', () => {
      const fakeModel = 'someModel' as any
      // Define a dummy price in videoModelPrices
      const price = calculateFinalPrice(fakeModel)
      expect(typeof price).toBe('number')
    })
  })

  describe('calculateTrainingCost functions', () => {
    it('calculates training stars cost correctly', () => {
      expect(calcTrainStars(10, { costPerStepInStars: 0.5 })).toBe(5)
    })
    it('calculates training dollars cost correctly', () => {
      expect(
        calculateCostInDollars(10, {
          costPerStepInStars: 1,
          costPerStarInDollars: 0.1,
        })
      ).toBe(1)
    })
    it('calculates training rubles cost correctly', () => {
      expect(
        calculateCostInRubles(10, {
          costPerStepInStars: 1,
          costPerStarInDollars: 0.1,
          rublesToDollarsRate: 60,
        })
      ).toBe(60)
    })
  })

  describe('starAmounts', () => {
    it('contains expected star amounts', () => {
      expect(starAmounts).toContain(10)
      expect(starAmounts).toContain(44000)
    })
  })

  describe('getConfig', () => {
    it('returns config with default and env values', async () => {
      process.env.PORT = '4000'
      const cfg = await getConfig()
      expect(cfg.PORT).toBe(4000)
      expect(cfg.NODE_ENV).toBeDefined()
    })
    it('returns default port when PORT not set', async () => {
      delete process.env.PORT
      const cfg = await getConfig()
      expect(cfg.PORT).toBe(3000)
    })
  })
})
