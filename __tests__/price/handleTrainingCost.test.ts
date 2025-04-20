/**
 * Unit tests for handleTrainingCost helper
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { handleTrainingCost } from '@/price/helpers/handleTrainingCost'

// Мокаем зависимости
jest.mock('@/price/helpers/calculateTrainingCost', () => ({
  // @ts-ignore
  calculateCostInStars: jest.fn((steps, rates) => steps * rates.costPerStepInStars)
}))
jest.mock('@/core/supabase', () => ({
  // @ts-ignore
  getUserBalance: jest.fn()
}))
import { calculateCostInStars } from '@/price/helpers/calculateTrainingCost'
import { getUserBalance } from '@/core/supabase'

describe('handleTrainingCost', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const steps = 4
  const isRu = true
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext({})
    // @ts-ignore
    ctx.from.id = 123
  })

  it('should prompt and set leaveScene=true when balance is insufficient (RU)', async () => {
    // @ts-ignore
    (calculateCostInStars as jest.Mock).mockReturnValueOnce(steps * 0.25);
    (getUserBalance as jest.Mock).mockResolvedValueOnce(steps * 0.25 - 1);

    const result = await handleTrainingCost(ctx, steps, isRu)
    expect(calculateCostInStars).toHaveBeenCalledWith(steps, expect.any(Object))
    expect(getUserBalance).toHaveBeenCalledWith(123)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('❌ Недостаточно звезд для обучения модели!'),
      expect.any(Object)
    )
    expect(result.leaveScene).toBe(true)
    expect(result.trainingCostInStars).toBe(steps * 0.25)
    expect(result.currentBalance).toBe(steps * 0.25 - 1)
  })

  it('should return leaveScene=false when balance is sufficient', async () => {
    // @ts-ignore
    (calculateCostInStars as jest.Mock).mockReturnValueOnce(steps * 0.25);
    (getUserBalance as jest.Mock).mockResolvedValueOnce(steps * 0.25 + 10);

    const result = await handleTrainingCost(ctx, steps, false)
    expect(result.leaveScene).toBe(false)
    expect(result.trainingCostInStars).toBe(steps * 0.25)
    expect(result.currentBalance).toBe(steps * 0.25 + 10)
    expect(ctx.reply).not.toHaveBeenCalled()
  })
})