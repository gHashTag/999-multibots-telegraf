import { describe, it, expect, test, beforeEach } from 'bun:test'
import { ModeEnum } from '@/interfaces/modes'
import { calculateFinalStarPrice } from '@/price/calculator' // Ensure correct path

// Module mocking with bun test requires different approach or refactoring
// Tests will now rely on the actual implementation reading the config.
// vi.mock('@/config/pricing.config', async () => {
//   return {
//     STAR_COST_USD: 0.016,
//     MARKUP_MULTIPLIER: 1.5,
//     BASE_PRICES_USD: {
//       [ModeEnum.DigitalAvatarBody]: 0,
//       [ModeEnum.DigitalAvatarBodyV2]: 0,
//     },
//     STEP_BASED_PRICES_USD: {
//       [ModeEnum.DigitalAvatarBody]: 0.1,
//       [ModeEnum.DigitalAvatarBodyV2]: 0.2,
//     },
//     CURRENCY_RATES: {
//       USD_TO_RUB: 100,
//     },
//   }
// })

describe('calculateFinalStarPrice for step-based modes', () => {
  beforeEach(() => {
    // Mocks are automatically reset in bun test
  })

  test('should calculate price for DigitalAvatarBody based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: 10,
    })
    // Calculation based on actual pricing.config: stepBaseUSD=0.1, steps=10 => baseUSD=1.0
    // finalStars = floor((1.0 / 0.016) * 1.5) = floor(62.5 * 1.5) = floor(93.75) = 93
    expect(result?.stars).toBe(93)
    expect(result?.rubles).toBeCloseTo(150)
    expect(result?.dollars).toBeCloseTo(1.5)
  })

  test('should calculate price for DigitalAvatarBodyV2 based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBodyV2, {
      steps: 10,
    })
    // Calculation based on actual pricing.config: stepBaseUSD=0.2, steps=10 => baseUSD=2.0
    // finalStars = floor((2.0 / 0.016) * 1.5) = floor(125 * 1.5) = floor(187.5) = 187
    expect(result?.stars).toBe(187)
    expect(result?.rubles).toBeCloseTo(300)
    expect(result?.dollars).toBeCloseTo(3.0)
  })

  test('should return 0 for DigitalAvatarBody when steps = 0', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: 0,
    })
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  test('should return 0 for DigitalAvatarBody when steps is negative', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, {
      steps: -5,
    })
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })

  test('should return 0 for DigitalAvatarBody when steps is not provided', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody)
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })
})
