import { handlePaymentPolicyInfo } from './paymentHandlers/handlePaymentPolicyInfo'
import { handlePreCheckoutQuery } from './paymentHandlers/handlePreCheckoutQuery'
import { handleSuccessfulPayment } from './paymentHandlers'
import { MyContext } from '@/interfaces'
import { Telegraf } from 'telegraf'

import { handleTopUp } from './paymentHandlers/handleTopUp'

export function registerPaymentActions(bot: Telegraf<MyContext>) {
  bot.action('payment_policy_info', handlePaymentPolicyInfo)
  bot.action(/top_up_\d+/, handleTopUp)
  bot.on('pre_checkout_query', handlePreCheckoutQuery)
  bot.on('successful_payment', handleSuccessfulPayment)
}
