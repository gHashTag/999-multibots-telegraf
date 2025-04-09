import { MyContext } from '@/types'
import { ModeEnum } from '@/types/modes'
export async function handleHelpCancel(ctx: MyContext): Promise<boolean> {
  if (ctx.message && 'text' in ctx.message) {
    const isRu = ctx.from?.language_code === 'ru'
    const text = ctx.message?.text.toLowerCase()

    if (text === (isRu ? 'отмена' : 'cancel')) {
      await ctx.reply(isRu ? '❌ Процесс отменён.' : '❌ Process cancelled.')
      ctx.scene.enter(ModeEnum.MenuScene)
      return true
    }

    if (text === (isRu ? 'справка по команде' : 'help for the command')) {
      await ctx.scene.enter('helpScene')
      await ctx.scene.leave()
      return true
    }
  }
  return false
}
