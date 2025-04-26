import { type MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { checkFullAccess } from '@/handlers/checkFullAccess'
// import { sendSubscriptionRequiredMessage } from '@/utils/messageBuilder' // <-- Временно закомментировано

export const subscriptionMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> => {
  console.log('🎛 CASE:subscriptionMiddleware')
  try {
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    await ctx.scene.enter(ModeEnum.SubscriptionScene)

    await next()
  } catch (error) {
    console.error('Critical error in subscriptionMiddleware:', error)
    throw error
  }
}
