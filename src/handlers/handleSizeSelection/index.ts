import { type MyContext } from '@/interfaces'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { setAspectRatio } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import { mainMenu } from '@/menu'
import { ModeEnum } from '@/interfaces/modes'

export async function handleSizeSelection(ctx: MyContext, size: string) {
  ctx.session.selectedSize = size
  if (!ctx.from) {
    console.error('❌ Telegram ID не найден')
    return
  }
  await setAspectRatio(ctx.from.id, size)
  const isRu = isRussian(ctx)
  await ctx.reply(
    isRu ? `✅ Вы выбрали размер: ${size}` : `✅ You selected size: ${size}`
  )
  const mode = ctx.session.mode
  if (mode === ModeEnum.NeuroPhoto) {
    ctx.scene.enter(ModeEnum.NeuroPhoto)
  } else if (mode === 'text_to_image') {
    ctx.scene.enter('text_to_image')
  } else {
    console.log('CASE: Неизвестный режим')
    const telegram_id = ctx.from?.id?.toString() || ''
    const { subscriptionType, isExist } =
      await getReferalsCountAndUserData(telegram_id)

    if (isExist) {
      await mainMenu({
        isRu,
        subscription: subscriptionType,
        ctx,
      })
    } else {
      ctx.scene.enter('helpScene')
    }
  }
}
