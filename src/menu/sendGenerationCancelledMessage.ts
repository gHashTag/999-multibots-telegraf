import { getReferalsCountAndUserData } from '@/core/supabase'
import { MyContext } from '../interfaces'
import { mainMenu } from './mainMenu'
import { SubscriptionType } from '@/interfaces/subscription.interface'

export const sendGenerationCancelledMessage = async (
  ctx: MyContext,
  isRu: boolean
) => {
  const message = isRu ? '❌ Генерация отменена' : '❌ Generation cancelled'
  const telegram_id = ctx.from?.id?.toString() || ''
  const { count, subscription, level } = await getReferalsCountAndUserData(
    telegram_id
  )

  await ctx.reply(message, {
    reply_markup: {
      keyboard: (
        await mainMenu({
          isRu,
          subscription: subscription?.type || SubscriptionType.STARS,
          level,
          ctx,
          inviteCount: count,
        })
      ).reply_markup.keyboard,
    },
  })
}
