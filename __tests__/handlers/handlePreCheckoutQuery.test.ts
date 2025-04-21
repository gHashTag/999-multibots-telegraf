import { handlePreCheckoutQuery } from '@/handlers/paymentHandlers/handlePreCheckoutQuery'

describe('handlePreCheckoutQuery', () => {
  it('calls answerPreCheckoutQuery with true', async () => {
    const ctx: any = { answerPreCheckoutQuery: jest.fn().mockResolvedValue(undefined) }
    await handlePreCheckoutQuery(ctx)
    expect(ctx.answerPreCheckoutQuery).toHaveBeenCalledWith(true)
  })
})