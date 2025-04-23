import { isRussian } from '@/helpers'
import { setPayments } from '@/core/supabase/setPayments'
import { incrementBalance } from '@/core/supabase/incrementBalance'
import { PaymentStatus, Currency } from '@/interfaces/payments.interface'

import { MyContext } from '@/interfaces'

// Локальные определения MyContext и SessionData удалены

async function sendNotification(ctx: MyContext, message: string) {
  // TODO: Получить правильный ID чата для уведомлений
  // await ctx.telegram.sendMessage('@neuro_blogger_pulse', message)
  console.log('Notification to send:', message) // Временно логируем
}

async function processPayment(
  ctx: MyContext,
  amount: number,
  subscriptionName: string,
  stars: number
) {
  const userId = ctx.from?.id?.toString()
  if (!userId) {
    console.error('processPayment: User ID not found in context')
    return
  }
  const username = ctx.from?.username ?? 'unknown'
  const botUsername = ctx.botInfo?.username ?? 'unknown_bot'
  const payload =
    ('message' in ctx.update &&
      ctx.update.message &&
      'successful_payment' in ctx.update.message &&
      ctx.update.message.successful_payment?.invoice_payload) ||
    undefined

  await incrementBalance({
    telegram_id: userId, // Используем userId из ctx.from.id
    amount, // Передаем amount (цена подписки или звезды)
  })

  await sendNotification(
    ctx,
    `💫 Пользователь @${username} (ID: ${userId}) купил ${subscriptionName}!`
  )
  await sendNotification(
    ctx,
    `💫 Пользователь @${username} (ID: ${userId}) пополнил баланс на ${amount} звезд!`
  )
  await setPayments({
    telegram_id: userId,
    OutSum: amount.toString(),
    InvId: payload || '',
    currency: Currency.XTR,
    stars,
    status: PaymentStatus.COMPLETED,
    payment_method: 'Telegram',
    subscription: subscriptionName,
    bot_name: botUsername,
    language: ctx.from?.language_code ?? 'en',
  })
}

export async function handleSuccessfulPayment(ctx: MyContext) {
  // Добавляем подробное логирование
  console.log(
    '[handleSuccessfulPayment] Received successful_payment event.',
    JSON.stringify(ctx.update, null, 2)
  )

  if (!ctx.chat || !ctx.from?.id) {
    console.error(
      'handleSuccessfulPayment: Update does not belong to a chat or user ID is missing'
    )
    return
  }

  if (!('message' in ctx.update)) {
    console.error(
      'handleSuccessfulPayment: Received update is not a message update'
    )
    return
  }

  if (!ctx.update.message || !('successful_payment' in ctx.update.message)) {
    console.error(
      'handleSuccessfulPayment: Message does not contain successful_payment data'
    )
    return
  }

  const successfulPayment = ctx.update.message.successful_payment

  const isRu = isRussian(ctx)
  const stars = successfulPayment.total_amount || 0 // Сумма в минимальных единицах валюты, переводим?
  const subscriptionType = ctx.session?.subscription // Берем из глобальной сессии
  const userId = ctx.from.id.toString()

  // Логируем извлеченные данные
  console.log('[handleSuccessfulPayment] Extracted Data:', {
    userId,
    stars,
    subscriptionType,
    invoicePayload: successfulPayment.invoice_payload,
    providerPaymentChargeId: successfulPayment.provider_payment_charge_id,
    telegramPaymentChargeId: successfulPayment.telegram_payment_charge_id,
  })

  const botUsername = ctx.botInfo?.username ?? 'unknown_bot'
  const username = ctx.from?.username ?? 'unknown'

  const subscriptionDetails = {
    neurophoto: { name: 'NeuroPhoto', amount: 1110, stars: 476 }, // amount RUB, stars in stars
    neurobase: { name: 'NeuroBase', amount: 7000, stars: 1303 },
  }

  const isKnownSubscription =
    subscriptionType && subscriptionType in subscriptionDetails

  if (isKnownSubscription) {
    console.log(
      `[handleSuccessfulPayment] Processing known subscription: ${subscriptionType}`
    )
    const {
      amount,
      name,
      stars: subStars,
    } = subscriptionDetails[subscriptionType]
    await processPayment(ctx, stars, name, stars)
  } else {
    console.log(
      `[handleSuccessfulPayment] Processing as star top-up (subscriptionType: ${subscriptionType})`
    )
    await incrementBalance({
      telegram_id: userId,
      amount: stars,
    })
    await ctx.reply(
      isRu
        ? `💫 Ваш баланс пополнен на ${stars}⭐️ звезд!`
        : `💫 Your balance has been replenished by ${stars}⭐️ stars!`
    )
    await sendNotification(
      ctx,
      `💫 Пользователь @${username} (ID: ${userId}) пополнил баланс на ${stars} звезд!`
    )

    await setPayments({
      telegram_id: userId,
      OutSum: stars.toString(),
      InvId: successfulPayment.invoice_payload || '',
      currency: Currency.XTR,
      stars,
      status: PaymentStatus.COMPLETED,
      payment_method: 'Telegram',
      subscription: 'stars',
      bot_name: botUsername,
      language: ctx.from?.language_code ?? 'en',
    })
  }
  console.log('[handleSuccessfulPayment] Finished processing.')
}
