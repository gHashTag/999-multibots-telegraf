import { jest, describe, it, expect } from '@jest/globals'
import { registerPaymentActions } from '@/handlers/paymentActions'
import { handlePaymentPolicyInfo } from '@/handlers/paymentHandlers/handlePaymentPolicyInfo'
import { handleTopUp } from '@/handlers/paymentHandlers/handleTopUp'
import { handlePreCheckoutQuery } from '@/handlers/paymentHandlers/handlePreCheckoutQuery'
import { handleSuccessfulPayment } from '@/handlers/paymentHandlers'

describe('registerPaymentActions', () => {
  const bot: any = { action: jest.fn(), on: jest.fn() }

  it('registers payment policy info action', () => {
    registerPaymentActions(bot)
    expect(bot.action).toHaveBeenCalledWith(
      'payment_policy_info',
      handlePaymentPolicyInfo
    )
  })

  it('registers top_up regex action', () => {
    registerPaymentActions(bot)
    expect(bot.action).toHaveBeenCalledWith(/top_up_\d+/, handleTopUp)
  })

  it('registers pre_checkout_query and successful_payment handlers', () => {
    registerPaymentActions(bot)
    expect(bot.on).toHaveBeenCalledWith(
      'pre_checkout_query',
      handlePreCheckoutQuery
    )
    expect(bot.on).toHaveBeenCalledWith(
      'successful_payment',
      handleSuccessfulPayment
    )
  })
})