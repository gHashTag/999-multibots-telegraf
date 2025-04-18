/**
 * Unit tests for priceCalculator module
 */
import {
  calculateCost,
  formatCost,
  generateCostMessage,
  stepOptions,
  costDetails,
  conversionRates,
} from '../../src/price/priceCalculator'

describe('priceCalculator', () => {
  it('conversionRates has expected values', () => {
    expect(conversionRates).toEqual({
      costPerStepInStars: 0.25,
      costPerStarInDollars: 0.016,
      rublesToDollarsRate: 100,
    })
  })

  describe('calculateCost', () => {
    it('returns zero values for 0 steps', () => {
      const cost = calculateCost(0)
      expect(cost).toEqual({ steps: 0, stars: 0, dollars: 0, rubles: 0 })
    })

    it('calculates correct cost details for given steps', () => {
      const cost = calculateCost(10)
      // stars = steps * 0.25 = 2.5
      // dollars = stars * 0.016 = 0.04
      // rubles = dollars * 100 = 4
      expect(cost.steps).toBe(10)
      expect(cost.stars).toBeCloseTo(2.5)
      expect(cost.dollars).toBeCloseTo(0.04)
      expect(cost.rubles).toBeCloseTo(4)
    })
  })

  describe('formatCost', () => {
    const sample = { steps: 4, stars: 1, dollars: 0.016, rubles: 1.6 }
    it('formats in Russian correctly', () => {
      const text = formatCost(sample, true)
      // rubles.toFixed(0) rounds 1.6 to 2
      expect(text).toBe('4 шагов - 1⭐ / 2₽')
    })
    it('formats in English correctly', () => {
      const text = formatCost(sample, false)
      // dollars.toFixed(2) formats 0.016 to "0.02"
      expect(text).toBe('4 steps - 1⭐ / $0.02')
    })
  })

  describe('generateCostMessage', () => {
    const costs = [1000, 1500].map(calculateCost)
    it('generates Russian message', () => {
      const msg = generateCostMessage(costs, true)
      const expectedPrefix =
        '🔢 Пожалуйста, выберите количество шагов для обучения модели.\n\n' +
        '📈 Чем больше шагов, тем лучше качество, но это будет стоить дороже. 💰\n\n' +
        '💰 Стоимость:\n'
      const expectedLines = [
        '1000 шагов - 250⭐ / 400₽',
        '1500 шагов - 375⭐ / 600₽',
      ].join('\n')
      expect(msg).toBe(expectedPrefix + expectedLines)
    })
    it('generates English message', () => {
      const msg = generateCostMessage(costs, false)
      const expectedPrefix =
        '🔢 Please choose the number of steps for model training.\n\n' +
        '📈 The more steps, the better the quality, but it will cost more. 💰\n\n' +
        '💰 Cost:\n'
      const expectedLines = [
        '1000 steps - 250⭐ / $4.00',
        '1500 steps - 375⭐ / $6.00',
      ].join('\n')
      expect(msg).toBe(expectedPrefix + expectedLines)
    })
  })

  describe('stepOptions and costDetails', () => {
    it('stepOptions and costDetails have matching lengths and values', () => {
      expect(costDetails).toHaveLength(stepOptions.length)
      stepOptions.forEach((steps, idx) => {
        expect(costDetails[idx].steps).toBe(steps)
      })
    })
  })
})
