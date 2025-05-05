import { isRussian } from '@/helpers'
import { setPayments } from '@/core/supabase/setPayments'

import { logger } from '@/utils/logger'

import { MyContext } from '@/interfaces'
import {
  Currency,
  PaymentStatus,
  PaymentType,
} from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { notifyBotOwners } from '@/core/supabase/notifyBotOwners'
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { ModeEnum } from '@/interfaces/modes'

async function sendNotification(ctx: MyContext, message: string) {
  const adminChatId = process.env.ADMIN_CHAT_ID
  if (adminChatId) {
    try {
      await ctx.telegram.sendMessage(adminChatId, message)
    } catch (error) {
      logger.error('❌ Error sending notification to admin', {
        error: error instanceof Error ? error.message : String(error),
        adminChatId,
      })
    }
    console.log('🔔 Notification sent to admin')
  } else {
    logger.warn('⚠️ ADMIN_CHAT_ID not set. Notification not sent.')
  }
}

export async function handleSuccessfulPayment(ctx: MyContext) {
  logger.info('[handleSuccessfulPayment] Starting...', {
    telegram_id: ctx.from?.id,
  })
  if (!ctx.message || !('successful_payment' in ctx.message)) {
    logger.warn(
      '[handleSuccessfulPayment] Received update without message or successful_payment'
    )
    return
  }
  const successfulPayment = ctx.message.successful_payment

  if (!ctx.chat || !ctx.from?.id) {
    logger.error('[handleSuccessfulPayment] Missing chat or user ID in context')
    return
  }

  const isRu = isRussian(ctx)
  const telegramPaymentChargeId = successfulPayment.telegram_payment_charge_id
  const providerPaymentChargeId = successfulPayment.provider_payment_charge_id
  const payload = successfulPayment.invoice_payload
  const currency = successfulPayment.currency

  const userId = ctx.from.id
  const username = ctx.from?.username ?? 'unknown'
  const normalizedUserId = normalizeTelegramId(userId)
  const botUsername = ctx.botInfo?.username ?? 'unknown_bot'

  if (currency !== 'XTR') {
    logger.error('[handleSuccessfulPayment] Incorrect currency', {
      currency,
      telegram_id: normalizedUserId,
      payload,
    })
    await ctx.reply(
      isRu
        ? 'Произошла ошибка с валютой платежа. Обратитесь в поддержку.'
        : 'Payment currency error. Please contact support.'
    )
    return ctx.scene.leave()
  }

  let subscriptionType: SubscriptionType | null = null
  let starsFromPayload: number | null = null
  let purchasedPlanText: string | null = null

  try {
    if (payload) {
      const parts = payload.split('_')
      if (parts.length >= 2) {
        const typeFromPayload = parts[0].toUpperCase() as SubscriptionType
        const starsStr = parts[1]

        const planExists = paymentOptionsPlans.some(
          plan => plan.subscription?.toUpperCase() === typeFromPayload
        )

        if (planExists) {
          subscriptionType = typeFromPayload
          starsFromPayload = parseInt(starsStr, 10)
          const planDetails = paymentOptionsPlans.find(
            p => p.subscription?.toUpperCase() === subscriptionType
          )
          purchasedPlanText =
            planDetails?.subscription?.toString() ?? subscriptionType
          logger.info(
            '[handleSuccessfulPayment] Parsed subscription from payload',
            {
              telegram_id: normalizedUserId,
              subscriptionType,
              starsFromPayload,
            }
          )
        } else {
          logger.warn(
            '[handleSuccessfulPayment] Subscription type from payload not found in plans',
            {
              telegram_id: normalizedUserId,
              typeFromPayload,
            }
          )
        }
      }
    }

    if (
      !subscriptionType ||
      isNaN(starsFromPayload!) ||
      starsFromPayload! <= 0
    ) {
      starsFromPayload = successfulPayment.total_amount
      subscriptionType = null
      purchasedPlanText = null
      logger.info('[handleSuccessfulPayment] Processing as stars top-up', {
        telegram_id: normalizedUserId,
        stars: starsFromPayload,
      })
    } else {
      logger.info(
        '[handleSuccessfulPayment] Processing as subscription purchase',
        {
          telegram_id: normalizedUserId,
          subscription: subscriptionType,
          stars: starsFromPayload,
        }
      )
    }

    if (isNaN(starsFromPayload) || starsFromPayload <= 0) {
      logger.error('[handleSuccessfulPayment] Invalid final star amount', {
        telegram_id: normalizedUserId,
        starsFromPayload,
        total_amount: successfulPayment.total_amount,
      })
      throw new Error('Invalid star amount after processing')
    }

    await setPayments({
      telegram_id: normalizedUserId,
      OutSum: starsFromPayload.toString(),
      InvId: payload || null,
      currency: Currency.XTR,
      stars: starsFromPayload,
      status: PaymentStatus.COMPLETED,
      payment_method: 'Telegram',
      subscription_type: subscriptionType,
      bot_name: botUsername,
      language: ctx.from?.language_code ?? 'en',
      type: PaymentType.MONEY_INCOME,
      metadata: {
        telegram_payment_charge_id: telegramPaymentChargeId,
        provider_payment_charge_id: providerPaymentChargeId,
        invoice_payload: payload,
        username: username,
        purchased_plan_text: purchasedPlanText,
      },
    })

    // !!! DETAILED LOGGING BEFORE DECISION !!!
    logger.info('[handleSuccessfulPayment] Values before final decision:', {
      telegram_id: normalizedUserId,
      determined_subscriptionType: subscriptionType,
      determined_purchasedPlanText: purchasedPlanText,
      determined_starsFromPayload: starsFromPayload,
      payload_used_for_parsing: payload,
    })
    // !!! END DETAILED LOGGING !!!

    if (subscriptionType && purchasedPlanText) {
      await ctx.reply(
        isRu
          ? `🎉 Вы успешно приобрели подписку "${purchasedPlanText}"! ${starsFromPayload}⭐ зачислено.`
          : `🎉 You have successfully purchased the "${purchasedPlanText}" subscription! ${starsFromPayload}⭐ added.`
      )
    } else {
      await ctx.reply(
        isRu
          ? `💫 Ваш баланс пополнен на ${starsFromPayload}⭐ звезд!`
          : `💫 Your balance has been replenished by ${starsFromPayload}⭐ stars!`
      )
    }

    const notificationMessage = subscriptionType
      ? `💳 Пользователь @${username} (ID: ${userId}) купил подписку "${purchasedPlanText}" за ${starsFromPayload}⭐ через Telegram Stars.`
      : `💰 Пользователь @${username} (ID: ${userId}) пополнил баланс на ${starsFromPayload}⭐ через Telegram Stars.`
    await sendNotification(ctx, notificationMessage)
    await notifyBotOwners(botUsername, {
      username,
      telegram_id: userId.toString(),
      amount: starsFromPayload,
      stars: starsFromPayload,
      subscription: purchasedPlanText,
    })

    logger.info(
      '[handleSuccessfulPayment] Entering main menu scene after successful payment...',
      { telegram_id: normalizedUserId }
    )
    await ctx.scene.enter(ModeEnum.MainMenu)
  } catch (error) {
    logger.error('❌ [handleSuccessfulPayment] Error processing payment:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id: normalizedUserId,
      payload,
    })
    await ctx.reply(
      isRu
        ? '😿 Произошла ошибка при обработке вашего платежа. Пожалуйста, обратитесь в поддержку.'
        : '😿 An error occurred while processing your payment. Please contact support.'
    )
    await sendNotification(
      ctx,
      `🆘 ОШИБКА обработки платежа Telegram Stars для @${username} (ID: ${userId}). Payload: ${payload}. Ошибка: ${error instanceof Error ? error.message : String(error)}`
    )
    await ctx.scene.leave()
  }
}

export async function handlePreCheckoutQuery(ctx: MyContext) {
  if (!ctx.preCheckoutQuery) {
    logger.warn(
      '[handlePreCheckoutQuery] Received update without preCheckoutQuery'
    )
    return
  }
  const query = ctx.preCheckoutQuery
  logger.info('🛒 Received pre_checkout_query:', {
    pre_checkout_query: query,
    telegram_id: ctx.from?.id,
  })

  try {
    await ctx.answerPreCheckoutQuery(true)
    logger.info('✅ Answered pre_checkout_query successfully', {
      pre_checkout_query_id: query.id,
    })
  } catch (error) {
    logger.error('❌ Error answering pre_checkout_query:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      pre_checkout_query_id: query.id,
      telegram_id: ctx.from?.id,
    })
    await ctx.answerPreCheckoutQuery(
      false,
      'An internal error occurred. Please try again later.'
    )
  }
}
