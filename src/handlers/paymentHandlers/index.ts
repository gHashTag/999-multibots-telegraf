import { isRussian } from '@/helpers'
import { setPayments } from '@/core/supabase/payments/setPayments'

import { logger } from '@/utils/logger'

import { MyContext } from '@/interfaces'
import {
  Currency,
  PaymentStatus,
  PaymentType,
} from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { starAmounts } from '@/price/helpers'
import { notifyBotOwners } from '@/core/supabase/notifyBotOwners'
// Локальные определения MyContext и SessionData удалены

const SUBSCRIPTION_PLANS = [
  {
    row: 0,
    text: '🎨 NeuroPhoto',
    en_price: 10,
    ru_price: 1110,
    description: 'Creating photos using neural networks.',
    stars_price: 476,
    callback_data: 'neurophoto',
  },
  {
    row: 1,
    text: '📚 NeuroBase',
    en_price: 33,
    ru_price: 2999,
    description: 'Self-study using neural networks with an AI avatar.',
    stars_price: 1303,
    callback_data: 'neurobase',
  },
  {
    row: 2,
    text: '🤖 NeuroBlogger',
    en_price: 833,
    ru_price: 75000,
    description: 'Training on neural networks with a mentor.',
    stars_price: 32608,
    callback_data: 'neuroblogger',
  },
]

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
  console.log('CASE: handleSuccessfulPayment')
  if (!ctx.message || !('successful_payment' in ctx.message)) {
    logger.warn(
      '⚠️ Received update without message or successful_payment in handleSuccessfulPayment'
    )
    return
  }
  const successfulPayment = ctx.message.successful_payment

  if (!ctx.chat) {
    logger.error(
      '❌ Update does not belong to a chat in handleSuccessfulPayment'
    )
    return
  }
  if (!ctx.from?.id) {
    logger.error('❌ User ID not found in context for handleSuccessfulPayment')
    return
  }

  const isRu = isRussian(ctx)
  const stars = successfulPayment.total_amount
  const currency = successfulPayment.currency
  const payload = successfulPayment.invoice_payload
  const telegramPaymentChargeId = successfulPayment.telegram_payment_charge_id
  const providerPaymentChargeId = successfulPayment.provider_payment_charge_id

  const userId = ctx.from.id
  const username = ctx.from?.username ?? 'unknown'
  const normalizedUserId = normalizeTelegramId(userId)
  const botUsername = ctx.botInfo?.username ?? 'unknown_bot'

  if (currency !== 'XTR') {
    logger.error('❌ Incorrect currency in successful_payment:', {
      currency,
      telegram_id: normalizedUserId,
      payload,
    })
    await ctx.reply(
      isRu
        ? 'Произошла ошибка с валютой платежа. Обратитесь в поддержку.'
        : 'Payment currency error. Please contact support.'
    )
    return
  }

  logger.info('💰 Received successful Telegram Stars payment:', {
    telegram_id: normalizedUserId,
    username,
    stars,
    payload,
    telegramPaymentChargeId,
  })

  const subscriptionCallbackData = ctx.session?.subscription

  const purchasedPlan = SUBSCRIPTION_PLANS.find(
    plan => plan.callback_data === subscriptionCallbackData
  )

  try {
    logger.info('📈 Balance incremented successfully', {
      telegram_id: normalizedUserId,
      stars_added: stars,
    })

    if (purchasedPlan) {
      logger.info('Processing SUBSCRIPTION purchase via Telegram Stars', {
        telegram_id: normalizedUserId,
        plan: purchasedPlan.text,
      })
      await setPayments({
        telegram_id: normalizedUserId,
        OutSum: stars.toString(),
        InvId: payload || null,
        currency: Currency.XTR,
        stars: stars,
        status: PaymentStatus.COMPLETED,
        payment_method: 'Telegram',
        subscription_type: purchasedPlan.callback_data as SubscriptionType,
        bot_name: botUsername,
        language: ctx.from?.language_code ?? 'en',
        type: PaymentType.MONEY_INCOME,
        metadata: {
          telegram_payment_charge_id: telegramPaymentChargeId,
          provider_payment_charge_id: providerPaymentChargeId,
          invoice_payload: payload,
          username: username,
          purchased_plan_text: purchasedPlan.text,
        },
      })

      await ctx.reply(
        isRu
          ? `🎉 Вы успешно приобрели подписку "${purchasedPlan.text}"! Ваш баланс также пополнен на ${stars}⭐.`
          : `🎉 You have successfully purchased the "${purchasedPlan.text}" subscription! Your balance was also topped up by ${stars}⭐.`
      )
      await sendNotification(
        ctx,
        `💳 Пользователь @${username} (ID: ${userId}) купил подписку "${purchasedPlan.text}" за ${stars}⭐ через Telegram Stars.`
      )
      const bot_name = ctx.botInfo?.username ?? 'unknown_bot'
      await notifyBotOwners(bot_name, {
        username,
        telegram_id: userId.toString(),
        amount: stars,
        stars,
        subscription: purchasedPlan.text,
      })
    } else {
      logger.info('Processing simple STARS top-up via Telegram Stars', {
        telegram_id: normalizedUserId,
        stars_added: stars,
      })
      await setPayments({
        telegram_id: normalizedUserId,
        OutSum: stars.toString(),
        InvId: payload || null,
        currency: Currency.XTR,
        stars: stars,
        status: PaymentStatus.COMPLETED,
        payment_method: 'Telegram',
        subscription_type: null,
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

      await ctx.reply(
        isRu
          ? `💫 Ваш баланс пополнен на ${stars}⭐️ звезд!`
          : `💫 Your balance has been replenished by ${stars}⭐️ stars!`
      )
      await sendNotification(
        ctx,
        `💰 Пользователь @${username} (ID: ${userId}) пополнил баланс на ${stars}⭐️ через Telegram Stars.`
      )
      const bot_name = ctx.botInfo?.username ?? 'unknown_bot'
      await notifyBotOwners(bot_name, {
        username,
        telegram_id: userId.toString(),
        amount: stars,
        stars,
        subscription: null,
      })
    }

    logger.info('✅ Telegram Stars payment processed successfully.', {
      telegram_id: normalizedUserId,
      isSubscription: !!purchasedPlan,
    })
  } catch (error) {
    logger.error('❌ Error processing successful Telegram Stars payment:', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: normalizedUserId,
      stars,
      payload,
    })
    await ctx.reply(
      isRu
        ? '😿 Произошла ошибка при обработке вашего платежа. Пожалуйста, обратитесь в поддержку.'
        : '😿 An error occurred while processing your payment. Please contact support.'
    )
    await sendNotification(
      ctx,
      `🆘 ОШИБКА обработки платежа Telegram Stars для @${username} (ID: ${userId}). Звезды: ${stars}. Payload: ${payload}. Ошибка: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
