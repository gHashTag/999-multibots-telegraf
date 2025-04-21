import { imageModelPrices } from '@/price/models/imageModelPrices'
import { calculateFinalImageCostInStars } from '@/price/models/calculateFinalImageCostInStars'

describe('imageModelPrices mapping', () => {
  it('contains pro model with correct costPerImage', () => {
    const key = 'black-forest-labs/flux-1.1-pro'
    expect(imageModelPrices).toHaveProperty(key)
    const info = imageModelPrices[key]
    expect(info.costPerImage).toBe(calculateFinalImageCostInStars(0.04))
    expect(typeof info.shortName).toBe('string')
    expect(info.inputType).toEqual(expect.arrayContaining(['text', 'image']))
  })

  it('contains ultra pro model with correct cost', () => {
    const key = 'black-forest-labs/flux-1.1-pro-ultra'
    const info = imageModelPrices[key]
    expect(info.costPerImage).toBe(calculateFinalImageCostInStars(0.06))
  })
})
