import { MyContext } from '@/interfaces'
import { getSubscriptionInfo } from '@/utils/getSubscriptionInfo'
import { getUserBalance } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { logger } from '@/utils/logger'
import { TransactionType } from '@/interfaces/payments.interface'

export async function handleBuySubscription(ctx: MyContext) {
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription
  if (!subscription) {
    await ctx.reply(
      isRu
        ? '❌ Ошибка: тип подписки не выбран'
        : '❌ Error: subscription type not selected'
    )
    return
  }

  const subscriptionInfo = getSubscriptionInfo(subscription)
  if (!subscriptionInfo) {
    await ctx.reply(
      isRu
        ? '❌ Ошибка: неверный тип подписки'
        : '❌ Error: invalid subscription type'
    )
    return
  }

  const telegramId = ctx.from?.id.toString()
  if (!telegramId) {
    await ctx.reply(
      isRu
        ? '❌ Ошибка: не удалось получить ID пользователя'
        : '❌ Error: could not get user ID'
    )
    return
  }

  try {
    const balance = await getUserBalance(telegramId)
    const price = isRu ? subscriptionInfo.price_ru : subscriptionInfo.price_en
    const stars = subscriptionInfo.stars
    const title = isRu ? subscriptionInfo.title_ru : subscriptionInfo.title_en

    if (balance < stars) {
      await ctx.reply(
        isRu
          ? `❌ Недостаточно звезд для покупки подписки ${title}. Необходимо: ${stars}⭐️, у вас: ${balance}⭐️`
          : `❌ Not enough stars to buy ${title} subscription. Required: ${stars}⭐️, you have: ${balance}⭐️`
      )
      return
    }

    // Store the subscription details in the session
    ctx.session.selectedPayment = {
      amount: price,
      stars,
      subscription,
      type: TransactionType.SUBSCRIPTION_PURCHASE,
    }

    await ctx.reply(
      isRu
        ? `💫 Вы выбрали подписку ${title}\nСтоимость: ${price} руб.\nВы получите: ${stars}⭐️`
        : `💫 You selected ${title} subscription\nPrice: ${price} RUB\nYou will receive: ${stars}⭐️`
    )
  } catch (error) {
    logger.error('Error in handleBuySubscription:', error)
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при обработке подписки'
        : '❌ An error occurred while processing the subscription'
    )
  }
}
