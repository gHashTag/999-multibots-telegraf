import { MyContext } from '@/interfaces'
import { setAspectRatio } from '@/core/supabase'
import { isRussian } from '@/helpers/language'
import { ModeEnum } from '@/price/helpers/modelsCost'

export async function handleSizeSelection(ctx: MyContext, size: string) {
  ctx.session.selectedSize = size
  if (!ctx.from?.id) {
    throw new Error('Telegram ID is not defined')
  }
  await setAspectRatio(ctx.from.id.toString(), size)
  const isRu = isRussian(ctx)
  await ctx.reply(
    isRu ? `✅ Вы выбрали размер: ${size}` : `✅ You selected size: ${size}`
  )
  const mode = ctx.session.mode
  console.log(mode, 'mode')
  if (mode === 'neuro_photo') {
    ctx.scene.enter('neuro_photo')
  } else if (mode === 'text_to_image') {
    ctx.scene.enter('text_to_image')
  } else {
    console.log('CASE: Неизвестный режим')
    await ctx.scene.enter(ModeEnum.MenuScene)
  }
}
