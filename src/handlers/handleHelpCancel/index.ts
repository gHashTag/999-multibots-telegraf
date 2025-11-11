import { MyContext } from '@/interfaces'
import { CancelButtonService } from '@/services/CancelButtonService'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

/**
 * ✅ DEPRECATED: Используйте CancelButtonService.handleCancelAndMenu()
 *
 * Оставлено для обратной совместимости
 */
export async function handleHelpCancel(ctx: MyContext): Promise<boolean> {
  console.log('🔍 [handleHelpCancel] STARTED (using CancelButtonService)', {
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
    })

    // Проверка справки (оставляем, так как это специфично для handleHelpCancel)
    if (text === (isRu ? 'справка' : 'help') ||
        text === (isRu ? 'ℹ️ справка' : 'ℹ️ help') ||
        text === (isRu ? 'справка по команде' : 'help for the command')) {
      console.log('✅ [handleHelpCancel] HELP DETECTED - Processing help')
      await ctx.scene.enter('helpScene')
      return true
    }

    // Используем централизованную систему для отмены и главного меню
    const handled = await CancelButtonService.handleCancelAndMenu(ctx)
    if (handled) {
      console.log('✅ [handleHelpCancel] HANDLED by CancelButtonService')
      return true
    }

    console.log('❌ [handleHelpCancel] NO MATCH FOUND - Continuing normal flow')
  } else {
    console.log('❌ [handleHelpCancel] NO TEXT MESSAGE - Skipping')
  }
  return false
}
