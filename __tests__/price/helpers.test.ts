/**
 * Unit tests for price helper functions
 */
import { describe, it, expect } from '@jest/globals'

// Test calculateCostInStars (dollars to stars)
import { calculateCostInStars as calcStarsFromDollars } from '@/price/helpers/calculateCostInStars'
// Test calculateFinalPrice (video model price)
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
// Test calculateStars helper
import { calculateStars } from '@/price/helpers/calculateStars'
// Test training cost calculations
import {
  calculateCostInStars as calcTrainingStars,
  calculateCostInDollars,
  calculateCostInRubles,
} from '@/price/helpers/calculateTrainingCost'

describe('Price Helpers', () => {
  it('calcStarsFromDollars: should convert dollars to stars using starCost', () => {
    // starCost = 0.016, so 0.016 USD => 1 star
    expect(calcStarsFromDollars(0.016)).toBeCloseTo(1)
    // 0 USD => 0 stars
    expect(calcStarsFromDollars(0)).toBe(0)
    // Example: 1 USD => floor(1/0.016) = floor(62.5) = 62.5? Actually returns 62.5 by division, not floor
    // division returns costInDollars / starCost, without floor
    expect(calcStarsFromDollars(1)).toBeCloseTo(62.5)
  })

  it('calculateStars: floors the division of amount by star cost', () => {
    expect(calculateStars(1, 0.5)).toBe(2) // floor(1/0.5) = 2
    expect(calculateStars(1.2, 0.5)).toBe(2) // floor(2.4) = 2
    expect(calculateStars(0, 0.1)).toBe(0)
  })

  it('calculateFinalPrice: computes final stars price for video models', () => {
    // For 'minimax': basePrice=0.5, interestRate=0.1 => 0.55 USD, /starCost=0.55/0.016=34.375 => floor=34
    expect(calculateFinalPrice('minimax')).toBe(34)
    // For 'haiper': basePrice=0.05, interestRate=0.1 => 0.055 USD, /0.016=3.4375 => floor=3
    expect(calculateFinalPrice('haiper')).toBe(3)
  })

  it('training cost helpers: cost in stars, dollars, rubles', () => {
    const rates = { costPerStepInStars: 2, costPerStarInDollars: 0.5, rublesToDollarsRate: 80 }
    // stars: steps * 2, rounded to 2 decimals
    expect(calcTrainingStars(3, { costPerStepInStars: 2 })).toBe(6.00)
    // cost in dollars: 3*2*0.5=3.00
    expect(calculateCostInDollars(3, rates)).toBe(3.00)
    // rubles: 3*2*0.5*80 = 240
    expect(calculateCostInRubles(3, rates)).toBe(240.00)
  })
})

import makeMockContext from '../utils/mockTelegrafContext'
import { validateAndCalculateImageModelPrice } from '@/price/helpers/validateAndCalculateImageModelPrice'
import { validateAndCalculateVideoModelPrice } from '@/price/helpers/validateAndCalculateVideoModelPrice'

describe('validateAndCalculateImageModelPrice', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const availableModels = ['modelA']
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
  })

  it('returns null and prompts when model is invalid', async () => {
    const result = await validateAndCalculateImageModelPrice('', availableModels, 100, true, ctx)
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith('Пожалуйста, выберите корректную модель')
  })

  it('returns null and prompts when costPerImage missing', async () => {
    // Use a model not in price list
    const result = await validateAndCalculateImageModelPrice('unknown', ['unknown'], 100, false, ctx)
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith('Error: invalid image model.')
  })

  it('returns null when balance is insufficient', async () => {
    // Choose a known model from imageModelPrices
    const model = Object.keys(require('@/price/models/imageModelPrices').imageModelPrices)[0]
    const priceList = require('@/price/models/imageModelPrices').imageModelPrices
    const price = priceList[model].costPerImage
    const result = await validateAndCalculateImageModelPrice(model, [model], price - 1, false, ctx)
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith('Insufficient balance')
  })

  it('returns price and sets session when sufficient balance', async () => {
    const models = require('@/price/models/imageModelPrices').imageModelPrices
    const model = Object.keys(models)[0]
    const price = models[model].costPerImage
    ctx.session = {}
    const result = await validateAndCalculateImageModelPrice(model, [model], price + 1, true, ctx)
    expect(result).toBe(price)
    expect(ctx.session.paymentAmount).toBe(price)
  })
})

describe('validateAndCalculateVideoModelPrice', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const availableModels = ['minimax']
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
  })

  it('returns null and prompts when model is invalid', async () => {
    const result = await validateAndCalculateVideoModelPrice('', availableModels, 10, true, ctx)
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith('Пожалуйста, выберите корректную модель')
  })

  it('returns null when balance is insufficient', async () => {
    const model: any = 'minimax'
    const price = require('@/price/helpers/calculateFinalPrice').calculateFinalPrice(model)
    const result = await validateAndCalculateVideoModelPrice(model, [model], price - 1, false, ctx)
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith('Insufficient balance')
  })

  it('returns price and sets session when sufficient balance', async () => {
    const model: any = 'minimax'
    const price = require('@/price/helpers/calculateFinalPrice').calculateFinalPrice(model)
    ctx.session = {}
    const result = await validateAndCalculateVideoModelPrice(model, [model], price + 1, true, ctx)
    expect(result).toBe(price)
    expect(ctx.session.paymentAmount).toBe(price)
  })
})