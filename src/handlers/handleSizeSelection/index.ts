import { MyContext } from '@/interfaces'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { setAspectRatio } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
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
  await ctx.scene.enter(ModeEnum.MainMenu)
}
