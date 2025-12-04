/**
 * Get Telegram ID and user info from InvId (Robokassa invoice ID)
 * Used for payment processing to get user information
 */

import { supabase } from './client'
import { logger } from '@/utils/logger'

export interface TelegramIdFromInvIdResult {
  telegram_id: string
  username?: string
  language_code?: string
  bot_name?: string
}

/**
 * Gets telegram_id and user info from payment InvId
 * @param invId Robokassa invoice ID
 * @returns User information or throws error if not found
 */
export async function getTelegramIdFromInvId(
  invId: string | number
): Promise<TelegramIdFromInvIdResult> {
  try {
    // Get payment info from payments_v2 table
    const { data: payment, error: paymentError } = await supabase
      .from('payments_v2')
      .select('telegram_id, bot_name')
      .eq('inv_id', invId.toString())
      .single()

    if (paymentError || !payment) {
      logger.error('Payment not found for InvId:', { invId, error: paymentError })
      throw new Error(`Payment not found for InvId: ${invId}`)
    }

    if (!payment.telegram_id) {
      throw new Error(`Telegram ID not found in payment for InvId: ${invId}`)
    }

    // Get user info from users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_id, username, language_code')
      .eq('telegram_id', payment.telegram_id)
      .single()

    if (userError || !user) {
      logger.warn('User not found, using payment data only:', {
        telegram_id: payment.telegram_id,
        error: userError,
      })
      // Return minimal data from payment if user not found
      return {
        telegram_id: payment.telegram_id,
        bot_name: payment.bot_name || undefined,
      }
    }

    return {
      telegram_id: user.telegram_id || payment.telegram_id,
      username: user.username || undefined,
      language_code: user.language_code || undefined,
      bot_name: payment.bot_name || undefined,
    }
  } catch (error) {
    logger.error('Error in getTelegramIdFromInvId:', {
      invId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

