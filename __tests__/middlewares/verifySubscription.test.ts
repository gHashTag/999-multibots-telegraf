import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/middlewares/checkSubscription', () => ({
  checkSubscription: jest.fn(),
}))
jest.mock('@/middlewares/handleSubscriptionMessage', () => ({
  handleSubscriptionMessage: jest.fn(),
}))
import { verifySubscription } from '@/middlewares/verifySubscription'
import { checkSubscription } from '@/middlewares/checkSubscription'
import { handleSubscriptionMessage } from '@/middlewares/handleSubscriptionMessage'

describe('verifySubscription', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
  })

  it('returns true and does not call handleSubscriptionMessage when subscribed', async () => {
    ;(checkSubscription as jest.Mock).mockResolvedValue(true)
    const result = await verifySubscription(ctx as any, 'ru', 'chan')
    expect(result).toBe(true)
    expect(handleSubscriptionMessage).not.toHaveBeenCalled()
  })

  it('calls handleSubscriptionMessage and returns false when not subscribed', async () => {
    ;(checkSubscription as jest.Mock).mockResolvedValue(false)
    const result = await verifySubscription(ctx as any, 'en', 'chan')
    expect(handleSubscriptionMessage).toHaveBeenCalledWith(ctx, 'en', 'chan')
    expect(result).toBe(false)
  })

  it('propagates error from checkSubscription', async () => {
    const err = new Error('fail')
    ;(checkSubscription as jest.Mock).mockRejectedValue(err)
    await expect(verifySubscription(ctx as any, 'ru', 'chan')).rejects.toThrow(
      err
    )
  })
})
