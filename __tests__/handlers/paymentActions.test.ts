import { registerPaymentActions } from '@/handlers/paymentActions'
import * as paymentHandlers from '@/handlers/paymentHandlers'

describe('registerPaymentActions', () => {
  const bot: any = { action: jest.fn(), on: jest.fn() }
  beforeEach(() => {
    jest.clearAllMocks()
    registerPaymentActions(bot)
  })

  it('registers payment_policy_info action', () => {
    expect(bot.action).toHaveBeenCalledWith(
      'payment_policy_info',
      paymentHandlers.handlePaymentPolicyInfo
    )
  })
  it('registers top_up_\d+ action regex', () => {
    expect(bot.action).toHaveBeenCalledWith(
      expect.any(RegExp),
      paymentHandlers.handleTopUp
    )
  })
  it('registers pre_checkout_query handler', () => {
    expect(bot.on).toHaveBeenCalledWith(
      'pre_checkout_query',
      paymentHandlers.handlePreCheckoutQuery
    )
  })
  it('registers successful_payment handler', () => {
    expect(bot.on).toHaveBeenCalledWith(
      'successful_payment',
      paymentHandlers.handleSuccessfulPayment
    )
  })
})