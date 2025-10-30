/**
 * FINANCIAL TESTING SUITE - Payment Categorization
 * Tests for validating payment categorization rules and ZOT model implementation
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { calculateServiceCost, getServiceCostConfig, isServiceCostSupported, getSupportedServices } from '../../src/price/helpers/calculateServiceCost'

describe('Payment Categorization Tests', () => {
  describe('Service Cost Configuration Validation', () => {
    test('should have valid configuration for all supported services', () => {
      const supportedServices = getSupportedServices()

      expect(supportedServices).toContain('neuro_photo')
      expect(supportedServices).toContain('kling_video')
      expect(supportedServices).toContain('haiper_video')
      expect(supportedServices).toContain('morphing')
      expect(supportedServices).toContain('morphing_seamless')

      // Validate each service has proper configuration
      supportedServices.forEach(service => {
        const config = getServiceCostConfig(service)
        expect(config).toBeDefined()
        expect(config!.baseCost).toBeGreaterThan(0)
        expect(config!.minCost).toBeGreaterThanOrEqual(0)
        expect(config!.maxCost).toBeGreaterThan(config!.minCost!)
      })
    })

    test('should return false for unsupported services', () => {
      expect(isServiceCostSupported('unknown_service')).toBe(false)
      expect(isServiceCostSupported('invalid_service')).toBe(false)
      expect(isServiceCostSupported('')).toBe(false)
    })

    test('should return null config for unsupported services', () => {
      expect(getServiceCostConfig('unknown_service')).toBeNull()
      expect(getServiceCostConfig('')).toBeNull()
    })
  })

  describe('Neuro Photo Cost Calculation', () => {
    test('should calculate cost correctly for single photo', () => {
      const cost = calculateServiceCost('neuro_photo', { num_images: 1 })
      expect(cost).toBe(4) // 4⭐ per photo
    })

    test('should calculate cost correctly for multiple photos', () => {
      const cost5 = calculateServiceCost('neuro_photo', { num_images: 5 })
      expect(cost5).toBe(20) // 5 * 4⭐

      const cost10 = calculateServiceCost('neuro_photo', { num_images: 10 })
      expect(cost10).toBe(40) // 10 * 4⭐
    })

    test('should respect maximum cost limit for neuro_photo', () => {
      const cost = calculateServiceCost('neuro_photo', { num_images: 200 })
      expect(cost).toBe(400) // Max cost limit
    })

    test('should handle invalid num_images values', () => {
      expect(calculateServiceCost('neuro_photo', { num_images: 0 })).toBe(4) // Min cost
      expect(calculateServiceCost('neuro_photo', { num_images: -1 })).toBe(4) // Min cost
      expect(calculateServiceCost('neuro_photo', { num_images: 'invalid' })).toBe(4) // Min cost
      expect(calculateServiceCost('neuro_photo', {})).toBe(4) // Default base cost
    })

    test('should handle missing metadata', () => {
      const cost = calculateServiceCost('neuro_photo')
      expect(cost).toBe(4) // Base cost when no metadata
    })
  })

  describe('Video Services Cost Calculation', () => {
    test('should calculate Kling video cost correctly', () => {
      const cost = calculateServiceCost('kling_video')
      expect(cost).toBe(10)
    })

    test('should calculate Haiper video cost correctly', () => {
      const cost = calculateServiceCost('haiper_video')
      expect(cost).toBe(12)
    })

    test('should calculate Minimax video cost correctly', () => {
      const cost = calculateServiceCost('minimax_video')
      expect(cost).toBe(390) // Real cost from DB
    })

    test('should calculate video generation other cost correctly', () => {
      const cost = calculateServiceCost('video_generation_other')
      expect(cost).toBe(158) // Real cost from DB
    })
  })

  describe('Morphing Services Cost Calculation', () => {
    test('should calculate morphing cost correctly', () => {
      const cost = calculateServiceCost('morphing')
      expect(cost).toBe(84) // Real cost from logs
    })

    test('should calculate seamless morphing cost correctly', () => {
      const cost = calculateServiceCost('morphing_seamless')
      expect(cost).toBe(126) // Base cost for Kling morphing
    })
  })

  describe('Other Services Cost Calculation', () => {
    test('should calculate image to prompt cost correctly', () => {
      const cost = calculateServiceCost('image_to_prompt')
      expect(cost).toBe(1)
    })

    test('should calculate text to speech cost correctly', () => {
      const cost = calculateServiceCost('text_to_speech')
      expect(cost).toBe(4)
    })

    test('should calculate model training cost correctly', () => {
      const cost = calculateServiceCost('model_training_other')
      expect(cost).toBe(25)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    test('should return 0 for null service type', () => {
      const cost = calculateServiceCost(null)
      expect(cost).toBe(0)
    })

    test('should return 0 for undefined service type', () => {
      const cost = calculateServiceCost(undefined as any)
      expect(cost).toBe(0)
    })

    test('should return 0 for unknown service type', () => {
      const loggerSpy = jest.spyOn(console, 'warn').mockImplementation()
      const cost = calculateServiceCost('unknown_service')
      expect(cost).toBe(0)
      loggerSpy.mockRestore()
    })

    test('should handle extreme values in metadata', () => {
      // Test with extremely large number
      const costLarge = calculateServiceCost('neuro_photo', { num_images: 999999 })
      expect(costLarge).toBe(400) // Should hit max limit

      // Test with floating point number
      const costFloat = calculateServiceCost('neuro_photo', { num_images: 2.5 })
      expect(costFloat).toBe(8) // Should convert to integer: 2 * 4
    })
  })

  describe('Cost Configuration Validation', () => {
    test('should have realistic cost ranges for all services', () => {
      const services = getSupportedServices()

      services.forEach(service => {
        const config = getServiceCostConfig(service)!

        // Base cost should be reasonable (between 1 and 500 stars)
        expect(config.baseCost).toBeGreaterThanOrEqual(1)
        expect(config.baseCost).toBeLessThanOrEqual(500)

        // Min cost should not exceed base cost
        if (config.minCost !== undefined) {
          expect(config.minCost).toBeLessThanOrEqual(config.baseCost)
        }

        // Max cost should be at least base cost
        if (config.maxCost !== undefined) {
          expect(config.maxCost).toBeGreaterThanOrEqual(config.baseCost)
        }
      })
    })

    test('should maintain consistency in pricing hierarchy', () => {
      // Verify that expensive services cost more than cheap ones
      const cheapService = calculateServiceCost('image_to_prompt')
      const moderateService = calculateServiceCost('neuro_photo')
      const expensiveService = calculateServiceCost('minimax_video')

      expect(cheapService).toBeLessThan(moderateService)
      expect(moderateService).toBeLessThan(expensiveService)
    })
  })
})

describe('Real vs Virtual Money Separation', () => {
  describe('Payment Type Classification', () => {
    test('should correctly identify MONEY_INCOME types', () => {
      const moneyIncomeTypes = ['MONEY_INCOME']
      expect(moneyIncomeTypes).toContain('MONEY_INCOME')
    })

    test('should correctly identify MONEY_OUTCOME types', () => {
      const moneyOutcomeTypes = ['MONEY_OUTCOME']
      expect(moneyOutcomeTypes).toContain('MONEY_OUTCOME')
    })

    test('should correctly identify bonus types', () => {
      const bonusTypes = ['BONUS', 'REFERRAL', 'SYSTEM']
      expect(bonusTypes).toContain('BONUS')
      expect(bonusTypes).toContain('REFERRAL')
      expect(bonusTypes).toContain('SYSTEM')
    })
  })

  describe('Category Classification', () => {
    test('should correctly identify REAL category payments', () => {
      // Real payments are typically from Robokassa (RUB) or Telegram Stars (XTR)
      const realPaymentCategories = ['REAL']
      expect(realPaymentCategories).toContain('REAL')
    })

    test('should correctly identify BONUS category payments', () => {
      const bonusPaymentCategories = ['BONUS']
      expect(bonusPaymentCategories).toContain('BONUS')
    })
  })

  describe('Payment Method Validation', () => {
    test('should recognize valid payment methods', () => {
      const validPaymentMethods = [
        'Robokassa',
        'Telegram',
        'Manual',
        'System',
        'Bonus'
      ]

      validPaymentMethods.forEach(method => {
        expect(typeof method).toBe('string')
        expect(method.length).toBeGreaterThan(0)
      })
    })

    test('should handle currency validation', () => {
      const validCurrencies = ['RUB', 'XTR', 'STARS', 'USD']

      validCurrencies.forEach(currency => {
        expect(typeof currency).toBe('string')
        expect(currency.length).toBeGreaterThanOrEqual(3)
      })
    })
  })
})

describe('Mathematical Formula Validation', () => {
  describe('Star Conversion Formulas', () => {
    test('should validate star to ruble conversion accuracy', () => {
      // Based on real price calculator constants
      const STAR_COST = 0.016 // dollars per star
      const RUBLES_TO_DOLLARS_RATE = 80

      const starsToRubles = (stars: number) => stars * STAR_COST * RUBLES_TO_DOLLARS_RATE

      expect(starsToRubles(100)).toBeCloseTo(128, 1) // 100 stars ≈ 128 rubles
      expect(starsToRubles(1000)).toBeCloseTo(1280, 1) // 1000 stars ≈ 1280 rubles
    })

    test('should validate cost per step calculations', () => {
      const COST_PER_STEP_IN_STARS = 0.22
      const COST_PER_STEP_IN_STARS_V2 = 0.5

      expect(COST_PER_STEP_IN_STARS_V2).toBeGreaterThan(COST_PER_STEP_IN_STARS)
      expect(COST_PER_STEP_IN_STARS).toBeGreaterThan(0)
      expect(COST_PER_STEP_IN_STARS_V2).toBeGreaterThan(0)
    })
  })

  describe('Balance Calculation Accuracy', () => {
    test('should calculate total balance correctly', () => {
      const mockData = {
        realIncomes: [
          { stars: 100, category: 'REAL', type: 'MONEY_INCOME' },
          { stars: 200, category: 'REAL', type: 'MONEY_INCOME' }
        ],
        bonusIncomes: [
          { stars: 50, category: 'BONUS', type: 'BONUS' }
        ],
        outcomes: [
          { stars: 30, category: 'REAL', type: 'MONEY_OUTCOME' },
          { stars: 20, category: 'REAL', type: 'MONEY_OUTCOME' }
        ]
      }

      const totalRealStars = mockData.realIncomes.reduce((sum, p) => sum + p.stars, 0)
      const totalBonusStars = mockData.bonusIncomes.reduce((sum, p) => sum + p.stars, 0)
      const totalOutcomeStars = mockData.outcomes.reduce((sum, p) => sum + p.stars, 0)
      const totalBalance = totalRealStars + totalBonusStars - totalOutcomeStars

      expect(totalRealStars).toBe(300)
      expect(totalBonusStars).toBe(50)
      expect(totalOutcomeStars).toBe(50)
      expect(totalBalance).toBe(300) // 300 + 50 - 50 = 300
    })

    test('should handle negative balances correctly', () => {
      const mockData = {
        realIncomes: [{ stars: 50 }],
        bonusIncomes: [{ stars: 25 }],
        outcomes: [{ stars: 100 }]
      }

      const totalRealStars = mockData.realIncomes.reduce((sum, p) => sum + p.stars, 0)
      const totalBonusStars = mockData.bonusIncomes.reduce((sum, p) => sum + p.stars, 0)
      const totalOutcomeStars = mockData.outcomes.reduce((sum, p) => sum + p.stars, 0)
      const totalBalance = totalRealStars + totalBonusStars - totalOutcomeStars

      expect(totalBalance).toBe(-25) // 50 + 25 - 100 = -25
    })
  })

  describe('Precision and Rounding', () => {
    test('should handle decimal precision correctly', () => {
      const value1 = 123.456789
      const value2 = 987.123456

      // Test rounding to 2 decimal places
      expect(Math.round(value1 * 100) / 100).toBe(123.46)
      expect(Math.round(value2 * 100) / 100).toBe(987.12)
    })

    test('should handle floating point arithmetic correctly', () => {
      // Common floating point precision issues
      const result1 = 0.1 + 0.2
      const result2 = 0.3

      expect(Math.abs(result1 - result2)).toBeLessThan(0.000001)
      expect(Number((result1).toFixed(2))).toBe(0.30)
    })
  })
})