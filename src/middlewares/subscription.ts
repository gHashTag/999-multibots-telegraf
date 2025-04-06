import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes.interface'

export const subscriptionMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> => {
  console.log('🎛 CASE:subscriptionMiddleware')
  try {
    if (!ctx.chat?.id) {
      throw new Error('Chat ID is not defined')
    }
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    await ctx.scene.enter(ModeEnum.SubscriptionCheckScene)

    await next()
  } catch (error) {
    console.error('Critical error in subscriptionMiddleware:', error)
    throw error
  }
}
