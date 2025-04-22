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
import { SubscriptionType, UserType, MyContext } from '@/interfaces'

// Мокаем зависимости
jest.mock('@/core/supabase', () => ({
  // @ts-ignore
  getUserBalance: jest.fn(),
  // @ts-ignore
  updateUserBalance: jest.fn((userId: number, newBalance: number) =>
    Promise.resolve()
  ),
  // @ts-ignore
  getReferalsCountAndUserData: jest.fn(),
}))

describe('refundUser', () => {
  let mockCtx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    mockCtx = makeMockContext({
      message: { from: { id: 7, is_bot: false, first_name: 'Test' } },
    }) as MyContext
  })

  it('throws error when ctx.from is undefined', async () => {
    const badCtx = makeMockContext({ message: {} }) as MyContext
    await expect(refundUser(badCtx, 0, 10, 'testBot')).rejects.toThrow(
      'User not found for refund operation.'
    )
  })

  it('should return error if user not found', async () => {
    jest.mocked(getReferalsCountAndUserData).mockResolvedValue(null as any)

    const result = await refundUser(mockCtx, 7, 5, 'testBot')
    expect(result.success).toBe(false)
    expect(result.error).toBe('User not found for refund operation.')
  })

  it('should refund user successfully', async () => {
    jest.mocked(getReferalsCountAndUserData).mockResolvedValue({
      count: 0,
      level: 1,
      subscriptionType: SubscriptionType.STARS,
      userData: {
        user_id: 'mock-user-id',
        telegram_id: '7',
        id: 1,
        created_at: new Date().toISOString(),
      } as unknown as UserType,
      isExist: true,
    })
    jest.mocked(getUserBalance).mockResolvedValue(10)
    jest.mocked(updateUserBalance).mockResolvedValue(25)

    const result = await refundUser(mockCtx, 7, 15, 'testBot')

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })
})
