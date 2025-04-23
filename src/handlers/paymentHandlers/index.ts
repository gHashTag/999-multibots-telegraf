import { isRussian } from '@/helpers'
import { setPayments } from '@/core/supabase/setPayments'
import {
  PaymentStatus,
  Currency,
  PaymentType,
} from '@/interfaces/payments.interface'
import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { logger } from '@/utils'
import { Message, SuccessfulPayment, Update } from 'telegraf/types'
import { notifyBotOwners } from '@/core/supabase/notifyBotOwners'
// Локальные определения MyContext и SessionData удалены

async function sendNotification({
  ctx,
  message,
  username,
  telegram_id,
  outSum,
  stars,
  subscription,
}: {
  ctx: MyContext
  message: string
  username: string
  telegram_id: string
  outSum: number
  stars: number
  subscription: SubscriptionType
}) {
  logger.info(`Notification to send: ${message}`)
  // TODO: Получить правильный ID чата для уведомлений
  // await ctx.telegram.sendMessage('@neuro_blogger_pulse', message)
  const bot_name = ctx.botInfo?.username ?? 'unknown_bot'
  await notifyBotOwners(bot_name, {
    username,
    telegram_id: telegram_id.toString(),
    amount: outSum,
    stars,
    subscription: subscription,
  })
}

async function processPayment(
  ctx: MyContext,
  amount: number,
  currency: Currency,
  subscriptionName: string,
  stars: number,
  type: PaymentType,
  subscriptionType: SubscriptionType | null,
  successfulPaymentData: SuccessfulPayment | undefined
) {
  const userId = ctx.from?.id?.toString()
  if (!userId) {
    logger.error('processPayment: User ID not found in context')
    return
  }
  const username = ctx.from?.username ?? 'unknown'
  const botUsername = ctx.botInfo?.username ?? 'unknown_bot'

  let payload: string | undefined = undefined
  let metadata: object = {}

  if (successfulPaymentData) {
    payload = successfulPaymentData.invoice_payload
    metadata = successfulPaymentData
  } else {
    logger.warn('processPayment: Received undefined successfulPaymentData.')
  }

  await sendNotification({
    ctx,
    message: `💫 Пользователь @${username} (ID: ${userId}) купил ${subscriptionName}!`,
    username,
    telegram_id: userId,
    outSum: amount,
    stars,
    subscription: subscriptionType,
  })

  await setPayments({
    telegram_id: userId!,
    OutSum: amount.toString(),
    InvId: payload || '',
    currency: currency,
    stars: stars,
    status: PaymentStatus.COMPLETED,
    payment_method: 'Telegram',
    type: type,
    subscription_type: subscriptionType,
    bot_name: botUsername,
    language: ctx.from?.language_code ?? 'en',
    metadata: metadata,
  })
}

async function processSuccessfulPaymentLogic(
  ctx: MyContext,
  successfulPayment: SuccessfulPayment
) {
  logger.info(
    '[processSuccessfulPaymentLogic] Processing payment event.',
    JSON.stringify(successfulPayment, null, 2)
  )

  if (!ctx.from?.id) {
    logger.error(
      '[processSuccessfulPaymentLogic] User ID is missing in context'
    )
    return
  }

  const isRu = isRussian(ctx)
  const userId = ctx.from.id.toString()
  const botUsername = ctx.botInfo?.username ?? 'unknown_bot'
  const username = ctx.from?.username ?? 'unknown'

  const payload = successfulPayment.invoice_payload ?? ''
  let isSubscriptionPurchase = false
  let purchasedSubType: SubscriptionType | null = null
  let purchasedSubName = ''
  const currencyPaid = successfulPayment.currency as Currency
  const amountPaid = successfulPayment.total_amount
  let starsEquivalent = amountPaid

  if (payload.startsWith('buy_subscription_')) {
    const subKey = payload.replace('buy_subscription_', '').toUpperCase()
    if (subKey === SubscriptionType.NEUROPHOTO) {
      purchasedSubType = SubscriptionType.NEUROPHOTO
      purchasedSubName = 'NeuroPhoto'
      starsEquivalent = 476
    } else if (subKey === SubscriptionType.NEUROBASE) {
      purchasedSubType = SubscriptionType.NEUROBASE
      purchasedSubName = 'NeuroBase'
      starsEquivalent = 1303
    } else if (subKey === SubscriptionType.NEUROBLOGGER) {
      purchasedSubType = SubscriptionType.NEUROBLOGGER
      purchasedSubName = 'NeuroBlogger'
    }

    if (purchasedSubType) {
      isSubscriptionPurchase = true
    }
  } else if (payload === 'top_up_stars') {
    isSubscriptionPurchase = false
  }

  logger.info('[processSuccessfulPaymentLogic] Parsed Payload:', {
    userId,
    payload,
    isSubscriptionPurchase,
    purchasedSubType,
    currencyPaid,
    amountPaid,
  })

  if (isSubscriptionPurchase && purchasedSubType) {
    logger.info(
      `[processSuccessfulPaymentLogic] Processing subscription purchase: ${purchasedSubType}`
    )
    await processPayment(
      ctx,
      amountPaid,
      currencyPaid,
      purchasedSubName,
      starsEquivalent,
      PaymentType.SUBSCRIPTION_PURCHASE,
      purchasedSubType,
      successfulPayment
    )
    await ctx.reply(
      isRu
        ? `✅ Подписка ${purchasedSubName} успешно оформлена!`
        : `✅ Subscription ${purchasedSubName} purchased successfully!`
    )
  } else {
    logger.info(`[processSuccessfulPaymentLogic] Processing as star top-up.`)
    await setPayments({
      telegram_id: userId,
      OutSum: amountPaid.toString(),
      InvId: payload || successfulPayment.telegram_payment_charge_id,
      currency: currencyPaid,
      stars: amountPaid,
      status: PaymentStatus.COMPLETED,
      payment_method: 'Telegram',
      type: PaymentType.MONEY_INCOME,
      subscription_type: null,
      bot_name: botUsername,
      language: ctx.from?.language_code ?? 'en',
      metadata: successfulPayment ?? {},
    })
    await ctx.reply(
      isRu
        ? `💫 Ваш баланс пополнен на ${amountPaid}⭐️ звезд!`
        : `💫 Your balance has been replenished by ${amountPaid}⭐️ stars!`
    )
    await sendNotification({
      ctx,
      message: `💫 Пользователь @${username} (ID: ${userId}) пополнил баланс на ${amountPaid} звезд!`,
      username,
      telegram_id: userId,
      outSum: amountPaid,
      stars: amountPaid,
      subscription: null,
    })
  }
  logger.info('[processSuccessfulPaymentLogic] Finished processing.')
}

// --- НОВАЯ ФУНКЦИЯ ДЛЯ PRE_CHECKOUT_QUERY ---
export async function handlePreCheckoutQuery(ctx: MyContext) {
  const query = ctx.preCheckoutQuery
  if (!query) {
    logger.error(
      '[handlePreCheckoutQuery] Received update without preCheckoutQuery data.'
    )
    // Отвечать здесь не нужно, т.к. это не pre_checkout_query по факту
    return
  }

  logger.info('[handlePreCheckoutQuery] Received pre_checkout_query:', {
    query_id: query.id,
    from: query.from,
    currency: query.currency,
    total_amount: query.total_amount,
    invoice_payload: query.invoice_payload,
  })

  // --- ЗДЕСЬ МОЖНО ДОБАВИТЬ ПРОВЕРКИ ---
  // Например, проверить payload, сумму, доступность товара/подписки
  const payloadIsValid = true // Заглушка - пока считаем любой payload валидным
  const amountIsValid = true // Заглушка - пока считаем любую сумму валидной

  if (payloadIsValid && amountIsValid) {
    // Все проверки пройдены, подтверждаем готовность принять платеж
    logger.info(
      `[handlePreCheckoutQuery] Answering OK for query_id: ${query.id}`
    )
    await ctx.answerPreCheckoutQuery(true)
  } else {
    // Какая-то проверка не пройдена, отклоняем платеж
    const errorMessage = 'Не удалось подтвердить заказ. Попробуйте позже.' // Пример сообщения
    logger.warn(
      `[handlePreCheckoutQuery] Answering FAILED for query_id: ${query.id}. Reason: ${errorMessage}`
    )
    await ctx.answerPreCheckoutQuery(false, errorMessage)
  }
}
// --- КОНЕЦ НОВОЙ ФУНКЦИИ ---

// Основной обработчик успешного платежа (остается как есть)
export async function handleSuccessfulPayment(ctx: MyContext) {
  // 1. Проверка типа (возвращаем в один if) с использованием 'as'
  if (
    ctx.updateType !== 'message' ||
    !(ctx.update as Update.MessageUpdate).message || // <-- Используем 'as' здесь для проверки message
    !('successful_payment' in (ctx.update as Update.MessageUpdate).message) // <-- Используем 'as' здесь для проверки successful_payment
  ) {
    logger.error(
      '[handleSuccessfulPayment] Update is not a message with successful_payment data'
    )
    return
  }

  // 2. Безопасное извлечение данных с использованием 'as'
  // Теперь, после проверки, мы можем быть уверены в типе
  const successfulPayment = (
    ctx.update as Update.MessageUpdate<Message.SuccessfulPaymentMessage>
  ).message.successful_payment

  // 3. Вызов основной логики
  await processSuccessfulPaymentLogic(ctx, successfulPayment)
}
