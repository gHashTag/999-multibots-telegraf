import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MAIN_MENU, HELP_SCENE } from '@/constants/sceneIds'

export async function handleHelpCancel(ctx: MyContext): Promise<boolean> {
  console.log('🔍 [handleHelpCancel] STARTED', {
    hasMessage: !!ctx.message,
    messageType: ctx.message ? Object.keys(ctx.message) : 'no message',
  })

  if (ctx.message && 'text' in ctx.message) {
    const isRu = isRussianFromState(ctx)
    const originalText = ctx.message?.text
    const text = originalText?.toLowerCase()

    console.log('🔍 [handleHelpCancel] TEXT ANALYSIS', {
      originalText,
      processedText: text,
      isRu,
      telegramId: ctx.from?.id,
      expectedCancel: isRu ? 'отмена' : 'cancel',
      expectedHelp: isRu ? 'справка по команде' : 'help for the command',
    })

    if (text === (isRu ? 'отмена' : 'cancel')) {
      console.log(
        '✅ [handleHelpCancel] CANCEL DETECTED - Processing cancellation'
      )
      await ctx.reply(isRu ? '❌ Процесс отменён.' : '❌ Process cancelled.')
      console.log(
        '✅ [handleHelpCancel] CANCEL MESSAGE SENT - Entering MainMenu'
      )
      ctx.scene.enter(MAIN_MENU)
      console.log('✅ [handleHelpCancel] ENTERING MAIN MENU SCENE')
      return true
    }

    if (text === (isRu ? 'справка по команде' : 'help for the command')) {
      console.log('✅ [handleHelpCancel] HELP DETECTED - Processing help')
      // ✅ Входим в helpScene и остаёмся там (убрали .leave())
      await ctx.scene.enter(HELP_SCENE)
      return true
    }

    console.log('❌ [handleHelpCancel] NO MATCH FOUND - Continuing normal flow')
  } else {
    console.log('❌ [handleHelpCancel] NO TEXT MESSAGE - Skipping')
  }
  return false
}
