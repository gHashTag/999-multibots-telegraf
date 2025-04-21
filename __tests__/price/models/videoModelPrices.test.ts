import { videoModelPrices } from '@/price/models/videoModelPrices'

describe('videoModelPrices mapping', () => {
  it('matches expected video model price mappings', () => {
    expect(videoModelPrices).toEqual({
      minimax: 0.5,
      haiper: 0.05,
      ray: 0.45,
      'i2vgen-xl': 0.45,
    })
  })
})
