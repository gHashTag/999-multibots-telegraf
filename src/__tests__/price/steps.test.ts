import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ModeEnum } from '@/interfaces/modes'
import { calculateFinalStarPrice } from '@/price/calculator' // Ensure correct path

// Моки конфигураций для Vitest
// Mock path corrected and updated with actual values
vi.mock('@/config/pricing.config', async () => {
  return {
    STAR_COST_USD: 0.016,
    MARKUP_MULTIPLIER: 1.5,
    BASE_PRICES_USD: {
      // Minimal required for this file, could be more extensive
      [ModeEnum.DigitalAvatarBody]: 0, // Base is 0, price comes from steps
      [ModeEnum.DigitalAvatarBodyV2]: 0, // Base is 0, price comes from steps
    },
    STEP_BASED_PRICES_USD: {
      [ModeEnum.DigitalAvatarBody]: 0.1,
      [ModeEnum.DigitalAvatarBodyV2]: 0.2,
    },
    CURRENCY_RATES: {
      USD_TO_RUB: 100,
    },
  }
})

describe('calculateFinalStarPrice for step-based modes', () => {
  beforeEach(() => {
    vi.clearAllMocks() // Use vi
  })

  // These tests now use the updated mock
  it('should calculate price for DigitalAvatarBody based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: 10,
    })
    // Calculation: stepBaseUSD=0.1, steps=10 => baseUSD=1.0
    // finalStars = floor((1.0 / 0.016) * 1.5) = floor(62.5 * 1.5) = floor(93.75) = 93
    // finalUSD = base * markup = 1.0 * 1.5 = 1.5
    // finalRUB = finalUSD * rate = 1.5 * 100 = 150
    // expect(result).toEqual({ stars: 93, rubles: 150, dollars: 1.5 });
    expect(result?.stars).toBe(93)
    expect(result?.rubles).toBeCloseTo(150)
    expect(result?.dollars).toBeCloseTo(1.5)
  })

  it('should calculate price for DigitalAvatarBodyV2 based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBodyV2, {
      steps: 10,
    })
    // Calculation: stepBaseUSD=0.2, steps=10 => baseUSD=2.0
    // finalStars = floor((2.0 / 0.016) * 1.5) = floor(125 * 1.5) = floor(187.5) = 187
    // finalUSD = base * markup = 2.0 * 1.5 = 3.0
    // finalRUB = finalUSD * rate = 3.0 * 100 = 300
    // expect(result).toEqual({ stars: 187, rubles: 300, dollars: 3.0 });
    expect(result?.stars).toBe(187)
    expect(result?.rubles).toBeCloseTo(300)
    expect(result?.dollars).toBeCloseTo(3.0)
  })

  it('should return 0 for DigitalAvatarBody when steps = 0', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: 0,
    })
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  it('should return 0 for DigitalAvatarBody when steps is negative', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: -5,
    })
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  it('should return 0 for DigitalAvatarBody when steps is not provided', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody)
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })
})
