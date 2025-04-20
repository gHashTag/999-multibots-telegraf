import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { subscriptionMiddleware } from '@/middlewares/subscription'

describe('subscriptionMiddleware', () => {
  let ctx: ReturnType<typeof makeMockContext>
  let next: jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.telegram.sendChatAction = jest.fn(() => Promise.resolve()) as any
    ctx.scene.enter = jest.fn(() => Promise.resolve())
    ctx.chat = { id: 88 } as any
    next = jest.fn(() => Promise.resolve())
  })

  it('calls sendChatAction, enters scene, and calls next', async () => {
    await subscriptionMiddleware(ctx as any, next)
    expect(ctx.telegram.sendChatAction).toHaveBeenCalledWith(88, 'typing')
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionCheckScene')
    expect(next).toHaveBeenCalled()
  })

  it('throws error when next throws', async () => {
    const err = new Error('fail')
    next.mockImplementation(() => Promise.reject(err))
    await expect(subscriptionMiddleware(ctx as any, next)).rejects.toThrow(err)
  })
})