import { starAmounts } from '../../src/price/helpers/starAmounts'

describe('starAmounts constant', () => {
  it('should contain the expected star amounts', () => {
    expect(starAmounts).toEqual([
      10, 50, 100, 500, 1000, 2000, 5000, 6000, 7000, 10000, 20000, 44000,
      75000,
    ])
  })
})
