import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { handlePreCheckoutQuery } from '@/handlers/handleSuccessfulPayment'

describe('handlePreCheckoutQuery', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    ctx = makeMockContext()
    ctx.answerPreCheckoutQuery = jest.fn(() => Promise.resolve()) as any
  })

  it('calls answerPreCheckoutQuery with true', async () => {
    await handlePreCheckoutQuery(ctx as any)
    expect(ctx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
  })

  it('propagates errors from answerPreCheckoutQuery', async () => {
    const err = new Error('fail')
    ctx.answerPreCheckoutQuery = jest.fn(() => Promise.reject(err)) as any
    await expect(handlePreCheckoutQuery(ctx as any)).rejects.toThrow(err)
  })
})