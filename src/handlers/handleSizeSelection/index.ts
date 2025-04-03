import { MyContext } from '@/interfaces'
import { setAspectRatio } from '@/core/supabase'
import { isRussian } from '@/core/i18n/language'

export async function handleSizeSelection(ctx: MyContext, size: string) {
  ctx.session.selectedSize = size
  await setAspectRatio(ctx.from.id, size)
  const isRu = isRussian(ctx)
  await ctx.reply(
    isRu ? `✅ Вы выбрали размер: ${size}` : `✅ You selected size: ${size}`
  )
  const mode = ctx.session.mode
  console.log(mode, 'mode')
  if (mode === 'neuro_photo') {
    ctx.scene.enter('select_neuro_photo')
  } else if (mode === 'text_to_image') {
    ctx.scene.enter('text_to_image')
  } else {
    console.log('CASE: Неизвестный режим')
    await ctx.scene.enter('menuScene')
  }
}
