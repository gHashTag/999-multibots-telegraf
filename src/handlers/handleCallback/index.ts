import { sendGenericErrorMessage } from '@/menu'
import { isRussian } from '../../helpers/language'
import { MyContext } from '@/types'

export async function handleCallback(ctx: MyContext) {
  const isRu = isRussian(ctx)
  try {
    console.log('CASE: callback_query:data')

    if (!ctx.callbackQuery) {
      throw new Error('No callback query')
    }

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      await ctx
        .answerCbQuery()
        .catch(e => console.error('Ошибка при ответе на callback query:', e))
      if (!data) {
        throw new Error('No callback query data')
      }

      return
    } else {
      throw new Error('No callback query data')
    }
  } catch (error) {
    console.error('Ошибка при обработке callback query:', error)
    try {
      await ctx.answerCbQuery()
    } catch (e) {
      console.error('Не удалось ответить на callback query:', e)
      await sendGenericErrorMessage(ctx, isRu, error as Error)
    }
    throw error
  }
}
