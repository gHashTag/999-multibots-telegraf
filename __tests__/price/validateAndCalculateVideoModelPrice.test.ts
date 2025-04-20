import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Mock videoModelPrices to control available models
jest.mock('@/price/models/videoModelPrices', () => ({
  videoModelPrices: { modelA: {} },
}))
// Mock calculateFinalPrice to return fixed price
jest.mock('@/price/helpers', () => ({
  calculateFinalPrice: jest.fn().mockReturnValue(10),
}))

import { validateAndCalculateVideoModelPrice } from '@/price/helpers/validateAndCalculateVideoModelPrice'
import { calculateFinalPrice } from '@/price/helpers'

describe('validateAndCalculateVideoModelPrice', () => {
  let ctx: any
  const availableModels = ['modelA']

  beforeEach(() => {
    ctx = { reply: jest.fn(), session: {} }
    jest.clearAllMocks()
  })

  it('returns null and prompts when videoModel is empty or invalid', async () => {
    const result1 = await validateAndCalculateVideoModelPrice('', availableModels, 100, true, ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Пожалуйста, выберите корректную модель')
    expect(result1).toBeNull()

    const result2 = await validateAndCalculateVideoModelPrice('other', availableModels, 100, false, ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Please choose a valid model')
    expect(result2).toBeNull()
  })

  it('returns null and prompts when model not in videoModelPrices', async () => {
    const result = await validateAndCalculateVideoModelPrice('modelB', ['modelB'], 100, false, ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Error: invalid video model.')
    expect(result).toBeNull()
  })

  it('returns null and prompts when currentBalance is insufficient', async () => {
    const result = await validateAndCalculateVideoModelPrice('modelA', availableModels, 5, false, ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Insufficient balance')
    expect(result).toBeNull()
  })

  it('returns price when model valid and balance sufficient', async () => {
    const result = await validateAndCalculateVideoModelPrice('modelA', availableModels, 20, true, ctx)
    expect(calculateFinalPrice).toHaveBeenCalledWith('modelA')
    expect(ctx.session.paymentAmount).toBe(10)
    expect(result).toBe(10)
  })
})