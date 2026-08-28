import { MyContext } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'
import { sendInsufficientStarsMessage } from '@/price/helpers'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

/**
 * Checks if the user has enough balance for the operation.
 * If not, sends an insufficient balance message.
 *
 * @param ctx - Telegraf context
 * @param cost - Cost of the operation in stars
 * @returns true if balance is sufficient, false otherwise
 */
export async function checkUserBalance(
  ctx: MyContext,
  cost: number
): Promise<boolean> {
  const telegramId = ctx.from?.id?.toString()
  if (!telegramId) {
    logger.error('[checkUserBalance] No telegram ID found')
    return false
  }

  try {
    const currentBalance = await getUserBalance(telegramId)

    if (currentBalance < cost) {
      const isRu = isRussianFromState(ctx)
      logger.info('[checkUserBalance] Insufficient funds', {
        telegramId,
        currentBalance,
        cost,
      })
      await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
      return false
    }

    return true
  } catch (error) {
    logger.error('[checkUserBalance] Error checking user balance:', error)
    // In case of error, we default to false to prevent free usage in case of DB failure,
    // but we should probably inform the user.
    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '❌ Ошибка при проверке баланса. Пожалуйста, попробуйте позже.'
        : '❌ Error checking balance. Please try again later.'
    )
    return false
  }
}
