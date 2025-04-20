import { calculateDiscountedPrice, interestRate, basePrice } from '@/price'

describe('Price Module', () => {
  describe('calculateDiscountedPrice', () => {
    it('applies discount correctly within range', () => {
      // No discount
      expect(calculateDiscountedPrice(100, 0)).toBe(100)
      // 50% discount
      expect(calculateDiscountedPrice(200, 50)).toBe(100)
      // 100% discount => zero
      expect(calculateDiscountedPrice(150, 100)).toBe(0)
      // Over 100% discount clamped to 100
      expect(calculateDiscountedPrice(80, 150)).toBe(0)
      // Negative discount treated as 0
      expect(calculateDiscountedPrice(80, -20)).toBe(80)
    })
  })

  describe('module constants', () => {
    it('exports correct interestRate and basePrice', () => {
      expect(typeof interestRate).toBe('number')
      expect(interestRate).toBe(0.1)
      expect(typeof basePrice).toBe('number')
      expect(basePrice).toBe(100)
    })
  })
})