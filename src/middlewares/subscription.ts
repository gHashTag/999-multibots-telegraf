import { MyContext } from '@/interfaces'
import { logger } from '@/utils/enhancedLogger'
import { ModeEnum } from '@/interfaces/modes'
export const subscriptionMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> => {
  logger.debug('🎛 CASE:subscriptionMiddleware')
  try {
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    await ctx.scene.enter(ModeEnum.SubscriptionScene)

    await next()
  } catch (error) {
    logger.error('Critical error in subscriptionMiddleware:', error)
    throw error
  }
}
