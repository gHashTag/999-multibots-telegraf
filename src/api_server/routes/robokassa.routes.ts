import express from 'express'
import { redactSensitiveHeaders } from '@/utils/redactHeaders'
import { Router } from 'express'
import { validateRobokassaSignature } from '@/core/robokassa'
import { getPaymentByInvId } from '@/core/supabase/payments'
import { supabaseAdmin } from '@/core/supabase'
import { PaymentStatus, PaymentType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { getRobokassaPassword2 } from '@/config'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { notifyBotOwners } from '@/core/supabase/notifyBotOwners'

const router: Router = express.Router()

// Константы для расчета звезд из суммы платежа
// ⚠️ ВАЖНО: Минимальная сумма Robokassa - 50-100₽
const PAYMENT_OPTIONS = [
  { amount: 100, stars: 43 }, // ✅ Минимальная безопасная сумма
  { amount: 500, stars: 217 },
  { amount: 1000, stars: 434 },
  { amount: 2000, stars: 869 },
  { amount: 5000, stars: 2173 },
  { amount: 10000, stars: 4347 },
]

const SUBSCRIPTION_PLANS = [
  {
    text: '🎨 NeuroPhoto',
    ru_price: 1110,
    stars_price: 476,
    callback_data: 'neurophoto',
  },
  {
    text: '📚 NeuroVideo',
    ru_price: 2999,
    stars_price: 1303,
    callback_data: 'neurovideo',
  },
  {
    text: '🤖 NeuroBlogger',
    ru_price: 75000,
    stars_price: 32608,
    callback_data: 'neuroblogger',
  },
]

const SUBSCRIPTION_AMOUNTS = SUBSCRIPTION_PLANS.reduce(
  (acc, plan) => {
    acc[plan.ru_price] = plan.callback_data
    return acc
  },
  {} as Record<number, string>
)

/**
 * Обработчик webhook от Robokassa (legacy endpoint)
 * POST /api/robokassa-result
 */
router.post(
  '/robokassa-result',
  express.urlencoded({ extended: true }) as any,
  async (req: any, res: any) => {
    return handlePaymentSuccess(req, res)
  }
)

/**
 * Обработчик webhook от Robokassa (primary endpoint)
 * POST /api/payment-success
 */
router.post(
  '/payment-success',
  express.urlencoded({ extended: true }) as any,
  async (req: any, res: any) => {
    return handlePaymentSuccess(req, res)
  }
)

/**
 * GET handler для тестирования доступности endpoint
 * GET /api/payment-success
 */
router.get('/payment-success', (req: any, res: any) => {
  console.log('🔍 [ROBOKASSA] GET /payment-success - Health check')
  res.json({
    status: 'ok',
    message: 'Robokassa webhook endpoint is available',
    timestamp: new Date().toISOString(),
    method: 'GET',
    note: 'Use POST for actual webhooks',
  })
})

async function handlePaymentSuccess(req: any, res: any) {
  // 🔍 DEBUG: Логируем ВСЁ что пришло
  console.log('═══════════════════════════════════════════════════════')
  console.log('💰 [ROBOKASSA WEBHOOK] INCOMING REQUEST')
  console.log('═══════════════════════════════════════════════════════')
  console.log('📍 URL:', req.originalUrl)
  console.log('📍 Method:', req.method)
  console.log('📍 IP:', req.ip || req.connection?.remoteAddress)
  console.log('📍 Headers:', JSON.stringify(req.headers, null, 2))
  console.log('📍 Body:', JSON.stringify(req.body, null, 2))
  console.log('📍 Query:', JSON.stringify(req.query, null, 2))
  console.log('═══════════════════════════════════════════════════════')

  try {
    logger.info('🔔 Received Robokassa webhook', {
      body: req.body,
      headers: redactSensitiveHeaders(req.headers),
    })

    if (!req.body) {
      logger.warn('❌ Empty request body in Robokassa webhook')
      return res.status(400).send('Missing request body')
    }

    const { OutSum, InvId, SignatureValue } = req.body

    if (!OutSum || !InvId || !SignatureValue) {
      logger.warn('❌ Missing required parameters in Robokassa webhook', {
        OutSum,
        InvId,
        SignatureValue: !!SignatureValue,
      })
      return res.status(400).send('Missing required parameters')
    }

    // Проверяем подпись
    const { getRobokassaPassword2 } = await import('@/config')
    const password2 = getRobokassaPassword2() || ''
    const isValidSignature = validateRobokassaSignature(
      OutSum,
      InvId,
      password2,
      SignatureValue
    )

    if (!isValidSignature) {
      logger.error('❌ Invalid Robokassa signature', {
        OutSum,
        InvId,
      })
      return res.status(400).send('Invalid signature')
    }

    logger.info('✅ Robokassa signature validated', {
      OutSum,
      InvId,
    })

    // Находим платеж в базе данных
    const { data: payment, error } = await getPaymentByInvId(InvId)

    if (error || !payment) {
      logger.error('❌ Payment not found in database', {
        InvId,
        error,
      })
      return res.status(404).send('Payment not found')
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      logger.info('ℹ️ Payment already processed', {
        InvId,
        status: payment.status,
      })
      return res.status(200).send('OK')
    }

    // ОТМЕТКА «ОПЛАЧЕНО» — ЭТО И ЕСТЬ НАЧИСЛЕНИЕ. Она должна стоять здесь.
    //
    // ПОПРАВКА К МОЕЙ ЖЕ ПРАВКЕ (PR #532). Я перенёс эту отметку вниз, под
    // вызов updateUserBalance, рассудив: «сначала начислить, потом пометить».
    // Рассуждение верное вообще, но неверное здесь — я не проверил, ЧТО
    // именно начисляет звёзды.
    //
    // Измерено по данным: баланс считается как сумма stars по строкам со
    // статусом COMPLETED. То есть **сама эта строка и есть начисление**.
    // На один номер счёта приходится ровно одна строка (16 681 уникальный
    // inv_id на 17 136 строк, дублей ноль) — вставка второй блокируется
    // уникальностью, и код это прямо обрабатывает как код 23505.
    //
    // Значит, updateUserBalance ниже — вторичный шаг: он делает то же самое
    // обновление по inv_id, сбрасывает кэш и пишет журнал. Его неудача НЕ
    // должна отменять начисление.
    //
    // Мой перенос делал ровно это: при отказе updateUserBalance строка
    // оставалась PENDING, и человек НЕ получал звёзды — хотя до правки
    // получал. Хуже всего, что отказ вероятнее всего у тех, у кого нет строки
    // в users, — то есть у тех, кого я и собирался защитить.
    // Compare-and-set the claim. The early "already COMPLETED" read above is
    // not atomic with this update, so two concurrent deliveries of the same
    // ResultURL — Robokassa retries, and a slow first request can overlap a
    // retry — both read PENDING and would both credit. .eq('status', PENDING)
    // makes the flip atomic in Postgres, and .select() reports whether this
    // delivery won; only the winner credits below.
    const { data: claimed, error: updateError } = await supabaseAdmin
      .from('payments_v2')
      .update({
        status: PaymentStatus.COMPLETED,
        payment_date: new Date().toISOString(),
      })
      .eq('inv_id', InvId)
      .eq('status', PaymentStatus.PENDING)
      .select('inv_id')

    if (updateError) {
      logger.error('❌ Error updating payment status', {
        InvId,
        error: updateError,
      })
      return res.status(500).send('Database error')
    }

    if (!claimed || claimed.length === 0) {
      // A concurrent delivery already flipped this payment to COMPLETED and
      // credited it. Acknowledge so Robokassa stops retrying; do NOT credit.
      logger.info('ℹ️ Payment already claimed by a concurrent delivery', {
        InvId,
      })
      return res.status(200).send(`OK${InvId}`)
    }

    logger.info('✅ Payment status updated to COMPLETED', {
      InvId,
      telegram_id: payment.telegram_id,
      // Колонка называется subscription_type; payment.subscription не
      // существует в payments_v2 и всегда писала в журнал undefined.
      subscription_type: (payment as { subscription_type?: string })
        .subscription_type,
    })

    // Определяем количество звезд и тип подписки из суммы платежа
    const numericOutSum = Number(OutSum)
    if (isNaN(numericOutSum) || numericOutSum <= 0) {
      logger.error('❌ Invalid OutSum value', { OutSum, InvId })
      return res.status(400).send('Invalid OutSum')
    }

    /**
     * Звёзды и тариф берутся ИЗ САМОЙ СТРОКИ ПЛАТЕЖА, а не восстанавливаются
     * из таблиц цен по сумме.
     *
     * Строку создаёт сцена в момент выставления счёта и пишет туда ровно те
     * значения, по которым счёт выставлен (rublePaymentScene: stars,
     * subscription_type, bot_name). Восстановление по сумме было обречено:
     * продаются BASIC 299 / PRO 699 / STUDIO 1999 (price/priceCalculator), а
     * SUBSCRIPTION_PLANS здесь знает 1110 / 2999 / 75000, PAYMENT_OPTIONS —
     * 100 / 500 / 1000 / 2000 / 5000 / 10000. Ни одна цена подписки не
     * совпадает, поэтому stars оставался нулём.
     *
     * Второе: поле называется subscription_type, а не subscription — в
     * payments_v2 колонки `subscription` нет вовсе, она есть только в
     * TS-интерфейсе. `payment.subscription` всегда undefined.
     *
     * Итог для человека был такой: купил подписку за 299 рублей, подписка
     * активировалась, а бот написал «Ваш баланс пополнен на 0⭐ звезд!» —
     * без подтверждения тарифа и без приглашения в чат сообщества.
     */
    let stars = Number(payment.stars) || 0
    let subscription =
      (payment as { subscription_type?: string }).subscription_type || ''

    // Таблицы цен остаются ЗАПАСНЫМ путём — на случай строки без stars
    // (старые записи), но приоритет всегда у того, что записано при выставлении.
    if (!stars && SUBSCRIPTION_AMOUNTS[numericOutSum]) {
      const plan = SUBSCRIPTION_PLANS.find(p => p.ru_price === numericOutSum)
      if (plan) {
        stars = plan.stars_price
        subscription = subscription || plan.callback_data
      }
    }
    // Если не подписка, проверяем стандартные варианты пополнения
    else if (!stars) {
      const option = PAYMENT_OPTIONS.find(opt => opt.amount === numericOutSum)
      if (option) {
        stars = option.stars
      }
    }

    logger.info('💰 Determined payment details', {
      InvId,
      OutSum,
      stars,
      subscription: subscription || 'none',
      isSubscription: !!subscription,
    })

    // Если это не подписка, а пополнение баланса - обновляем баланс пользователя
    if (!subscription && stars > 0) {
      const balanceUpdated = await updateUserBalance(
        payment.telegram_id.toString(),
        stars,
        PaymentType.MONEY_INCOME,
        `Пополнение баланса через Robokassa (InvId: ${InvId})`,
        {
          payment_method: 'Robokassa',
          bot_name: payment.bot_name,
          language: (payment as any).language || 'ru',
          inv_id: InvId,
          stars: stars,
        }
      )

      if (balanceUpdated) {
        logger.info('✅ User balance updated successfully', {
          InvId,
          telegram_id: payment.telegram_id,
          stars_added: stars,
        })
      } else {
        // ЗАПРОС НЕ РОНЯЕМ: звёзды уже начислены отметкой COMPLETED выше.
        //
        // Здесь неудачен вторичный шаг — обновление по inv_id, сброс кэша и
        // журнал. Ронять из-за него значило бы заставить платёжную систему
        // повторять успешный по сути вызов.
        //
        // Но и молчать нельзя: если этот шаг падает, что-то не так с
        // профилем человека (updateUserBalance отклоняет MONEY_INCOME без
        // строки в users) — это повод посмотреть, а не пропустить.
        logger.error(
          '⚠️ Вторичное обновление баланса не удалось (звёзды начислены отметкой)',
          {
            description:
              'secondary balance update failed; credit already applied via status',
            InvId,
            telegram_id: payment.telegram_id,
            stars,
            bot_name: payment.bot_name,
          }
        )
      }
    }

    // Referral reward -- for the invited person's FIRST top-up, not for their
    // registration. On our data, of 738 people who arrived by link only 33 (4%)
    // ever topped up, so paying for arrival means paying twenty-five times over
    // for one payer. Analysis: docs/audit/referral-economics.md.
    //
    // The function stays silent on its own while both amounts are zero
    // (REFERRAL_BONUS_STARS for the inviter, REFERRAL_INVITED_BONUS_STARS for
    // the invited), and cannot pay twice: the invoice id is built from the
    // "who -> whom" pair, one per side.
    //
    // It never brings the handler down: the top-up matters more than the reward.
    const { rewardReferralOnFirstTopUp } = await import(
      '@/core/referral/rewardOnFirstTopUp'
    )
    await rewardReferralOnFirstTopUp({
      invitedTelegramId: payment.telegram_id,
      botName: payment.bot_name || 'unknown_bot',
    })

    // Отправляем уведомления
    await sendPaymentSuccessNotification(payment, stars, subscription)

    // Отправляем уведомление в админ-группу
    await sendAdminGroupNotification(
      payment,
      numericOutSum,
      stars,
      subscription
    )

    // Отправляем уведомление владельцу бота
    if (payment.bot_name) {
      try {
        await notifyBotOwners(payment.bot_name, {
          username: (payment as any).username || 'User',
          telegram_id: payment.telegram_id.toString(),
          amount: OutSum,
          stars: stars,
          subscription: subscription || undefined,
        })
        logger.info('✅ Bot owner notification sent', {
          InvId,
          bot_name: payment.bot_name,
        })
      } catch (ownerError) {
        logger.error('❌ Failed to notify bot owners', {
          InvId,
          bot_name: payment.bot_name,
          error:
            ownerError instanceof Error
              ? ownerError.message
              : String(ownerError),
        })
      }
    }

    res.status(200).send(`OK${InvId}`)
  } catch (error) {
    logger.error('❌ Error processing Robokassa webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    res.status(500).send('Internal server error')
  }
}

/**
 * Отправляет уведомление в админ-группу об успешной оплате
 */
async function sendAdminGroupNotification(
  payment: any,
  amount: number,
  stars: number,
  subscription: string
) {
  try {
    const ADMIN_GROUP_ID = '-4166575919' // Группа для уведомлений об оплате

    const { getBotByName } = await import('@/core/bot')
    const result = getBotByName(payment.bot_name)

    if (!result.bot || result.error) {
      logger.error('❌ Bot not found for admin notification', {
        bot_name: payment.bot_name,
        error: result.error,
      })
      return
    }

    const bot = result.bot
    const isRu = payment.language === 'ru'
    const username = payment.username || 'User without username'

    const caption = isRu
      ? `💸 Пользователь @${username} (Telegram ID: ${payment.telegram_id}) оплатил ${amount} рублей и получил ${stars} звезд.${
          subscription ? `\n🎯 Подписка: ${subscription}` : ''
        }`
      : `💸 User @${username} (Telegram ID: ${payment.telegram_id}) paid ${amount} RUB and received ${stars} stars.${
          subscription ? `\n🎯 Subscription: ${subscription}` : ''
        }`

    await bot.telegram.sendMessage(ADMIN_GROUP_ID, caption)

    logger.info('✅ Admin group notification sent', {
      telegram_id: payment.telegram_id,
      admin_group: ADMIN_GROUP_ID,
    })
  } catch (error) {
    logger.error('❌ Error sending admin group notification', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: payment.telegram_id,
    })
  }
}

/**
 * Отправляет уведомление пользователю об успешной оплате
 */
async function sendPaymentSuccessNotification(
  payment: any,
  stars: number,
  subscription: string
) {
  try {
    const { getBotByName } = await import('@/core/bot')
    const result = getBotByName(payment.bot_name)

    if (!result.bot || result.error) {
      logger.error('❌ Bot not found for payment notification', {
        bot_name: payment.bot_name,
        telegram_id: payment.telegram_id,
        error: result.error,
      })
      return
    }

    const bot = result.bot
    const isRu = payment.language === 'ru'
    const isSubscription = !!subscription

    if (isSubscription) {
      // Сообщение об успешной оплате подписки
      await bot.telegram.sendMessage(
        payment.telegram_id,
        isRu
          ? `🎉 Ваша подписка "${subscription}" успешно оформлена и активна! Пользуйтесь ботом.`
          : `🎉 Your subscription "${subscription}" has been successfully activated! Enjoy the bot.`
      )

      // Отправляем сообщение о вступлении в чат
      const { getSubScribeChannel } = await import(
        '@/handlers/getSubScribeChannel'
      )
      // Создаем временный контекст для получения канала
      const tempCtx = { from: { language_code: payment.language } }
      const channelId = await getSubScribeChannel(tempCtx as any)

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

        await bot.telegram.sendMessage(payment.telegram_id, chatInviteMessage, {
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
      // Сообщение о пополнении баланса
      await bot.telegram.sendMessage(
        payment.telegram_id,
        isRu
          ? `💫 Ваш баланс пополнен на ${stars}⭐ звезд!`
          : `💫 Your balance has been replenished by ${stars}⭐ stars!`
      )
    }

    logger.info('✅ Payment success notification sent', {
      telegram_id: payment.telegram_id,
      bot_name: payment.bot_name,
      subscription_type: payment.subscription,
    })
  } catch (error) {
    logger.error('❌ Error sending payment success notification', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: payment.telegram_id,
      bot_name: payment.bot_name,
    })
  }
}

export default router
