import { MyContext } from '@/interfaces'
import { getSubscriptionInfo } from '@/utils/getSubscriptionInfo'
import { getUserBalance } from '@/core/supabase'
import { isRussian } from '@/helpers'
import { logger } from '@/utils/logger'
import { TransactionType } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'

export async function handleBuySubscription(
  ctx: MyContext,
  subscriptionType: SubscriptionType
) {
  const isRu = isRussian(ctx)

  try {
    logger.info('🚀 Starting subscription purchase flow:', {
      telegram_id: ctx.from?.id,
      subscription_type: subscriptionType,
      scene: ctx.scene?.current?.id,
    })

    const subscriptionInfo = getSubscriptionInfo(subscriptionType)
    if (!subscriptionInfo) {
      logger.error('❌ Invalid subscription type:', {
        subscription_type: subscriptionType,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: неверный тип подписки'
          : '❌ Error: invalid subscription type'
      )
      return
    }

    const telegramId = ctx.from?.id?.toString()
    if (!telegramId) {
      logger.error('❌ Could not get telegram ID from context')
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить ID пользователя'
          : '❌ Error: could not get user ID'
      )
      return
    }

    const balance = await getUserBalance(telegramId)
    const price = isRu ? subscriptionInfo.price_ru : subscriptionInfo.price_en
    const stars = subscriptionInfo.stars
    const title = isRu ? subscriptionInfo.title_ru : subscriptionInfo.title_en

    logger.info('💰 User balance check:', {
      telegram_id: telegramId,
      balance,
      required_stars: stars,
      has_enough: balance >= stars,
    })

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
      subscription: subscriptionType,
      type: TransactionType.SUBSCRIPTION_PURCHASE,
    }

    // Сохраняем тип подписки в сессии
    ctx.session.subscription = subscriptionType

    logger.info('💫 Proceeding to payment scene:', {
      telegram_id: telegramId,
      subscription_type: subscriptionType,
      amount: price,
      stars,
      current_scene: ctx.scene?.current?.id,
    })

    try {
      await ctx.scene.enter('paymentScene')
      logger.info('✅ Successfully entered payment scene', {
        telegram_id: telegramId,
        new_scene: 'paymentScene',
      })
    } catch (sceneError) {
      logger.error('❌ Error entering payment scene:', {
        error:
          sceneError instanceof Error ? sceneError.message : 'Unknown error',
        telegram_id: telegramId,
        stack: sceneError instanceof Error ? sceneError.stack : undefined,
      })
      throw sceneError
    }
  } catch (error) {
    logger.error('❌ Error in handleBuySubscription:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id: ctx.from?.id,
      subscription_type: subscriptionType,
    })

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при обработке подписки. Попробуйте позже или обратитесь в поддержку.'
        : '❌ Error processing subscription. Please try again later or contact support.'
    )
  }
}
