import { supabase } from './client'
import { logger } from '@/utils/logger'

/**
 * Отмечает что пользователь использовал avatar transform функцию
 * @param telegram_id - ID пользователя в Telegram
 * @returns {Promise<boolean>} - true если запись успешна
 */
export const markAvatarTransformUsed = async (
  telegram_id: string | number
): Promise<boolean> => {
  const telegramIdStr = telegram_id.toString()

  logger.info('[markAvatarTransformUsed] Marking avatar transform as used', {
    telegram_id: telegramIdStr,
  })

  try {
    const { error } = await supabase
      .from('users')
      .update({ avatar_transform_used: true })
      .eq('telegram_id', telegramIdStr)

    if (error) {
      logger.error('[markAvatarTransformUsed] Database error', {
        telegram_id: telegramIdStr,
        error: error.message,
      })
      return false
    }

    logger.info('[markAvatarTransformUsed] Successfully marked as used', {
      telegram_id: telegramIdStr,
    })
    return true
  } catch (error) {
    logger.error('[markAvatarTransformUsed] Unexpected error', {
      telegram_id: telegramIdStr,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return false
  }
}
