import { MyContext, SubscriptionType } from '@/interfaces'
import { logger } from '@/utils/logger'
import { levels } from '@/menu/mainMenu'

interface BuyParams {
  ctx: MyContext
  isRu: boolean
}

export async function handleBuySubscription({ ctx, isRu }: BuyParams) {
  logger.info('[handleBuySubscription] Starting...', {
    telegram_id: ctx.from?.id,
  })
  try {
    const selectedPayment = ctx.session.selectedPayment
    const isAdminTest = ctx.session.isAdminTest ?? false

    if (
      !selectedPayment ||
      !selectedPayment.subscription ||
      selectedPayment.stars === undefined
    ) {
      logger.error('[handleBuySubscription] Missing required session data', {
        telegram_id: ctx.from?.id,
        selectedPayment: selectedPayment,
        isAdminTest: isAdminTest,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: Недостаточно данных для покупки подписки. Попробуйте начать заново.'
          : '❌ Error: Insufficient data to purchase subscription. Please try again.'
      )
      return ctx.scene.leave()
    }

    const subscriptionType = selectedPayment.subscription
    const amountInStars = Number(selectedPayment.stars)

    logger.info('[handleBuySubscription] Preparing invoice', {
      telegram_id: ctx.from?.id,
      subscriptionType,
      amountInStars,
      isAdminTest,
    })

    if (isNaN(amountInStars) || amountInStars <= 0) {
      logger.error('[handleBuySubscription] Invalid star amount', {
        telegram_id: ctx.from?.id,
        amountInStars: selectedPayment.stars,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: Некорректное количество звезд для оплаты.'
          : '❌ Error: Invalid star amount for payment.'
      )
      return ctx.scene.leave()
    }

    let title = `${subscriptionType}`
    let description = isRu
      ? `Покупка подписки ${subscriptionType}`
      : `Purchasing subscription ${subscriptionType}`

    if (isAdminTest) {
      title = isRu ? '🧪 Тестовая Подписка' : '🧪 Test Subscription'
      description = isRu
        ? 'Тестовая оплата за 1 звезду'
        : 'Test payment for 1 star'
    }

    const payload = `${subscriptionType}_${amountInStars}_${Date.now()}`

    logger.info('[handleBuySubscription] Sending invoice', {
      telegram_id: ctx.from?.id,
      title,
      description,
      payload,
      amountInStars,
    })

    await ctx.replyWithInvoice({
      title,
      description,
      payload: payload,
      currency: 'XTR',
      prices: [
        {
          label: isRu ? 'Цена в звездах' : 'Price in Stars',
          amount: amountInStars,
        },
      ],
      provider_token: '',
    })

    logger.info('[handleBuySubscription] Invoice sent successfully', {
      telegram_id: ctx.from?.id,
    })
    await ctx.scene.leave()
  } catch (error) {
    logger.error('[handleBuySubscription] Error creating invoice', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id: ctx.from?.id,
    })
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при создании счета. Пожалуйста, попробуйте позже.'
        : '❌ An error occurred while creating the invoice. Please try again later.'
    )
    return ctx.scene.leave()
  }
}
