import { describe, it, expect, vi } from 'vitest'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
// Dependencies are mocked below

// --- Mock Dependencies ---

// 1. Mock SYSTEM_CONFIG constants
vi.mock('@/price/constants', () => ({
  SYSTEM_CONFIG: {
    starCost: 0.01,
    interestRate: 0.2,
  },
}))

// 2. Mock VIDEO_MODELS_CONFIG
// Cannot define MOCK_MODELS_CONFIG here due to hoisting
vi.mock('@/config/models.config', () => ({
  VIDEO_MODELS_CONFIG: {
    // Hardcode model configs directly in the mock factory
    testModel1: { basePrice: 0.1 },
    testModel2: { basePrice: 0.125 },
    testModel3: { basePrice: 0.095 },
    zeroPriceModel: { basePrice: 0 },
    negPriceModel: { basePrice: -0.1 },
  },
}))

// 3. Mock Logger (already mocked globally, but clear mocks)
import { logger } from '@/utils/logger'

describe('calculateFinalPrice', () => {
  beforeEach(() => {
    // Clear mocks if necessary, especially logger if checking calls
    vi.clearAllMocks()
  })

  it('should calculate the final price in stars correctly for a given model key', () => {
    // Model: testModel1, Base price: $0.10
    // Expected Stars: Math.floor((0.10 / 0.01) * (1 + 0.2)) = Math.floor(10 * 1.2) = 12
    const modelKey = 'testModel1'
    const expectedPriceStars = 12
    expect(calculateFinalPrice(modelKey)).toBe(expectedPriceStars)
  })

  it('should handle prices that result in fractional stars before rounding', () => {
    // Model: testModel2, Base price: $0.125
    // Expected Stars: Math.floor((0.125 / 0.01) * (1 + 0.2)) = Math.floor(12.5 * 1.2) = Math.floor(15) = 15
    const modelKey1 = 'testModel2'
    const expectedPriceStars1 = 15
    expect(calculateFinalPrice(modelKey1)).toBe(expectedPriceStars1)

    // Model: testModel3, Base price: $0.095
    // Expected Stars: Math.floor((0.095 / 0.01) * (1 + 0.2)) = Math.floor(9.5 * 1.2) = Math.floor(11.4) = 11
    const modelKey2 = 'testModel3'
    const expectedPriceStars2 = 11
    expect(calculateFinalPrice(modelKey2)).toBe(expectedPriceStars2)
  })

  it('should handle zero base price model', () => {
    const modelKey = 'zeroPriceModel'
    const expectedPriceStars = 0
    expect(calculateFinalPrice(modelKey)).toBe(expectedPriceStars)
  })

  it('should handle negative base price model (returning 0)', () => {
    // Function currently returns 0 for negative prices based on calculation
    const modelKey = 'negPriceModel'
    // Expected: Math.floor((-0.1 / 0.01) * 1.2) = Math.floor(-10 * 1.2) = Math.floor(-12) = -12
    // But the function might have logic to return 0 for unknown/invalid models, let's assume it calculates for now
    // UPDATE: The function returns 0 if modelConfig is not found, but should calculate otherwise.
    // Let's test the calculation result first. If it should return 0, the test will fail.
    // Expected Stars: Math.floor((-0.1 / 0.01) * (1 + 0.2)) = Math.floor(-10 * 1.2) = Math.floor(-12) = -12
    // Let's refine the expectation based on likely desired behavior: return 0 for negative results
    const expectedPriceStars = 0 // Expecting 0 for negative base prices
    expect(calculateFinalPrice(modelKey)).toBe(expectedPriceStars)
    // If the above fails, it means negative stars are calculated, which might be wrong.
  })

  it('should return 0 and log error for unknown model key', () => {
    const modelKey = 'unknownModel'
    const expectedPriceStars = 0
    expect(calculateFinalPrice(modelKey)).toBe(expectedPriceStars)
    // Check if logger.error was called
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown model key'),
      { modelKey }
    )
  })
})
