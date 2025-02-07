import {
  createUser,
  getUserByTelegramId,
  incrementBalance,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import { CreateUserData, MyContext } from '@/interfaces'
import bot from '@/core/bot'
import { getSubScribeChannel } from '@/handlers'
import { isRussian } from '@/helpers/language'
import { getUserPhotoUrl } from './getUserPhotoUrl'
import { verifySubscription } from './verifySubscription'

const BONUS_AMOUNT = 100

export const subscriptionMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> => {
  console.log('subscriptionMiddleware')
  const isRu = isRussian(ctx)
  try {
    if (
      !ctx.message ||
      !('text' in ctx.message) ||
      !ctx.message.text.startsWith('/start')
    ) {
      console.log('CASE: 🔄 Нет текста или нет /start')
      return await next()
    }

    if (!ctx.from) {
      console.error('No user data found in context')
      await ctx.reply('Error: No user data found')
      return
    }

    const inviteCode = ctx.message.text.split(' ')[1]
    console.log('inviteCode', inviteCode)
    ctx.session.inviteCode = inviteCode

    const {
      username,
      id: telegram_id,
      first_name,
      last_name,
      is_bot,
      language_code,
    } = ctx.from

    const finalUsername = username || first_name || telegram_id.toString()

    const existingUser = await getUserByTelegramId(ctx)

    const SUBSCRIBE_CHANNEL_ID = getSubScribeChannel(ctx)

    if (existingUser) {
      await verifySubscription(ctx, language_code, SUBSCRIBE_CHANNEL_ID)
      ctx.scene.enter('startScene')
      return
    }

    const photo_url = await getUserPhotoUrl(ctx, telegram_id)

    if (ctx.session.inviteCode) {
      const { count, userData } = await getReferalsCountAndUserData(
        ctx.session.inviteCode.toString()
      )

      ctx.session.inviter = userData.user_id

      await verifySubscription(ctx, language_code, SUBSCRIBE_CHANNEL_ID)

      const newCount = count + 1
      if (ctx.session.inviteCode) {
        await bot.telegram.sendMessage(
          ctx.session.inviteCode,
          isRu
            ? `🔗 Новый пользователь зарегистрировался по вашей ссылке: @${finalUsername}.\n🆔 Уровень аватара: ${count}\n🎁. За каждого приглашенного друга вы получаете дополнительные ${BONUS_AMOUNT} звезд для генерации!\n🤑 Ваш новый баланс: ${
                userData.balance + BONUS_AMOUNT
              }⭐️ `
            : `🔗 New user registered through your link: @${finalUsername}.🆔 Avatar level: ${count}\n🎁. For each friend you invite, you get additional ${BONUS_AMOUNT} stars for generation!\n🤑 Your new balance: ${
                userData.balance + BONUS_AMOUNT
              }⭐️`
        )
        await incrementBalance({
          telegram_id: inviteCode,
          amount: BONUS_AMOUNT,
        })
        await bot.telegram.sendMessage(
          `@${SUBSCRIBE_CHANNEL_ID}`,
          `🔗 Новый пользователь зарегистрировался в боте: @${finalUsername}. По реферальной ссылке от: @${userData.username}.\n🆔 Уровень аватара: ${newCount}\n🎁 Получил(a) бонус в размере ${BONUS_AMOUNT}⭐️ на свой баланс.\nСпасибо за участие в нашей программе!`
        )
      }
    } else {
      await verifySubscription(ctx, language_code, SUBSCRIBE_CHANNEL_ID)
      const { count } = await getReferalsCountAndUserData(
        telegram_id.toString()
      )
      await bot.telegram.sendMessage(
        `@${SUBSCRIBE_CHANNEL_ID}`,
        `🔗 Новый пользователь зарегистрировался в боте: @${finalUsername}.\n🆔 Уровень аватара: ${count}.`
      )
    }

    const userData = {
      username: finalUsername,
      telegram_id: telegram_id.toString(),
      first_name: first_name || null,
      last_name: last_name || null,
      is_bot: is_bot || false,
      language_code: language_code || 'en',
      photo_url,
      chat_id: ctx.chat?.id || null,
      mode: 'clean',
      model: 'gpt-4-turbo',
      count: 0,
      aspect_ratio: '9:16',
      balance: 100,
      inviter: ctx.session.inviter || null,
      token: ctx.telegram.token,
    }

    await createUser(userData as CreateUserData)

    await next()
  } catch (error) {
    console.error('Critical error in subscriptionMiddleware:', error)
    throw error
  }
}
