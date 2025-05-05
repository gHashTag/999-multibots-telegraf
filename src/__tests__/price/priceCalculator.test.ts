// Импортируем нужные функции и типы
import {
  calculateFinalPrice,
  calculateBasePrice,
  calculateRubPrice,
} from '../../price/priceCalculator.ts'
import {
  PriceCalculationType,
  PaymentMethod,
  ServiceType,
} from '../../interfaces/modes.ts'
import { vi } from 'vitest' // Import vi for mocking
import { describe, it, expect } from 'vitest'
import {
  calculateCost,
  formatCost,
  conversionRates, // Import rates for assertions
  conversionRatesV2,
  type CostDetails,
} from '../../price/priceCalculator' // Adjust path if necessary

// Используем vi.mock вместо jest.mock
vi.mock('@/config/pricing.config', () => ({
  STAR_COST_USD: 0.01,
  MARKUP_MULTIPLIER: 2,
  BASE_PRICES_USD: {
    neuro_photo: 0.1,
    digital_avatar_body: 0,
    image_to_video: 0, // Пример
    helpScene: 0,
  },
  STEP_BASED_PRICES_USD: {
    digital_avatar_body: 0.02,
  },
  CURRENCY_RATES: {
    USD_TO_RUB: 100,
  },
  // Добавим мок для VIDEO_MODELS_CONFIG, если он используется в calculateFinalPrice
  VIDEO_MODELS_CONFIG: {
    'some-video-model': { basePrice: 0.5 }, // Пример
  },
}))

describe('Price Calculator Functions', () => {
  describe('calculateCost', () => {
    it('should correctly calculate cost for v1', () => {
      const steps = 1000
      const expectedStars = steps * conversionRates.costPerStepInStars // 1000 * 0.22 = 220
      const expectedDollars =
        expectedStars * conversionRates.costPerStarInDollars // 220 * 0.016 = 3.52
      const expectedRubles =
        expectedDollars * conversionRates.rublesToDollarsRate // 3.52 * 80 = 281.6

      const result = calculateCost(steps, 'v1')

      expect(result.steps).toBe(steps)
      // Use closeTo for floating point comparisons
      expect(result.stars).toBeCloseTo(expectedStars)
      expect(result.dollars).toBeCloseTo(expectedDollars)
      expect(result.rubles).toBeCloseTo(expectedRubles)
    })

    it('should correctly calculate cost for v2', () => {
      const steps = 200
      const expectedStars = steps * conversionRatesV2.costPerStepInStars // 200 * 0.5 = 100
      const expectedDollars =
        expectedStars * conversionRatesV2.costPerStarInDollars // 100 * 0.016 = 1.6
      const expectedRubles =
        expectedDollars * conversionRatesV2.rublesToDollarsRate // 1.6 * 80 = 128

      const result = calculateCost(steps, 'v2')

      expect(result.steps).toBe(steps)
      expect(result.stars).toBeCloseTo(expectedStars)
      expect(result.dollars).toBeCloseTo(expectedDollars)
      expect(result.rubles).toBeCloseTo(expectedRubles)
    })

    it('should default to v1 if version is not specified', () => {
      const steps = 1500
      const resultV1 = calculateCost(steps, 'v1')
      const resultDefault = calculateCost(steps)
      expect(resultDefault).toEqual(resultV1)
    })
  })

  describe('formatCost', () => {
    const costDetails: CostDetails = {
      steps: 1000,
      stars: 220,
      dollars: 3.52,
      rubles: 281.6,
    }

    it('should format cost correctly for Russian language', () => {
      const expectedFormat = '1000 шагов - 220⭐ / 282₽' // Note rounding for rubles
      const result = formatCost(costDetails, true)
      expect(result).toBe(expectedFormat)
    })

    it('should format cost correctly for English language', () => {
      const expectedFormat = '1000 steps - 220⭐ / $3.52' // Note rounding for stars
      const result = formatCost(costDetails, false)
      expect(result).toBe(expectedFormat)
    })
  })

  // TODO: Add tests for generateCostMessage if needed
})
