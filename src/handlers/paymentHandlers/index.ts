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
import { ModeEnum } from '@/interfaces'

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
    await ctx.scene.leave()
    return
  }

  let subscriptionType: SubscriptionType | null = null
  let starsFromPayload: number | null = null
  let purchasedPlanText: string | null = null
  let isSubscriptionPurchase = false

  try {
    if (payload) {
      const parts = payload.split('_')
      if (
        parts.length >= 2 &&
        isNaN(parseInt(parts[0], 10)) &&
        !isNaN(parseInt(parts[1], 10))
      ) {
        const typeFromPayload = parts[0].toUpperCase() as SubscriptionType
        const starsStr = parts[1]

        const planDetails = paymentOptionsPlans.find(
          p => p.subscription?.toUpperCase() === typeFromPayload
        )

        if (planDetails) {
          const parsedStars = parseInt(starsStr, 10)
          if (!isNaN(parsedStars) && parsedStars > 0) {
            isSubscriptionPurchase = true
            subscriptionType = typeFromPayload
            starsFromPayload = parsedStars
            purchasedPlanText =
              planDetails.subscription?.toString() ?? subscriptionType
            logger.info(
              '[handleSuccessfulPayment] Correctly parsed as SUBSCRIPTION from payload',
              {
                telegram_id: normalizedUserId,
                subscriptionType,
                starsFromPayload,
              }
            )
          } else {
            logger.warn(
              '[handleSuccessfulPayment] Invalid star amount in subscription payload',
              { payload, telegram_id: normalizedUserId }
            )
          }
        } else {
          logger.warn(
            '[handleSuccessfulPayment] Subscription type from payload NOT FOUND in plans',
            { typeFromPayload, telegram_id: normalizedUserId }
          )
        }
      } else if (parts.length >= 1 && !isNaN(parseInt(parts[0], 10))) {
        const parsedStarsHint = parseInt(parts[0], 10)
        if (!isNaN(parsedStarsHint) && parsedStarsHint > 0) {
          logger.info(
            '[handleSuccessfulPayment] Payload contained a numeric hint, will verify against total_amount if not a subscription.',
            {
              payload,
              parsedStarsHint,
              telegram_id: normalizedUserId,
            }
          )
        } else {
          logger.warn(
            '[handleSuccessfulPayment] Invalid star amount in potential top-up numeric payload',
            { payload, telegram_id: normalizedUserId }
          )
        }
      } else {
        logger.warn('[handleSuccessfulPayment] Unrecognized payload format', {
          payload,
          telegram_id: normalizedUserId,
        })
      }
    }

    if (!isSubscriptionPurchase) {
      starsFromPayload = successfulPayment.total_amount
      subscriptionType = null
      purchasedPlanText = null
      logger.info(
        '[handleSuccessfulPayment] Final decision: Processing as stars TOP-UP',
        {
          telegram_id: normalizedUserId,
          stars: starsFromPayload,
          reason: payload
            ? 'Payload did not match valid subscription or was only a numeric hint'
            : 'No payload or unparsed payload, using total_amount',
        }
      )
    } else {
      logger.info(
        '[handleSuccessfulPayment] Final decision: Processing as SUBSCRIPTION purchase',
        {
          telegram_id: normalizedUserId,
          subscription: subscriptionType,
          stars: starsFromPayload,
        }
      )
    }

    if (
      starsFromPayload === null ||
      isNaN(starsFromPayload) ||
      starsFromPayload <= 0
    ) {
      logger.error(
        '[handleSuccessfulPayment] Invalid final starsFromPayload before DB write',
        {
          telegram_id: normalizedUserId,
          starsFromPayload_before_fallback: starsFromPayload,
          successfulPayment_total_amount: successfulPayment.total_amount,
          payload,
          isSubscriptionPurchase_context: isSubscriptionPurchase,
        }
      )
      if (successfulPayment.total_amount > 0) {
        starsFromPayload = successfulPayment.total_amount
        logger.warn(
          '[handleSuccessfulPayment] CRITICAL FALLBACK: Using total_amount for stars. This might be incorrect for subscriptions. Review payload parsing.',
          {
            telegram_id: normalizedUserId,
            new_starsFromPayload: starsFromPayload,
          }
        )
        isSubscriptionPurchase = false
        subscriptionType = null
        purchasedPlanText = null
      } else {
        throw new Error(
          'Invalid star amount: both parsed/payload stars and total_amount are invalid or zero.'
        )
      }
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
      },
    })

    logger.info('[handleSuccessfulPayment] Values before final reply:', {
      telegram_id: normalizedUserId,
      isSubscriptionPurchase,
      subscriptionType,
      purchasedPlanText,
      starsFromPayload,
    })

    if (isSubscriptionPurchase && purchasedPlanText) {
      await ctx.reply(
        isRu
          ? `🎉 Ваша подписка "${purchasedPlanText}" успешно оформлена и активна! Пользуйтесь ботом.`
          : `🎉 Your subscription "${purchasedPlanText}" has been successfully activated! Enjoy the bot.`
      )
    } else {
      await ctx.reply(
        isRu
          ? `💫 Ваш баланс пополнен на ${starsFromPayload}⭐ звезд!`
          : `💫 Your balance has been replenished by ${starsFromPayload}⭐ stars!`
      )
    }

    await notifyBotOwners(botUsername, {
      username,
      telegram_id: userId.toString(),
      amount: starsFromPayload,
      stars: starsFromPayload,
      subscription: purchasedPlanText,
    })

    logger.info(
      '[handleSuccessfulPayment] Leaving scene and showing main menu after successful payment...',
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
    await ctx.scene.leave()
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при обработке вашего платежа. Обратитесь в поддержку.'
        : 'An error occurred while processing your payment. Please contact support.'
    )
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
