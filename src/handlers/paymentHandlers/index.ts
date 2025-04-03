import { Context } from 'telegraf'
import { Scenes } from 'telegraf'
import { Message } from 'telegraf/typings/core/types/typegram'
import { MyContext } from '../../interfaces'
import { logger } from '@/utils/logger'
import { inngest } from '@/core/inngest/clients'
import { v4 as uuidv4 } from 'uuid'
import { updateUserSubscription } from '../../core/supabase'
import { getTranslation } from '@/core'
import { isRussian } from '@/core/i18n/language'
import { sendNotification } from '../../core/notifications'

// Используйте SessionFlavor для добавления сессий
interface SessionData {
  subscription: string
  telegram_id: number
  email: string
  buttons: any[]
}

type PaymentContext = Context &
  MyContext &
  Scenes.SceneContext & {
    session: SessionData
    message: {
      successful_payment?: {
        total_amount: number
        invoice_payload: string
      }
    } & Message
  }

async function processPayment(
  ctx: PaymentContext,
  amount: number,
  subscriptionName: string,
  stars: number
) {
  const userId = ctx.from?.id.toString()
  const username = ctx.from?.username
  const payload = ctx.message?.successful_payment?.invoice_payload
  const isRu = isRussian(ctx)
  const operationId = `payment-${userId}-${Date.now()}-${uuidv4()}`

  logger.info('🚀 Обработка платежа через Telegram', {
    description: 'Processing payment via Telegram',
    userId,
    username,
    amount,
    stars,
    subscriptionName,
    operationId,
  })

  // Обновляем подписку пользователя
  await updateUserSubscription(userId, subscriptionName)

  // Отправляем событие в централизованный процессор платежей
  await inngest.send({
    id: operationId,
    name: 'payment/process',
    data: {
      telegram_id: userId,
      paymentAmount: stars,
      type: 'income',
      description: `Покупка подписки ${subscriptionName}`,
      bot_name: ctx.botInfo.username,
      is_ru: isRu,
      metadata: {
        payment_method: 'Telegram',
        subscription: subscriptionName,
        operation_id: operationId,
        invoice_payload: payload,
        amount_paid: amount,
      },
    },
  })

  // Отправляем уведомление администратору
  await sendNotification(
    ctx,
    `💫 Пользователь: @${username} (ID: ${userId})\n` +
      `📦 Купил: ${subscriptionName}\n и получил ${stars} звезд 🌟`
  )

  // Отправляем сообщение пользователю
  await ctx.reply(
    isRu
      ? `✅ **Спасибо за покупку! На ваш баланс добавлено ${stars} ⭐️!**\n` +
          `✨ Теперь вы можете использовать свою подписку. Для этого перейдите в главное меню, нажав на кнопку ниже:\n` +
          `🏠 /menu\n` +
          `❓ Если у вас есть вопросы, не стесняйтесь обращаться за помощью /tech\n` +
          `Мы всегда рады помочь!`
      : `✅ **Thank you for your purchase! ${stars} stars added to your balance!**\n` +
          `✨ Now you can use your subscription. Go to the main menu by clicking the button below:\n` +
          `🏠 /menu\n` +
          `❓ If you have any questions, feel free to ask for help /tech\n` +
          `We are always happy to help!`,
    {
      parse_mode: 'Markdown',
    }
  )

  ctx.session.subscription = ''
  ctx.session.buttons = []
}

export async function handleSuccessfulPayment(ctx: PaymentContext) {
  try {
    if (!ctx.chat) {
      logger.error('❌ Update does not belong to a chat')
      return
    }

    const stars = ctx.message?.successful_payment?.total_amount || 0
    const subscriptionType = ctx.session.subscription

    logger.info('💫 Обработка успешного платежа', {
      description: 'Processing successful payment',
      userId: ctx.from.id,
      stars,
      subscriptionType,
    })

    const { buttons } = await getTranslation({
      key: 'subscriptionScene',
      ctx,
    })

    const selectedButton = buttons.find(
      button => button.callback_data === subscriptionType
    )

    if (selectedButton) {
      const { stars_price, callback_data } = selectedButton
      await processPayment(ctx, stars_price, callback_data, stars)
    } else {
      const operationId = `payment-${ctx.from.id}-${Date.now()}-${uuidv4()}`

      await inngest.send({
        id: operationId,
        name: 'payment/process',
        data: {
          telegram_id: ctx.from.id.toString(),
          paymentAmount: stars,
          type: 'income',
          description: 'Пополнение баланса через Telegram',
          bot_name: ctx.botInfo.username,
          is_ru: isRussian(ctx),
          metadata: {
            payment_method: 'Telegram',
            operation_id: operationId,
            invoice_payload: ctx.message?.successful_payment?.invoice_payload,
          },
        },
      })

      await ctx.reply(
        isRussian(ctx)
          ? `💫 Ваш баланс пополнен на ${stars}⭐️ звезд!`
          : `💫 Your balance has been replenished by ${stars}⭐️ stars!`
      )

      await sendNotification(
        ctx,
        `💫 Пользователь @${ctx.from.username} (ID: ${ctx.from.id}) пополнил баланс на ${stars} звезд!`
      )

      ctx.session.subscription = ''
      ctx.session.buttons = []
    }
  } catch (error) {
    logger.error('❌ Ошибка при обработке платежа:', {
      description: 'Error processing payment',
      error: error instanceof Error ? error.message : String(error),
      userId: ctx.from?.id,
    })
  }
}
