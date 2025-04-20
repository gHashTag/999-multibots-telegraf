import { describe, it, expect, jest } from '@jest/globals'
// Mock supabase functions
// const mockGetUserBalance = jest.fn() // Старое объявление
// const mockUpdateUserBalance = jest.fn() // Старое объявление
const mockGetUserBalance = jest.fn<() => Promise<number>>() // С указанием типа
const mockUpdateUserBalance = jest.fn<() => Promise<void>>() // С указанием типа
jest.mock('@/core/supabase', () => ({
  getUserBalance: mockGetUserBalance,
  updateUserBalance: mockUpdateUserBalance,
}))

import makeMockContext from '../../../__tests__/utils/mockTelegrafContext'
// import { processBalanceOperation } from '../../../../src/price/helpers/processBalanceOperation' // Старый неверный путь
// import { processBalanceOperation } from '@/price/helpers/processBalanceOperation' // Путь с Alias
import { processBalanceOperation } from '../../../src/price/helpers/processBalanceOperation' // Относительный путь

describe('processBalanceOperation', () => {
  const telegram_id = 111
  const paymentAmount = 100
  const is_ru = true

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns failure result and sends message when balance is insufficient', async () => {
    mockGetUserBalance.mockResolvedValue(50)
    const ctx = makeMockContext()
    const result = await processBalanceOperation({
      ctx,
      telegram_id,
      paymentAmount,
      is_ru,
    })
    // Should send insufficient funds message
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      telegram_id,
      'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
    )
    // Result should reflect no change
    expect(result).toEqual({
      newBalance: 50,
      success: false,
      error:
        'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.',
      modePrice: paymentAmount,
    })
  })

  it('returns success result and updates balance when funds are sufficient', async () => {
    mockGetUserBalance.mockResolvedValue(200)
    mockUpdateUserBalance.mockResolvedValue(undefined)
    const ctx = makeMockContext()
    const result = await processBalanceOperation({
      ctx,
      telegram_id,
      paymentAmount,
      is_ru: false,
    })
    // Should not send insufficient funds message
    expect(ctx.telegram.sendMessage).not.toHaveBeenCalled()
    // Should update balance to 100
    expect(mockUpdateUserBalance).toHaveBeenCalledWith(telegram_id, 100)
    expect(result).toEqual({
      newBalance: 100,
      success: true,
      modePrice: paymentAmount,
    })
  })

  it('throws error when getUserBalance rejects', async () => {
    const error = new Error('DB error')
    mockGetUserBalance.mockRejectedValue(error)
    const ctx = makeMockContext()
    await expect(
      processBalanceOperation({ ctx, telegram_id, paymentAmount, is_ru })
    ).rejects.toThrow(error)
  })
})
