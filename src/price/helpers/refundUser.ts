import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult } from '@/interfaces'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * Processes a refund operation for a user.
 * @param ctx The context object.
 * @param telegram_id The user's Telegram ID.
 * @param refundAmount The amount to refund (should be positive).
 * @param bot_name The name of the bot initiating the refund.
 * @returns Promise<BalanceOperationResult>
 */
export const refundUser = async (
  ctx: MyContext,
  telegram_id: number,
  refundAmount: number,
  bot_name: string
): Promise<BalanceOperationResult> => {
  try {
    // Validate refund amount
    if (refundAmount <= 0) {
      logger.warn('Attempted to refund non-positive amount:', { refundAmount })
      return {
        success: false,
        error: 'Refund amount must be positive',
        newBalance: await getUserBalance(telegram_id.toString()),
        paymentAmount: 0,
        modePrice: 0,
      }
    }

    const currentBalance = await getUserBalance(telegram_id.toString())

    // Update user balance by adding the refund amount
    const newBalance = await updateUserBalance(
      telegram_id.toString(),
      refundAmount // Передаем положительную сумму для возврата
    )

    // Проверяем результат updateUserBalance
    if (newBalance === null) {
      logger.error('Failed to update balance during refund for user:', {
        telegram_id,
      })
      return {
        success: false,
        error: 'Failed to update balance',
        newBalance: currentBalance,
        paymentAmount: refundAmount,
        modePrice: refundAmount,
      }
    }

    logger.info('Refund processed successfully:', {
      telegram_id,
      refundAmount,
      newBalance,
    })

    return {
      success: true,
      newBalance,
      paymentAmount: refundAmount,
      modePrice: refundAmount,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown refund error'
    logger.error('Error processing refund:', { error: errorMessage })
    const currentBalance = await getUserBalance(telegram_id.toString())
    return {
      success: false,
      error: errorMessage,
      newBalance: currentBalance,
      paymentAmount: refundAmount,
      modePrice: refundAmount,
    }
  }
}
