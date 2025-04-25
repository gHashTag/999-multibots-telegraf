import { Context } from 'telegraf'
import { logger } from '@/utils/logger'

export async function handlePreCheckoutQuery(ctx: Context) {
  try {
    await ctx.answerPreCheckoutQuery(true)
  } catch (error) {
    logger.error('Error when answering pre checkout query', error)
    try {
      await ctx.answerPreCheckoutQuery(false)
    } catch (secondError) {
      logger.error('Error when answering pre checkout query with false', secondError)
    }
  }
}
