import { calculateFinalImageCostInStars } from '../../src/price/models/calculateFinalImageCostInStars'

describe('calculateFinalImageCostInStars', () => {
  it('calculates correct cost for baseCost = 1', () => {
    // finalCostInDollars = 1 * (1 + interestRate 0.5) = 1.5
    // costPerStar = 0.016, so 1.5 / 0.016 = 93.75, ceil -> 94
    expect(calculateFinalImageCostInStars(1)).toBe(94)
  })

  it('returns 0 for baseCost = 0', () => {
    expect(calculateFinalImageCostInStars(0)).toBe(0)
  })

  it('handles fractional baseCost', () => {
    // 0.04 * (1 + 0.5) = 0.06, /0.016 = 3.75 -> ceil 4
    expect(calculateFinalImageCostInStars(0.04)).toBe(4)
  })
})