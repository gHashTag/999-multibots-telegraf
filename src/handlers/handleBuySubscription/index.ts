import { MyContext } from '../../interfaces'
import {
  SubscriptionType,
  TransactionType,
} from '../../interfaces/payments.interface'
import { getSubscriptionInfo } from '../../utils/getSubscriptionInfo'

export const handleBuySubscription = async (ctx: MyContext) => {
  const subscription = ctx.session.subscription as SubscriptionType
  const subscriptionInfo = getSubscriptionInfo(subscription)

  if (!subscriptionInfo) {
    await ctx.reply('❌ Ошибка: информация о подписке не найдена')
    return
  }

  ctx.session.selectedPayment = {
    amount: subscriptionInfo.price,
    stars: subscriptionInfo.stars,
    subscription,
    type: TransactionType.SUBSCRIPTION_PURCHASE,
  }

  await ctx.scene.enter('payment')
}
