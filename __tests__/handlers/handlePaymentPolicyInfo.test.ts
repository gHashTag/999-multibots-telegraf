import makeMockContext from '../utils/mockTelegrafContext'
import { handlePaymentPolicyInfo } from '@/handlers/paymentHandlers/handlePaymentPolicyInfo'

describe('handlePaymentPolicyInfo', () => {
  beforeEach(() => {
    ctx = {
      from: { language_code: 'ru' },
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    }
    jest.clearAllMocks()
  })

  it('answers callback query and replies with policy in Russian', async () => {
    const ctx = makeMockContext({
      callback_query: {
        from: {
          id: 1,
          language_code: 'ru',
          is_bot: false,
          first_name: 'TestRu',
        },
      },
    } as any)
    ctx.answerCbQuery = jest.fn(() => Promise.resolve(true))
    ctx.reply = jest.fn(() => Promise.resolve({} as any))

    await handlePaymentPolicyInfo(ctx as any)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('💳 Оплата производится')
    )
  })

  it('replies with policy in English when language_code is not ru', async () => {
    const ctx = makeMockContext({
      callback_query: {
        from: {
          id: 2,
          language_code: 'en',
          is_bot: false,
          first_name: 'TestEn',
        },
      },
    } as any)
    ctx.answerCbQuery = jest.fn(() => Promise.resolve(true))
    ctx.reply = jest.fn(() => Promise.resolve({} as any))

    await handlePaymentPolicyInfo(ctx as any)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('💳 Payment is processed')
    )
  })

  it('replies with policy in English when language_code is not ru', async () => {
    const ctx = makeMockContext({
      callback_query: {
        from: {
          id: 2,
          language_code: 'en',
          is_bot: false,
          first_name: 'TestEn',
        },
      },
    } as any)
    ctx.answerCbQuery = jest.fn(() => Promise.resolve(true))
    ctx.reply = jest.fn(() => Promise.resolve({} as any))

    await handlePaymentPolicyInfo(ctx as any)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('💳 Payment is processed')
    )
>>>>>>> origin/new-test-1
  })
})
