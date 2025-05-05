import { handlePaymentPolicyInfo } from './paymentHandlers/handlePaymentPolicyInfo'
import {
  handlePreCheckoutQuery,
  handleSuccessfulPayment,
} from './paymentHandlers'
import { MyContext } from '@/interfaces'
import { Telegraf } from 'telegraf'

import { handleTopUp } from './paymentHandlers/handleTopUp'

export function registerPaymentActions(bot: Telegraf<MyContext>) {
  bot.action('payment_policy_info', handlePaymentPolicyInfo)
  bot.action(/top_up_\d+/, handleTopUp)
  bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
  bot.on('successful_payment', handleSuccessfulPayment as any)
}
