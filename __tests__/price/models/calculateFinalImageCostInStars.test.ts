import { calculateFinalImageCostInStars } from '@/price/models/calculateFinalImageCostInStars'
import { starCost } from '@/price/starCost'
import { interestRate } from '@/price/interestRate'

describe('calculateFinalImageCostInStars', () => {
  it('returns 0 when baseCost is 0', () => {
    expect(calculateFinalImageCostInStars(0)).toBe(0)
  })

  it('calculates correct number of stars', () => {
    const baseCost = 1
    const expected = Math.ceil((baseCost * (1 + interestRate)) / starCost)
    expect(calculateFinalImageCostInStars(baseCost)).toBe(expected)
  })
})