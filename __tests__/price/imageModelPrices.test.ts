import { imageModelPrices } from '../../src/price/models/imageModelPrices'
import { calculateFinalImageCostInStars } from '../../src/price/models/calculateFinalImageCostInStars'

describe('imageModelPrices', () => {
  it('should contain key flux-1.1-pro with correct cost', () => {
    const key = 'black-forest-labs/flux-1.1-pro'
    const info = imageModelPrices[key]
    expect(info).toBeDefined()
    expect(info.costPerImage).toBe(
      calculateFinalImageCostInStars(0.04)
    )
  })

  it('should have valid inputType array', () => {
    for (const info of Object.values(imageModelPrices)) {
      expect(Array.isArray(info.inputType)).toBe(true)
      expect(info.inputType.length).toBeGreaterThan(0)
    }
  })
})