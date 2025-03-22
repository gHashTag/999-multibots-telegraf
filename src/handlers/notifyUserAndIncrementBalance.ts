import { isRussian } from '@/helpers'
import { incrementBalance } from '@/core/supabase'
import { MyContext } from '@/interfaces'

const BONUS_AMOUNT = 100

type NotifyUserAndIncrementBalanceParams = {
  ctx: MyContext
  finalUsername: string
  count: number
  newCount: number
  userData: any
  SUBSCRIBE_CHANNEL_ID: string
}

export async function notifyUserAndIncrementBalance({
  ctx,
  finalUsername,
  count,
  userData,
  newCount,
  SUBSCRIBE_CHANNEL_ID,
}: NotifyUserAndIncrementBalanceParams) {
  const messageToUser = isRussian(ctx)
    ? `🔗 Новый пользователь зарегистрировался по вашей ссылке: @${finalUsername}.\n🆔 Уровень аватара: ${count}\n🎁 За каждого приглашенного друга вы получаете дополнительные ${BONUS_AMOUNT} звезд для генерации!\n🤑 Ваш новый баланс: ${
        userData.balance + BONUS_AMOUNT
      }⭐️ `
    : `🔗 New user registered through your link: @${finalUsername}.\n🆔 Avatar level: ${count}\n🎁 For each friend you invite, you get additional ${BONUS_AMOUNT} stars for generation!\n🤑 Your new balance: ${
        userData.balance + BONUS_AMOUNT
      }⭐️`

  await ctx.telegram.sendMessage(ctx.session.inviteCode, messageToUser)

  await incrementBalance({
    telegram_id: ctx.session.inviteCode,
    amount: BONUS_AMOUNT,
  })

  const messageToChannel = isRussian(ctx)
    ? `🔗 Новый пользователь зарегистрировался в боте: @${finalUsername}. По реферальной ссылке от: @${userData.username}.\n🆔 Уровень аватара: ${newCount}\n🎁 Получил(a) бонус в размере ${BONUS_AMOUNT}⭐️ на свой баланс.\nСпасибо за участие в нашей программе!`
    : `🔗 New user registered in the bot: @${finalUsername}. Referred by: @${userData.username}.\n🆔 Avatar level: ${newCount}\n🎁 Received a bonus of ${BONUS_AMOUNT}⭐️ to their balance.\nThank you for participating in our program!`

  await ctx.telegram.sendMessage(`@${SUBSCRIBE_CHANNEL_ID}`, messageToChannel)
}
