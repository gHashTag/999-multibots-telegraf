import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/enhancedLogger'

export async function handleHelpCancel(ctx: MyContext): Promise<boolean> {
  logger.info('[handleHelpCancel] Started processing', {
    hasMessage: !!ctx.message,
    messageType: ctx.message ? Object.keys(ctx.message) : 'no message',
    telegramId: ctx.from?.id,
  })

  if (ctx.message && 'text' in ctx.message) {
    const isRu = isRussianFromState(ctx)
    const originalText = ctx.message?.text
    const text = originalText?.toLowerCase()

    logger.debug('[handleHelpCancel] Text analysis', {
      originalText,
      processedText: text,
      isRu,
      telegramId: ctx.from?.id,
      expectedCancel: isRu ? 'отмена' : 'cancel',
      expectedHelp: isRu ? 'справка по команде' : 'help for the command',
    })

    if (text === (isRu ? 'отмена' : 'cancel')) {
      logger.info('[handleHelpCancel] Cancel detected - processing cancellation', {
        telegramId: ctx.from?.id,
      })
      await ctx.reply(isRu ? '❌ Процесс отменён.' : '❌ Process cancelled.')
      logger.debug('[handleHelpCancel] Cancel message sent - entering MainMenu', {
        telegramId: ctx.from?.id,
      })
      ctx.scene.enter(ModeEnum.MainMenu)
      logger.info('[handleHelpCancel] Entered main menu scene', {
        telegramId: ctx.from?.id,
      })
      return true
    }

    if (text === (isRu ? 'справка по команде' : 'help for the command')) {
      logger.info('[handleHelpCancel] Help detected - processing help', {
        telegramId: ctx.from?.id,
      })
      await ctx.scene.enter('helpScene')
      await ctx.scene.leave()
      return true
    }

    logger.debug('[handleHelpCancel] No match found - continuing normal flow', {
      telegramId: ctx.from?.id,
      text,
    })
  } else {
    logger.debug('[handleHelpCancel] No text message - skipping', {
      telegramId: ctx.from?.id,
    })
  }
  return false
}
