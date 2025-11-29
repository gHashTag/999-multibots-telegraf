import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

/**
 * ✅ ЕДИНАЯ ФУНКЦИЯ для обработки кнопок "Справка" (Help) и "Отмена" (Cancel)
 * Обрабатывает ОБЕ кнопки в одной функции
 */
export async function handleHelpCancel(ctx: MyContext): Promise<boolean> {
  console.log('🔍 [handleHelpCancel] STARTED', {
    hasMessage: !!ctx.message,
    messageType: ctx.message ? Object.keys(ctx.message) : 'no message',
  })

  if (ctx.message && 'text' in ctx.message) {
    const isRu = isRussianFromState(ctx)
    const originalText = ctx.message?.text || ''
    const text = originalText.toLowerCase().trim()

    console.log('🔍 [handleHelpCancel] TEXT ANALYSIS', {
      originalText,
      processedText: text,
      isRu,
      telegramId: ctx.from?.id,
    })

    // ✅ ОБРАБОТКА "ОТМЕНА" (Cancel)
    if (
      text === 'отмена' ||
      text === 'cancel' ||
      text === '/cancel' ||
      text === '/отмена'
    ) {
      console.log(
        '✅ [handleHelpCancel] CANCEL DETECTED - Exiting to main menu'
      )
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
      return true
    }

    // ✅ ОБРАБОТКА "СПРАВКА" (Help)
    if (
      text === (isRu ? 'справка' : 'help') ||
      text === (isRu ? 'ℹ️ справка' : 'ℹ️ help') ||
      text === (isRu ? 'справка по команде' : 'help for the command') ||
      text === '/help' ||
      text === '/справка'
    ) {
      console.log('✅ [handleHelpCancel] HELP DETECTED - Processing help')
      await ctx.scene.enter('helpScene')
      return true
    }

    console.log('❌ [handleHelpCancel] NO MATCH FOUND - Continuing normal flow')
  } else {
    console.log('❌ [handleHelpCancel] NO TEXT MESSAGE - Skipping')
  }
  return false
}
