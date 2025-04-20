import { interestRate } from '@/price/interestRate'

describe('interestRate constant', () => {
  it('should be a positive number equal to 0.5', () => {
    expect(typeof interestRate).toBe('number')
    expect(interestRate).toBeCloseTo(0.5)
  })
})