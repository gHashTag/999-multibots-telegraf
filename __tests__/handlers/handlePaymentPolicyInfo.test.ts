import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { handlePaymentPolicyInfo } from '@/handlers/paymentHandlers/handlePaymentPolicyInfo'

describe('handlePaymentPolicyInfo', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.answerCbQuery = jest.fn(() => Promise.resolve()) as any
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.from = { language_code: 'ru', id: 1 } as any
  })

  it('answers callback query and replies with policy in Russian', async () => {
    await handlePaymentPolicyInfo(ctx as any)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('💳 Оплата производится')
    )
  })

  it('replies with policy in English when language_code is not ru', async () => {
    ctx.from.language_code = 'en'
    await handlePaymentPolicyInfo(ctx as any)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('💳 Payment is processed')
    )
  })
})