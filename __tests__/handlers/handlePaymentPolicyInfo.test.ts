import { handlePaymentPolicyInfo } from '@/handlers/paymentHandlers/handlePaymentPolicyInfo'

describe('handlePaymentPolicyInfo', () => {
  let ctx: any
  beforeEach(() => {
    ctx = {
      from: { language_code: 'ru' },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    }
    jest.clearAllMocks()
  })

  it('calls answerCbQuery and sends Russian policy text', async () => {
    ctx.from.language_code = 'ru'
    await handlePaymentPolicyInfo(ctx)
    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Оплата производится через систему Robokassa'))
  })

  it('calls answerCbQuery and sends English policy text', async () => {
    ctx.from.language_code = 'en'
    await handlePaymentPolicyInfo(ctx)
    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1)
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Payment is processed through the Robokassa system'))
  })
})