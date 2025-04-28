import { MyContext } from '../../interfaces'
import { ModeEnum } from '@/interfaces/modes'

export async function handleHelpCancel(ctx: MyContext): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) {
    return false
  }

  const text = ctx.message.text.toLowerCase()
  const isRu = ctx.from?.language_code === 'ru'

  if (text === (isRu ? 'отмена' : 'cancel')) {
    await ctx.reply(isRu ? '❌ Процесс отменён.' : '❌ Process cancelled.')
    ctx.scene.enter(ModeEnum.MainMenu)
    return true
  }

  return false
}
