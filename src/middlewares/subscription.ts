import { MyContext } from '@/types'
import { ModeEnum } from '@/types/modes'
import { getUserByTelegramIdString, getSubScribeChannel } from '@/core/supabase'
import { verifySubscription } from '@/middlewares/verifySubscription'
import { isDev } from '@/helpers'

export const subscriptionMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> => {
  console.log('🎛 CASE:subscriptionMiddleware')
  try {
    if (!ctx.chat?.id) {
      throw new Error('Chat ID is not defined')
    }

    // Send typing action
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

    // Check if user exists
    if (!ctx.from?.id) {
      await ctx.scene.enter(ModeEnum.CreateUserScene)
      return
    }

    const existingUser = await getUserByTelegramIdString(ctx.from.id.toString())
    if (!existingUser) {
      await ctx.scene.enter(ModeEnum.CreateUserScene)
      return
    }

    // Check subscription
    const subscription = existingUser.subscription
    if (subscription !== 'stars') {
      if (isDev) {
        await next()
        return
      }

      const SUBSCRIBE_CHANNEL_ID = await getSubScribeChannel(ctx)
      if (!SUBSCRIBE_CHANNEL_ID) {
        await ctx.reply(
          existingUser.language_code === 'ru'
            ? '❌ Не удалось получить ID канала подписки'
            : '❌ Failed to get subscribe channel ID'
        )
        return
      }

      const isSubscribed = await verifySubscription(
        ctx,
        existingUser.language_code,
        SUBSCRIBE_CHANNEL_ID
      )

      if (!isSubscribed) {
        return
      }
    }

    // If all checks pass, continue to next middleware
    await next()
  } catch (error) {
    console.error('Critical error in subscriptionMiddleware:', error)
    throw error
  }
}
