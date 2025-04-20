import { describe, it, expect, jest } from '@jest/globals'
import { handlePreCheckoutQuery } from '@/handlers/paymentHandlers/handlePreCheckoutQuery'

describe('handlePreCheckoutQuery', () => {
  it('calls answerPreCheckoutQuery with true', async () => {
    const ctx: any = { answerPreCheckoutQuery: jest.fn().mockResolvedValue(undefined) }
    await expect(handlePreCheckoutQuery(ctx)).resolves.toBeUndefined()
    expect(ctx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
  })

  it('propagates error when answerPreCheckoutQuery rejects', async () => {
    const error = new Error('fail')
    const ctx: any = { answerPreCheckoutQuery: jest.fn().mockRejectedValue(error) }
    await expect(handlePreCheckoutQuery(ctx)).rejects.toBe(error)
    expect(ctx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
  })
})