import { Context } from 'telegraf'
import { logger } from '@/utils/logger'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { SUBSCRIPTION_CONFIG } from '@/config/subscription.config'
import { createSubscription } from '@/core/supabase/subscriptionProcessor'
import { TransactionType } from '@/interfaces/payments.interface'
import { Message } from '@telegraf/types'

export async function handlePreCheckoutQuery(ctx: Context) {
  try {
    logger.info('Processing pre-checkout query')
    await ctx.answerPreCheckoutQuery(true)
    logger.info('Pre-checkout query processed successfully')
  } catch (error) {
    logger.error('Error processing pre-checkout query:', error)
    await ctx.answerPreCheckoutQuery(false, 'Payment processing error')
  }
}

export async function handleSuccessfulPayment(ctx: Context) {
  try {
    const user = ctx.from
    const message = ctx.message as Message.SuccessfulPaymentMessage

    if (
      !user?.id ||
      !message?.successful_payment?.total_amount ||
      !message?.successful_payment?.invoice_payload
    ) {
      throw new Error('Missing required payment data')
    }

    const telegram_id = user.id.toString()
    const total_amount = message.successful_payment.total_amount
    const invoice_payload = message.successful_payment.invoice_payload

    logger.info(`Processing successful payment for user ${telegram_id}`)

    // Update user balance
    const updateBalanceResult = await updateUserBalance({
      telegram_id,
      amount: total_amount / 100, // Convert from kopeks to rubles
      bot_name: 'NeuroBlogger',
      type: TransactionType.SUBSCRIPTION_PURCHASE,
      description: 'Subscription purchase',
    })

    if (!updateBalanceResult.success) {
      throw new Error('Failed to update user balance')
    }

    // Create subscription based on invoice payload
    const subscriptionType = invoice_payload as SubscriptionType
    const subscriptionConfig = SUBSCRIPTION_CONFIG[subscriptionType]

    if (!subscriptionConfig) {
      throw new Error(`Invalid subscription type: ${subscriptionType}`)
    }

    const createSubscriptionResult = await createSubscription({
      telegram_id,
      type: subscriptionType,
      duration_days: subscriptionConfig.duration_days,
    })

    if (!createSubscriptionResult.success) {
      throw new Error('Failed to create subscription')
    }

    // Send success message
    await ctx.reply(
      `✨ Оплата успешно обработана!\n\n` +
        `💫 Подписка: ${subscriptionConfig.title_ru}\n` +
        `⏳ Длительность: ${subscriptionConfig.duration_days} дней\n` +
        `💎 Сумма: ${total_amount / 100} ₽\n\n` +
        `🎉 Спасибо за доверие! Теперь вам доступны все возможности подписки.`
    )

    logger.info(`Payment processing completed for user ${telegram_id}`)
  } catch (error) {
    logger.error('Error processing successful payment:', error)
    await ctx.reply(
      '❌ Произошла ошибка при обработке платежа.\n' +
        'Пожалуйста, свяжитесь с поддержкой, если средства были списаны.'
    )
  }
}
