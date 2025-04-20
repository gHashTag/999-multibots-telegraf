import { describe, it, expect } from '@jest/globals'
import { imageModelPrices } from '@/price/models/imageModelPrices'
import { videoModelPrices } from '@/price/models/videoModelPrices'
import { calculateFinalImageCostInStars } from '@/price/models/calculateFinalImageCostInStars'

describe('Image Model Prices', () => {
  it('should have at least one model entry with the correct structure', () => {
    const keys = Object.keys(imageModelPrices)
    expect(keys.length).toBeGreaterThan(0)
    const sampleKey = keys[0]
    const info = imageModelPrices[sampleKey]
    // Check required properties and types
    expect(info).toHaveProperty('shortName')
    expect(typeof info.shortName).toBe('string')
    expect(info).toHaveProperty('description_en')
    expect(typeof info.description_en).toBe('string')
    expect(info).toHaveProperty('description_ru')
    expect(typeof info.description_ru).toBe('string')
    expect(info).toHaveProperty('costPerImage')
    expect(typeof info.costPerImage).toBe('number')
    expect(info.costPerImage).toBeGreaterThan(0)
    expect(info).toHaveProperty('previewImage')
    expect(typeof info.previewImage).toBe('string')
    expect(info).toHaveProperty('inputType')
    expect(Array.isArray(info.inputType)).toBe(true)
    // Validate allowed input types
    info.inputType.forEach(type => {
      expect(['text', 'image', 'dev']).toContain(type)
    })
  })
})

describe('Video Model Prices', () => {
  it('should have correct base prices for known video models', () => {
    expect(videoModelPrices).toHaveProperty('minimax', 0.5)
    expect(videoModelPrices).toHaveProperty('haiper', 0.05)
    expect(videoModelPrices).toHaveProperty('ray', 0.45)
    expect(videoModelPrices).toHaveProperty('i2vgen-xl', 0.45)
  })
})

describe('calculateFinalImageCostInStars', () => {
  it('calculates ceiling of (baseCost * (1 + interestRate) / starCost)', () => {
    // interestRate = 0.5, starCost = 0.016
    // baseCost = 1 => finalCostInDollars = 1.5, costInStars = 1.5 / 0.016 = 93.75 => ceil = 94
    expect(calculateFinalImageCostInStars(1)).toBe(94)
    // baseCost = 2 => finalCostInDollars = 3, costInStars = 3 / 0.016 = 187.5 => ceil = 188
    expect(calculateFinalImageCostInStars(2)).toBe(188)
  })
})