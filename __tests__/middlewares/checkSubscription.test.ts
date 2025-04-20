import { checkSubscription } from '@/middlewares/checkSubscription'

describe('checkSubscription', () => {
  let ctx: any
  const channel = 'mychannel'
  beforeEach(() => {
    ctx = {
      from: { id: 123 },
      telegram: { getChatMember: jest.fn() },
    }
    jest.clearAllMocks()
  })

  it('returns true for member statuses', async () => {
    ;(ctx.telegram.getChatMember as jest.Mock).mockResolvedValue({ status: 'member' })
    await expect(checkSubscription(ctx, channel)).resolves.toBe(true)
    expect(ctx.telegram.getChatMember).toHaveBeenCalledWith('@mychannel', 123)
  })

  it('returns false for non-member statuses', async () => {
    ;(ctx.telegram.getChatMember as jest.Mock).mockResolvedValue({ status: 'left' })
    await expect(checkSubscription(ctx, channel)).resolves.toBe(false)
  })

  it('throws error when from.id undefined', async () => {
    ctx.from = {}
    await expect(checkSubscription(ctx, channel)).rejects.toThrow('User ID is undefined')
  })

  it('propagates error from getChatMember', async () => {
    const err = new Error('fail')
    ;(ctx.telegram.getChatMember as jest.Mock).mockRejectedValue(err)
    await expect(checkSubscription(ctx, channel)).rejects.toThrow(err)
  })
})