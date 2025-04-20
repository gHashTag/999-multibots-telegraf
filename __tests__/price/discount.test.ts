import { describe, it, expect } from '@jest/globals'
import { calculateDiscountedPrice, interestRate, basePrice } from '../../src/price'

describe('calculateDiscountedPrice and constants', () => {
  it('interestRate should be 0.1 and basePrice 100', () => {
    expect(interestRate).toBeCloseTo(0.1)
    expect(basePrice).toBe(100)
  })

  it('applies no discount when discount is 0%', () => {
    expect(calculateDiscountedPrice(200, 0)).toBe(200)
  })

  it('applies 50% discount correctly', () => {
    expect(calculateDiscountedPrice(200, 50)).toBe(100)
    expect(calculateDiscountedPrice(101, 50)).toBe(50) // 101 * 0.5 = 50.5 -> rounded
  })

  it('returns 0 when discount is 100%', () => {
    expect(calculateDiscountedPrice(123, 100)).toBe(0)
  })

  it('clamps discount below 0 to 0%', () => {
    expect(calculateDiscountedPrice(150, -10)).toBe(150)
  })

  it('clamps discount above 100 to 100%', () => {
    expect(calculateDiscountedPrice(150, 150)).toBe(0)
  })
})