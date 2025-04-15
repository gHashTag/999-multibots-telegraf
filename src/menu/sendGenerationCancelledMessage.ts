import { getReferalsCountAndUserData } from '@/core/supabase'
import { MyContext } from '../interfaces'
import { mainMenu } from './mainMenu'
import { isRussian } from '@/helpers'

export const sendGenerationCancelledMessage = async (
  ctx: MyContext,
  userIsRu?: boolean
) => {
  const isRu = userIsRu !== undefined ? userIsRu : isRussian(ctx)
  const message = isRu ? '❌ Генерация отменена' : '❌ Generation cancelled'
  const telegram_id = ctx.from?.id?.toString() || ''
  const { count, subscription, level } =
    await getReferalsCountAndUserData(telegram_id)

  // Получаем клавиатуру из mainMenu и отправляем сообщение
  const menuKeyboard = mainMenu({
    isRu,
    inviteCount: count,
    subscription: subscription || 'stars',
    ctx,
    level,
  })

  await ctx.reply(message, {
    reply_markup: menuKeyboard.reply_markup,
  })
}
