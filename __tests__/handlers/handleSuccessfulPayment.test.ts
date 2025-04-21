import { handleSuccessfulPayment } from '@/handlers/paymentHandlers'
import { incrementBalance } from '@/core/supabase/incrementBalance'
import { setPayments } from '@/core/supabase/setPayments'
import { isRussian } from '@/helpers/language'

jest.mock('@/core/supabase/incrementBalance', () => ({
  incrementBalance: jest.fn(),
}))
jest.mock('@/core/supabase/setPayments', () => ({ setPayments: jest.fn() }))
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))

describe('handleSuccessfulPayment (paymentHandlers)', () => {
  let ctx: any
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = {
      chat: { id: 1 },
      from: { id: 42, language_code: 'ru', username: 'user42' },
      update: {
        message: {
          successful_payment: {
            total_amount: 100,
            invoice_payload: 'payload1',
          },
        },
      },
      session: {},
      reply: jest.fn(),
      botInfo: { username: 'bot' },
    }
    isRussian.mockReturnValue(true)
  })

  it('does nothing when no chat or user id', async () => {
    delete ctx.chat
    await handleSuccessfulPayment(ctx)
    expect(incrementBalance).not.toHaveBeenCalled()
    ctx.chat = { id: 1 }
    delete ctx.from.id
    await handleSuccessfulPayment(ctx)
    expect(incrementBalance).not.toHaveBeenCalled()
  })

  it('does nothing when no successful_payment data', async () => {
    ctx.update = { message: {} }
    await handleSuccessfulPayment(ctx)
    expect(incrementBalance).not.toHaveBeenCalled()
  })

  it('processes fallback top-up for unknown subscription', async () => {
    ctx.session.subscription = undefined
    await handleSuccessfulPayment(ctx)
    expect(incrementBalance).toHaveBeenCalledWith({
      telegram_id: '42',
      amount: 100,
    })
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Ваш баланс пополнен на 100')
    )
    expect(setPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        OutSum: '100',
        stars: 100,
        subscription: 'stars',
      })
    )
  })

  it('processes known subscription path', async () => {
    ctx.session.subscription = 'neurophoto'
    await handleSuccessfulPayment(ctx)
    expect(incrementBalance).toHaveBeenCalled()
    expect(setPayments).toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalledWith(
      expect.stringContaining('Ваш баланс пополнен')
    )
  })
})
