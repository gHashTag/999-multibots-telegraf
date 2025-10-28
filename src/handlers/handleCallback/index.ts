import { sendGenericErrorMessage } from '@/menu'
import { logger } from '@/utils/enhancedLogger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext } from '../../interfaces'

export async function handleCallback(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  try {
    logger.debug('CASE: callback_query:data')

    if (!ctx.callbackQuery) {
      throw new Error('No callback query')
    }

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      await ctx
        .answerCbQuery()
        .catch(e => logger.error('Ошибка при ответе на callback query:', e))
      if (!data) {
        throw new Error('No callback query data')
      }

      return
    } else {
      throw new Error('No callback query data')
    }
  } catch (error) {
    logger.error('Ошибка при обработке callback query:', error)
    try {
      await ctx.answerCbQuery()
    } catch (e) {
      logger.error('Не удалось ответить на callback query:', e)
      await sendGenericErrorMessage(ctx, isRu, error)
    }
    throw error
  }
}
