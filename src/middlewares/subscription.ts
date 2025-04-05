import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/price/helpers/modelsCost'

export const subscriptionMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> => {
  console.log('🎛 CASE:subscriptionMiddleware')
  try {
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    await ctx.scene.enter(ModeEnum.SubscriptionCheckScene)

    await next()
  } catch (error) {
    console.error('Critical error in subscriptionMiddleware:', error)
    throw error
  }
}
