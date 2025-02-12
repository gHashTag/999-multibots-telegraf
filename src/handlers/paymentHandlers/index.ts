import { Context, Scenes } from 'telegraf'
import { isRussian } from '@/helpers'
import { incrementBalance, setPayments } from '@/core/supabase'
import { Message } from 'telegraf/typings/core/types/typegram'

// Используйте SessionFlavor для добавления сессий
interface SessionData {
  subscription: string
  telegram_id: number
  email: string
}

type MyContext = Context &
  Scenes.SceneContext & {
    session: SessionData
    message: {
      successful_payment?: {
        total_amount: number
        invoice_payload: string
      }
    } & Message
  }

async function sendNotification(ctx: MyContext, message: string) {
  await ctx.telegram.sendMessage('-1476314188', message)
}

async function processPayment(
  ctx: MyContext,
  amount: number,
  subscriptionName: string,
  stars: number
) {
  const userId = ctx.from?.id.toString()
  const username = ctx.from?.username
  const payload = ctx.message?.successful_payment?.invoice_payload

  await incrementBalance({
    telegram_id: ctx.session.telegram_id.toString(),
    amount,
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
    user_id: userId,
    OutSum: amount.toString(),
    InvId: payload || '',
    currency: 'STARS',
    stars,
    status: 'COMPLETED',
    email: ctx.session.email,
    payment_method: 'Telegram',
    subscription: 'stars',
    bot_name: ctx.botInfo.username,
  })
}

export async function handleSuccessfulPayment(ctx: MyContext) {
  if (!ctx.chat) {
    console.error('Update does not belong to a chat')
    return
  }
  const isRu = isRussian(ctx)
  const stars = ctx.message?.successful_payment?.total_amount || 0
  const subscriptionType = ctx.session.subscription

  const subscriptionDetails = {
    neurophoto: { amount: 3000, name: 'NeuroPhoto' },
    neurobase: { amount: 7000, name: 'NeuroBase' },
    neuromeeting: { amount: 28000, name: 'NeuroMeeting' },
    neuroblogger: { amount: 75000, name: 'NeuroBlogger' },
    // neuromentor: { amount: 100000, name: 'NeuroMentor' },
  }

  if (subscriptionType in subscriptionDetails) {
    const { amount, name } = subscriptionDetails[subscriptionType]
    await processPayment(ctx, amount, name, stars)
  } else {
    await incrementBalance({
      telegram_id: ctx.session.telegram_id.toString(),
      amount: stars,
    })
    await ctx.reply(
      isRu
        ? `💫 Ваш баланс пополнен на ${stars}⭐️ звезд!`
        : `💫 Your balance has been replenished by ${stars}⭐️ stars!`
    )
    await sendNotification(
      ctx,
      `💫 Пользователь @${ctx.from.username} (ID: ${ctx.from.id}) пополнил баланс на ${stars} звезд!`
    )
    await setPayments({
      user_id: ctx.from.id.toString(),
      OutSum: stars.toString(),
      InvId: ctx.message?.successful_payment?.invoice_payload || '',
      currency: 'STARS',
      stars,
      status: 'COMPLETED',
      email: ctx.session.email,
      payment_method: 'Telegram',
      subscription: 'stars',
      bot_name: ctx.botInfo.username,
    })
  }
}
