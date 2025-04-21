import { starCost } from '@/price/starCost'

describe('starCost constant', () => {
  it('should be a positive number equal to 0.016', () => {
    expect(typeof starCost).toBe('number')
    expect(starCost).toBeCloseTo(0.016)
  })
})
