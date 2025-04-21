import { registerPaymentActions } from '@/handlers/paymentActions'
import * as paymentHandlers from '@/handlers/paymentHandlers'

describe('registerPaymentActions', () => {
  const bot: any = { action: jest.fn(), on: jest.fn() }
  beforeEach(() => jest.clearAllMocks())

  it('registers payment handlers correctly', () => {
    registerPaymentActions(bot)
    expect(bot.action).toHaveBeenCalledWith(
      'payment_policy_info',
      paymentHandlers.handlePaymentPolicyInfo
    )
  })
  it('registers pre_checkout_query handler', () => {
    expect(bot.on).toHaveBeenCalledWith(
      'pre_checkout_query',
      paymentHandlers.handlePreCheckoutQuery
    )
    expect(bot.on).toHaveBeenCalledWith(
      'successful_payment',
      paymentHandlers.handleSuccessfulPayment
    )
  })
})
