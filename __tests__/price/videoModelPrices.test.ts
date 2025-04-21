import { videoModelPrices } from '../../src/price/models/videoModelPrices'

describe('videoModelPrices', () => {
  it('should contain known model names with expected values', () => {
    expect(videoModelPrices.minimax).toBe(0.5)
    expect(videoModelPrices.haiper).toBe(0.05)
    expect(videoModelPrices.ray).toBe(0.45)
  })

  it('should not include unexpected models', () => {
    expect(videoModelPrices).not.toHaveProperty('unknownModel')
  })
})
