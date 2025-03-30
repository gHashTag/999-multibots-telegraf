import { Context, Scenes } from 'telegraf'
import { isRussian } from '@/helpers'
import {
  incrementBalance,
  setPayments,
  getGroupByBotName,
  getTranslation,
} from '@/core/supabase'
import { Message } from 'telegraf/typings/core/types/typegram'
import { updateUserSubscription } from '@/core/supabase/updateUserSubscription'
import { MyContext } from '@/interfaces'

import { createBotByName } from '@/core/bot'
// Используйте SessionFlavor для добавления сессий
interface SessionData {
  subscription: string
  telegram_id: number
  email: string
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

async function sendNotification(ctx: MyContext, message: string) {
  try {
    const botData = createBotByName(ctx.botInfo.username)
    if (!botData) {
      console.error('Bot token not found')
      return
    }
    const { bot, groupId } = botData
    console.log('CASE: ctx.botInfo', ctx.botInfo)
    console.log('CASE: ctx.botInfo.username', ctx.botInfo.username)
    const group = await getGroupByBotName(ctx.botInfo.username)
    console.log('CASE: group', group)
    if (!group) {
      console.error('Group not found')
      return
    }

    await bot.telegram.sendMessage(`@${groupId}`, message)
  } catch (error) {
    console.error('Error sending notification:', error)
  }
}

async function processPayment(
  ctx: PaymentContext,
  amount: number,
  subscriptionName: string,
  stars: number
) {
  const userId = ctx.from?.id.toString()
  console.log('CASE: userId', userId)
  const username = ctx.from?.username
  console.log('CASE: username', username)
  console.log(
    'CASE: ctx.message?.successful_payment',
    ctx.message?.successful_payment
  )
  const payload = ctx.message?.successful_payment?.invoice_payload
  console.log('CASE: payload', payload)

  await updateUserSubscription(userId, subscriptionName)

  await setPayments({
    telegram_id: userId,
    OutSum: amount.toString(),
    InvId: payload || '',
    currency: 'STARS',
    stars,
    status: 'COMPLETED',
    email: ctx.session.email,
    payment_method: 'Telegram',
    subscription: 'stars',
    bot_name: ctx.botInfo.username,
    language: ctx.from?.language_code,
  })

  await incrementBalance({
    telegram_id: userId,
    amount,
  })

  await sendNotification(
    ctx,
    `💫 Пользователь: @${username} (ID: ${userId})\n` +
      `📦 Купил: ${subscriptionName}\n и получил ${stars} звезд 🌟`
  )
  const isRu = isRussian(ctx)
  await ctx.reply(
    isRu
      ? `✅ **Спасибо за покупку! На ваш баланс добавлено ${stars} ⭐️!**\n` +
          `✨ Теперь вы можете использовать свою подписку. Для этого перейдите в главное меню, нажав на кнопку ниже:\n` +
          `🏠 /menu\n` +
          `❓ Если у вас есть вопросы, не стесняйтесь обращаться за помощью /tech\n` +
          `Мы всегда рады помочь!`
      : `✅ **Thank you for your purchase! ${stars} stars added to your balance!**\n` +
          `✨ Now you can use your subscription. To do this, go to the main menu by clicking the button below:\n` +
          `🏠 /menu\n` +
          `❓ If you have any questions, feel free to ask for help /tech\n` +
          `We're always here to assist you!`,
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
      console.error('Update does not belong to a chat')
      return
    }
    const isRu = isRussian(ctx)
    const stars = ctx.message?.successful_payment?.total_amount || 0
    const subscriptionType = ctx.session.subscription
    console.log('CASE: subscriptionType', subscriptionType)
    const { buttons } = await getTranslation({
      key: 'subscriptionScene',
      ctx,
    })
    console.log('CASE: buttons', buttons)

    const selectedButton = buttons.find(
      button => button.callback_data === subscriptionType
    )
    console.log('CASE: selectedButton', selectedButton)

    if (selectedButton) {
      console.log('CASE: subscriptionType in buttons', selectedButton)
      const { stars_price, callback_data } = selectedButton
      await processPayment(ctx, stars_price, callback_data, stars)
    } else {
      console.log('CASE: subscriptionType not in buttons', selectedButton)
      await incrementBalance({
        telegram_id: ctx.from.id.toString(),
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
        telegram_id: ctx.from.id.toString(),
        OutSum: stars.toString(),
        InvId: ctx.message?.successful_payment?.invoice_payload || '',
        currency: 'STARS',
        stars,
        status: 'COMPLETED',
        email: ctx.session.email,
        payment_method: 'Telegram',
        subscription: 'stars',
        bot_name: ctx.botInfo.username,
        language: ctx.from?.language_code,
      })
      ctx.session.subscription = ''
      ctx.session.buttons = []
    }
  } catch (error) {
    console.error('Error processing payment:', error)
  }
}
