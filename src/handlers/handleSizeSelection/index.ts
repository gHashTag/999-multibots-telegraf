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
  const success = await setAspectRatio(ctx.from.id, size)
  const isRu = isRussian(ctx)

  if (success) {
    await ctx.reply(
      isRu
        ? `✅ Размер изображения обновлен на: ${size}`
        : `✅ Image size updated to: ${size}`
    )
    ctx.session.isSizeFresh = true
  } else {
    await ctx.reply(
      isRu
        ? `⚠️ Не удалось обновить размер изображения. Попробуйте позже.`
        : `⚠️ Failed to update image size. Please try again later.`
    )
  }
  await ctx.scene.enter(ModeEnum.MainMenu)
}
