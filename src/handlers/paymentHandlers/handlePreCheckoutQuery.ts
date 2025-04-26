import { Context, NarrowedContext } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { logger } from '@/utils/logger'
import { type MyContext } from '@/interfaces'

export async function handlePreCheckoutQuery(
  ctx: NarrowedContext<MyContext, Update.PreCheckoutQueryUpdate>
): Promise<void> {
  logger.info('🛒 Received pre_checkout_query:', {
    pre_checkout_query: ctx.preCheckoutQuery,
    telegram_id: ctx.from.id,
  })
  try {
    await ctx.answerPreCheckoutQuery(true)
    logger.info('✅ Answered pre_checkout_query successfully', {
      pre_checkout_query_id: ctx.preCheckoutQuery.id,
    })
  } catch (error) {
    logger.error('❌ Error answering pre_checkout_query:', {
      error: error instanceof Error ? error.message : String(error),
      pre_checkout_query_id: ctx.preCheckoutQuery?.id,
    })
    try {
      await ctx.answerPreCheckoutQuery(false, 'Payment processing error')
    } catch (answerError) {
      logger.error('❌ Failed to send error answer for pre_checkout_query:', {
        error:
          answerError instanceof Error
            ? answerError.message
            : String(answerError),
      })
    }
  }
}
