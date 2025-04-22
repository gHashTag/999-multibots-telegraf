import { supabase } from '@/core/supabase/client'
import { logger } from '@/utils/logger'

/**
 * Updates the user's star balance in the database.
 * @param telegramId The user's Telegram ID.
 * @param amount The amount to add to the balance (can be negative to subtract).
 * @returns The new balance, or null if the user was not found or an error occurred.
 */
export async function updateUserBalance(
  telegramId: string,
  amount: number
): Promise<number | null> {
  if (!telegramId) {
    logger.error({
      message: '[UpdateUserBalance] Missing telegramId',
      function: 'updateUserBalance',
    })
    return null
  }

  if (typeof amount !== 'number' || isNaN(amount)) {
    logger.error({
      message: '[UpdateUserBalance] Invalid amount provided',
      telegramId,
      amount,
      function: 'updateUserBalance',
    })
    return null
  }

  // Fetch the current balance first
  const { data: userData, error: fetchError } = await supabase
    .from('users')
    .select('stars')
    .eq('telegram_id', telegramId)
    .single()

  if (fetchError || !userData) {
    logger.error({
      message: '[UpdateUserBalance] Error fetching user or user not found',
      telegramId,
      error: fetchError?.message,
      function: 'updateUserBalance',
    })
    return null
  }

  const currentBalance = userData.stars ?? 0
  const newBalance = currentBalance + amount

  // Ensure balance doesn't go below zero
  const finalBalance = Math.max(0, newBalance)

  const { data: updateData, error: updateError } = await supabase
    .from('users')
    .update({ stars: finalBalance })
    .eq('telegram_id', telegramId)
    .select('stars') // Select the updated balance
    .single()

  if (updateError || !updateData) {
    logger.error({
      message: '[UpdateUserBalance] Error updating user balance',
      telegramId,
      amount,
      error: updateError?.message,
      function: 'updateUserBalance',
    })
    return null
  }

  logger.info({
    message: `[UpdateUserBalance] User balance updated successfully`,
    telegramId,
    amount,
    balanceBefore: currentBalance,
    balanceAfter: updateData.stars,
    function: 'updateUserBalance',
  })

  return updateData.stars // Return the actual updated balance
}
