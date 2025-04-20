import { describe, it, expect, beforeEach } from '@jest/globals'
import { validateAndCalculateImageModelPrice } from '@/price/helpers'

// Mock imageModelPrices to control modelInfo lookup
jest.mock('@/price/models/imageModelPrices', () => ({
  imageModelPrices: {
    modelA: { costPerImage: 10 },
  },
}))

describe('validateAndCalculateImageModelPrice', () => {
  let ctx: any
  const availableModels = ['modelA']

  beforeEach(() => {
    ctx = { reply: jest.fn(), session: {} }
    jest.clearAllMocks()
  })

  it('returns null and prompts when imageModel is empty or invalid', async () => {
    const result1 = await validateAndCalculateImageModelPrice('', availableModels, 100, true, ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Пожалуйста, выберите корректную модель')
    expect(result1).toBeNull()

    const result2 = await validateAndCalculateImageModelPrice('other', availableModels, 100, false, ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Please choose a valid model')
    expect(result2).toBeNull()
  })

  it('returns null and prompts when modelInfo not found', async () => {
    const result = await validateAndCalculateImageModelPrice('modelB', ['modelB'], 100, true, ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Ошибка: неверная модель изображения.')
    expect(result).toBeNull()
  })

  it('returns null and prompts when currentBalance is insufficient', async () => {
    const result = await validateAndCalculateImageModelPrice('modelA', availableModels, 5, false, ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Insufficient balance')
    expect(result).toBeNull()
  })

  it('returns price when model is valid and balance is sufficient', async () => {
    const result = await validateAndCalculateImageModelPrice('modelA', availableModels, 20, true, ctx)
    expect(ctx.session.paymentAmount).toBe(10)
    expect(result).toBe(10)
  })
})