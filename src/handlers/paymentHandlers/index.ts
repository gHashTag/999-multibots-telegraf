import { isRussianFromState } from '@/helpers/centralizedLanguage'
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
import { telegramLogService } from '@/services/telegram-log.service'
import { resolveAdminChatId } from '@/helpers/adminChatId'

/**
 * Валидация URL для серверных запросов бота: только http/https, хост не
 * приватный и не зацикленный (SSRF-гвард).
 */
export function assertPublicHttpUrl(raw: string): URL {
  const u = new URL(raw)
  const h = u.hostname.toLowerCase()
  const forbidden =
    (u.protocol !== 'https:' && u.protocol !== 'http:') ||
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '::1' ||
    h === '0.0.0.0' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h)
  if (forbidden) {
    throw new Error(
      `адрес запрещён политикой серверных запросов: ${u.protocol}//${h}`
    )
  }
  return u
}

/**
 * Сообщить render-серверу об оплаченной звезде ленты. Адрес — литерал
 * прод-деплоя: URL, собранный из ENV, сканер считает потенциальным SSRF,
 * а переопределения окружения для этого вызова не предусмотрено.
 */
export async function postStarPaid(payload: string): Promise<{
  ok: boolean
  paid: boolean
  to_telegram_id?: string
  amount?: number
}> {
  const target = new URL(
    'https://vibee-render-production.up.railway.app/api/star-paid'
  )
  const r = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.RENDER_API_KEY || '',
    },
    body: JSON.stringify({ payload }),
  })
  return (await r.json()) as {
    ok: boolean
    paid: boolean
    to_telegram_id?: string
    amount?: number
  }
}

/**
 * Зачислить покупку токенов мини-приложения — В БАЗЕ РЕНДЕРА.
 *
 * Токены живут в таблице `user_tokens` базы рендер-сервиса (Railway
 * Postgres), а баланс бота — в леджере `payments_v2` Supabase. Это две разные
 * базы, и зачислять покупку токенов записью в Supabase было бы зачислением не
 * туда: человек заплатил, а в мини-приложении по-прежнему ноль.
 *
 * Поэтому оплату переправляем хозяину леджера. Адрес — литерал прод-деплоя по
 * той же причине, что и у postStarPaid выше: URL, собранный из ENV, сканер
 * считает потенциальным SSRF.
 *
 * `chargeId` передаём обязательно: на нём стоит идемпотентность зачисления
 * (первичный ключ star_payments). Без него повторная доставка одного платежа
 * начислила бы токены дважды.
 */
export async function postStarsCredit(payment: {
  chargeId: string
  telegramId: string
  amount: number
}): Promise<{ ok: boolean; credited?: boolean; reason?: string }> {
  const target = new URL(
    'https://vibee-render-production.up.railway.app/api/stars/credit'
  )
  const r = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.RENDER_API_KEY || '',
    },
    body: JSON.stringify(payment),
  })
  return (await r.json()) as {
    ok: boolean
    credited?: boolean
    reason?: string
  }
}

/**
 * WHAT THE BUYER MAY BE TOLD, given the ledger's answer.
 *
 * `ok` and `credited` are different facts and the caller used to read only
 * the first: a `{ ok: true, credited: false }` answer -- the render's own
 * "[STARS] not credited" case -- reached the buyer as "Зачислено N токенов",
 * with no throw and no owner alert.
 *
 * A REDELIVERY IS NOT A FAILURE. Telegram redelivers successful payments,
 * and the ledger's idempotency lock answers `credited: false` with the
 * redelivery reason; the tokens are there from the first delivery. Treating
 * that as an error would fire a scary message on an ordinary event.
 *
 * Everything else -- including `credited` missing -- is `failed`. Fail
 * closed: better to alarm the owner over an oddity than to tell somebody
 * their money bought something it did not.
 */
export function starsCreditVerdict(outcome: {
  ok: boolean
  credited?: boolean
  reason?: string
}): 'credited' | 'already' | 'failed' {
  if (!outcome.ok) return 'failed'
  if (outcome.credited === true) return 'credited'
  if (/redeliver/i.test(outcome.reason ?? '')) return 'already'
  return 'failed'
}

/** Разобрать payload покупки токенов мини-приложения: `tokens:<сумма>:<id>`. */
export function parseTokensPayload(
  payload: string
): { amount: number; telegramId: string } | null {
  const m = /^tokens:(\d+):(.+)$/.exec(payload)
  if (!m) return null
  const amount = Number(m[1])
  if (!(amount > 0)) return null
  return { amount, telegramId: m[2] }
}

async function sendNotification(ctx: MyContext, message: string) {
  // Through the resolver: production's ADMIN_CHAT_ID is a bare username, which
  // Telegram refuses with "chat not found", so every payment notice raised an
  // alert instead of reaching the owner.
  const adminChatId = resolveAdminChatId()
  if (!adminChatId) {
    logger.warn('⚠️ ADMIN_CHAT_ID not set. Notification not sent.')
    return
  }
  try {
    await ctx.telegram.sendMessage(adminChatId, message)
    // Moved inside the try. It used to sit after the catch and printed
    // "Notification sent to admin" on the failure path too -- a line that says
    // the thing was delivered whether or not it was is worse than no line.
    console.log('🔔 Notification sent to admin')
  } catch (error) {
    logger.error('❌ Error sending notification to admin', {
      error: error instanceof Error ? error.message : String(error),
      adminChatId,
    })
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

  const isRu = isRussianFromState(ctx)
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
    await ctx.scene?.leave?.()
    return
  }

  // 🏛 Клуб «Золотая Литейная» (@t27ai_bot): payload `foundry-<tier>_<stars>_<ts>`.
  // Ветка стоит ДО общего разбора: иначе parts[0] не найдётся в
  // paymentOptionsPlans и оплата клуба молча запишется как пополнение баланса.
  /*
   * ПОКУПКА ТОКЕНОВ МИНИ-ПРИЛОЖЕНИЯ: payload `tokens:<сумма>:<id>`.
   *
   * Счёт на неё выставляет рендер (render-server.ts, createInvoiceLink), а
   * зачисляет он же — в свою базу. Раньше подтверждение оплаты шло к нему
   * вебхуком, и этот вебхук, стоя на том же токене бота, глушил боту весь
   * приём сообщений (см. src/index.ts, снятый CASHIER GUARD). Приёмник
   * теперь один — опрос здесь, — поэтому оплата приходит боту, а бот
   * переправляет её хозяину леджера.
   *
   * Ветка стоит ПЕРВОЙ по той же причине, по какой клубная стоит выше общего
   * разбора: `parts[0]` не найдётся в paymentOptionsPlans, и покупка токенов
   * молча записалась бы пополнением баланса не в ту базу.
   */
  const токены = payload ? parseTokensPayload(payload) : null
  if (токены) {
    try {
      const outcome = await postStarsCredit({
        chargeId: telegramPaymentChargeId,
        telegramId: токены.telegramId,
        amount: токены.amount,
      })
      // The rule lives in starsCreditVerdict, beside the call that asks the
      // ledger; `ok` alone used to decide, and `ok` is not `credited`.
      if (starsCreditVerdict(outcome) === 'failed') {
        throw new Error(
          `рендер не зачислил: ${outcome.reason ?? 'поле credited не пришло'}`
        )
      }
      logger.info('[handleSuccessfulPayment] mini-app tokens credited', {
        telegram_id: токены.telegramId,
        amount: токены.amount,
        credited: outcome.credited,
        reason: outcome.reason,
      })
      await ctx.reply(
        isRu
          ? `Зачислено ${токены.amount} токенов. Спасибо!`
          : `${токены.amount} tokens credited. Thank you!`
      )
    } catch (error) {
      // Деньги уже списаны Telegram'ом: не молчим и не маскируем.
      logger.error('❌ [handleSuccessfulPayment] tokens branch failed', {
        error: error instanceof Error ? error.message : String(error),
        telegram_id: токены.telegramId,
        amount: токены.amount,
        charge_id: telegramPaymentChargeId,
        payload,
      })
      await ctx.reply(
        isRu
          ? 'Оплата прошла, но зачисление не удалось. Мы уже знаем и починим — напишите в поддержку с этим сообщением.'
          : 'Payment went through but crediting failed. We know and will fix it — please contact support with this message.'
      )
      await sendNotification(
        ctx,
        `⚠️ Токены не зачислены: ${токены.amount} для ${токены.telegramId}, charge ${telegramPaymentChargeId}`
      )
    }
    return
  }

  if (payload?.startsWith('foundry-')) {
    const { parseFoundryPayload, replyClubWelcome } = await import(
      '@/handlers/foundryClub'
    )
    const club = parseFoundryPayload(payload)
    try {
      if (!club) {
        throw new Error(`Malformed foundry payload: ${payload}`)
      }
      // Income + compensating outcome are ONE atomic multi-row insert (see
      // setPayments): a transient failure between two separate inserts used to
      // leave the income alone = the whole club fee minted as spendable balance.
      await setPayments([
        {
          telegram_id: normalizedUserId,
          OutSum: club.stars.toString(),
          InvId: payload,
          currency: Currency.XTR,
          stars: club.stars,
          status: PaymentStatus.COMPLETED,
          payment_method: 'Telegram',
          subscription_type: club.tier.subscriptionType,
          bot_name: botUsername,
          language: ctx.from?.language_code ?? 'en',
          type: PaymentType.MONEY_INCOME,
          metadata: {
            telegram_payment_charge_id: telegramPaymentChargeId,
            provider_payment_charge_id: providerPaymentChargeId,
            invoice_payload: payload,
            username,
            club: 'golden_foundry',
            club_tier: club.tier.key,
          },
        },
        // Compensating debit. get_user_balance sums every COMPLETED MONEY_INCOME
        // with no subscription_type filter, so without this row the club fee would
        // become spendable generation balance (12499 stars of membership = 12499
        // stars of video at the owner's cost). The pair keeps the income visible
        // in reports while the balance stays zero.
        {
          telegram_id: normalizedUserId,
          OutSum: club.stars.toString(),
          InvId: `${payload}_membership`,
          currency: Currency.XTR,
          stars: club.stars,
          status: PaymentStatus.COMPLETED,
          payment_method: 'Telegram',
          subscription_type: null,
          bot_name: botUsername,
          language: ctx.from?.language_code ?? 'en',
          type: PaymentType.MONEY_OUTCOME,
          service_type: 'golden_foundry_membership',
          cost: 0,
          metadata: {
            invoice_payload: payload,
            username,
            club: 'golden_foundry',
            club_tier: club.tier.key,
            note: 'membership fee is not a spendable balance top-up',
          },
        },
      ])

      const { getSubScribeChannel } = await import(
        '@/handlers/getSubScribeChannel'
      )
      const channelId = await getSubScribeChannel(ctx).catch(() => null)
      await replyClubWelcome(ctx, club.tier, channelId)

      await notifyBotOwners(botUsername, {
        username,
        telegram_id: userId.toString(),
        amount: club.stars,
        stars: club.stars,
        subscription: `Golden Foundry / ${club.tier.key}`,
      })
      await telegramLogService.logPayment({
        telegramId: userId.toString(),
        username,
        amount: club.stars,
        currency: 'XTR',
        stars: club.stars,
        method: 'Telegram Stars',
        botName: botUsername,
      })

      logger.info('[handleSuccessfulPayment] Golden Foundry membership paid', {
        telegram_id: normalizedUserId,
        tier: club.tier.key,
        stars: club.stars,
      })
      await ctx.scene?.leave?.()
    } catch (error) {
      // Деньги уже списаны Telegram'ом: не молчим и не маскируем.
      logger.error('❌ [handleSuccessfulPayment] Foundry branch failed', {
        error: error instanceof Error ? error.message : String(error),
        telegram_id: normalizedUserId,
        payload,
      })
      await ctx.reply(
        isRu
          ? 'Оплата прошла, но при активации клуба возникла ошибка. Напишите admin@t27.ai — активируем вручную.'
          : 'The payment went through, but club activation failed. Write to admin@t27.ai — we will activate it manually.'
      )
      await ctx.scene?.leave?.()
    }
    return
  }

  // ⭐ Звезда автору из ленты мини-аппа: payload `feedstar-<uuid>`.
  // Звёзды платит ОТПРАВИТЕЛЬ, а получает АВТОР ролика:
  //   1. рендер создал строку pending (POST /api/feed/:id/star)
  //   2. здесь подтверждаем оплату у рендера (postStarPaid), он помечает
  //      paid и поднимает stars_count у ролика
  //   3. отправителю — пара income+outcome (жест виден в истории, баланс
  //      не растёт: подарок, а не пополнение) — приём foundry-взноса
  //   4. автору — income: звезда падает на его расходуемый баланс
  if (payload?.startsWith('feedstar-')) {
    try {
      const starAmount = successfulPayment.total_amount ?? 1
      const paid = await postStarPaid(payload)
      if (!paid.ok) {
        throw new Error('render /api/star-paid ответил ошибкой')
      }

      // Sender: the movement is visible, the balance does not change (a gift).
      // Income + compensating outcome are ONE atomic multi-row insert, so a
      // transient failure cannot leave the income alone (a spendable mint).
      await setPayments([
        {
          telegram_id: normalizedUserId,
          OutSum: String(starAmount),
          InvId: payload,
          currency: Currency.XTR,
          stars: starAmount,
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
            username,
            gift: 'feed_star',
          },
        },
        {
          telegram_id: normalizedUserId,
          OutSum: String(starAmount),
          InvId: `${payload}_gift`,
          currency: Currency.XTR,
          stars: starAmount,
          status: PaymentStatus.COMPLETED,
          payment_method: 'Telegram',
          subscription_type: null,
          bot_name: botUsername,
          language: ctx.from?.language_code ?? 'en',
          type: PaymentType.MONEY_OUTCOME,
          service_type: 'feed_star_gift',
          cost: 0,
          metadata: {
            invoice_payload: payload,
            username,
            gift: 'feed_star',
            note: 'gift to author is not a spendable balance top-up',
          },
        },
      ])

      // Автор: звезда на баланс.
      const authorId = paid.to_telegram_id ?? null
      if (authorId) {
        await setPayments({
          telegram_id: authorId,
          OutSum: String(starAmount),
          InvId: `${payload}_author`,
          currency: Currency.XTR,
          stars: starAmount,
          status: PaymentStatus.COMPLETED,
          payment_method: 'Telegram',
          subscription_type: null,
          bot_name: botUsername,
          language: ctx.from?.language_code ?? 'en',
          type: PaymentType.MONEY_INCOME,
          metadata: {
            invoice_payload: payload,
            from_telegram_id: normalizedUserId,
            from_username: username,
            gift: 'feed_star',
            note: 'star received from feed',
          },
        })
      }

      await ctx.reply(
        isRu
          ? '⭐ Звезда отправлена автору — она у него на балансе. Спасибо!'
          : '⭐ The star has been sent to the author. Thank you!'
      )
      logger.info('[handleSuccessfulPayment] Feed star paid', {
        telegram_id: normalizedUserId,
        author: authorId,
        stars: starAmount,
      })
    } catch (error) {
      logger.error('❌ [handleSuccessfulPayment] Feed star branch failed', {
        error: error instanceof Error ? error.message : String(error),
        telegram_id: normalizedUserId,
        payload,
      })
      await ctx.reply(
        isRu
          ? '⭐ Оплата прошла, но звезда не дошла до автора. Напишите admin@t27.ai — начислим вручную.'
          : '⭐ The payment went through, but the star did not reach the author. Write to admin@t27.ai — we will credit it manually.'
      )
    }
    await ctx.scene?.leave?.()
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

      // Отправляем сообщение о вступлении в чат
      const { getSubScribeChannel } = await import(
        '@/handlers/getSubScribeChannel'
      )
      const channelId = await getSubScribeChannel(ctx)

      if (channelId) {
        const chatInviteMessage = isRu
          ? `Нейро путник, твоя подписка активирована ✨

Хочешь вступить в чат для общения и стать частью креативного сообщества?

В этом чате ты: 
🔹 можешь задавать вопросы и получать ответы (да, лично от меня)
🔹 делиться своими работами и быть в сотворчестве с другими нейро путниками  
🔹станешь частью тёплого, креативного комьюнити

Если да, нажимай на кнопку «Я с вами» и добро пожаловать 🤗 

А если нет, продолжай самостоятельно и нажми кнопку «Я сам»`
          : `Neuro traveler, your subscription is activated ✨

Want to join the chat for communication and become part of the creative community?

In this chat you:
🔹 can ask questions and get answers (yes, personally from me)
🔹 share your work and be in co-creation with other neuro travelers
🔹 become part of a warm, creative community

If yes, click the "I'm with you" button and welcome 🤗

If not, continue on your own and click the "I myself" button`

        await ctx.reply(chatInviteMessage, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu ? '👋 ☺️ Я с вами' : "👋 ☺️ I'm with you",
                  url: channelId.startsWith('@')
                    ? `https://t.me/${channelId.slice(1)}`
                    : channelId.startsWith('http')
                      ? channelId
                      : `https://t.me/${channelId}`,
                },
              ],
              [
                {
                  text: isRu ? '🙅🙅‍♀️ Я сам' : '🙅🙅‍♀️ I myself',
                  callback_data: 'continue_solo',
                },
              ],
            ],
          },
        })
      }
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

    // 📨 Логируем платеж в группу НейроМентор
    await telegramLogService.logPayment({
      telegramId: userId.toString(),
      username: username,
      amount: starsFromPayload,
      currency: 'XTR',
      stars: starsFromPayload,
      method: 'Telegram Stars',
      botName: botUsername,
    })

    logger.info(
      '[handleSuccessfulPayment] Leaving scene and showing main menu after successful payment...',
      { telegram_id: normalizedUserId }
    )

    // Очищаем информацию о выбранном платеже из сессии
    if (ctx.session) {
      ctx.session.selectedPayment = undefined
      logger.info(
        '[handleSuccessfulPayment] Cleared ctx.session.selectedPayment',
        { telegram_id: normalizedUserId }
      )
    }

    await ctx.scene?.leave?.()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  } catch (error) {
    logger.error('❌ [handleSuccessfulPayment] Error processing payment:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id: normalizedUserId,
      payload,
    })
    await ctx.scene?.leave?.()
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
