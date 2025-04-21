/**
 * Unit tests for refundUser helper
 */
import makeMockContext from '../utils/mockTelegrafContext'
import { refundUser } from '@/price/helpers/refundUser'
import {
  getUserBalance,
  updateUserBalance,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import { mainMenu } from '@/menu'

// Мокаем зависимости
jest.mock('@/core/supabase', () => ({
  // @ts-ignore
  getUserBalance: jest.fn(),
  // @ts-ignore
  updateUserBalance: jest.fn(),
  // @ts-ignore
  getReferalsCountAndUserData: jest.fn(),
}))
jest.mock('@/menu', () => ({
  // @ts-ignore
  mainMenu: jest.fn(() => ({ reply_markup: { keyboard: [['ok']] } })),
}))

describe('refundUser', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
  })

  it('throws error when ctx.from is undefined', async () => {
    const badCtx: any = makeMockContext()
    delete badCtx.from
    await expect(refundUser(badCtx, 10)).rejects.toThrow('User not found')
  })

  it('refunds correctly and sends reply with keyboard', async () => {
    // Prepare mocks
    // @ts-ignore
    ctx.from.id = 7
    ctx.from.language_code = 'en'(getUserBalance as jest.Mock)
      .mockResolvedValueOnce(20)(getReferalsCountAndUserData as jest.Mock)
      .mockResolvedValueOnce({ count: 2, subscription: false, level: 1 })
    // @ts-ignore
    const reply = ctx.reply as jest.Mock
    await refundUser(ctx, 5)
    expect(getUserBalance).toHaveBeenCalledWith(7)
    expect(updateUserBalance).toHaveBeenCalledWith(7, 25)
    // Verify reply text and keyboard
    expect(reply).toHaveBeenCalledWith(
      '5.00 ⭐️ have been refunded to your account.\nYour balance: 25.00 ⭐️',
      { reply_markup: { keyboard: [['ok']] } }
    )
  })
})
