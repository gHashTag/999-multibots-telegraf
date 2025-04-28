import { supabase } from './client'
import { logger } from '@/utils/logger'

/**
 * Updates the gender for a specific user in the users table.
 * @param telegram_id - The Telegram ID of the user.
 * @param gender - The gender to set ('male', 'female', or other).
 * @returns {Promise<boolean>} - True if update was successful, false otherwise.
 */
export const updateUserGender = async (
  telegram_id: string | number,
  gender: string
): Promise<boolean> => {
  logger.info(
    `[updateUserGender] Attempting to update gender for telegram_id: ${telegram_id} to ${gender}`
  )

  if (!telegram_id || !gender) {
    logger.error('[updateUserGender] Missing telegram_id or gender.', {
      telegram_id,
      gender,
    })
    return false
  }

  const { error } = await supabase
    .from('users')
    .update({ gender: gender })
    .eq('telegram_id', telegram_id.toString())

  if (error) {
    logger.error(
      `[updateUserGender] Error updating gender for telegram_id ${telegram_id}:`,
      {
        error: error.message,
        details: error.details,
        hint: error.hint,
      }
    )
    return false
  }

  logger.info(
    `[updateUserGender] Successfully updated gender for telegram_id: ${telegram_id}`
  )
  return true
}
