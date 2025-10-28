import { getReferalsCountAndUserData } from '@/core/supabase'
import { MyContext } from '@/interfaces'
import { mainMenu } from '../menu'
import { logger } from '@/utils/enhancedLogger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export async function sendGenerationCancelledMessage(
  ctx: MyContext,
  reason: string
) {
  if (!ctx.from) {
    logger.error('❌ Telegram ID не найден')
    return
  }
  const telegram_id = ctx.from.id.toString()
  const { count, subscriptionType, level } = await getReferalsCountAndUserData(
    telegram_id
  )
  const isRu = isRussianFromState(ctx)
  const message = isRu
    ? `Генерация отменена по причине: ${reason}`
    : `Generation cancelled due to: ${reason}`

  await ctx.reply(
    message,
    await mainMenu({
      isRu,
      subscription: subscriptionType,
      ctx,
    })
  )
}
