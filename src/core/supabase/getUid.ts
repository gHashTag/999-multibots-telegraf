import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export const getUid = async (
  telegram_id: string | number
): Promise<{
  user_id: string | null
  username: string | null
} | null> => {
  try {
    if (!telegram_id) {
      logger.warn('No telegram_id provided to getUid')
      return null
    }

    const { data, error } = await supabase
      .from('users')
      .select('user_id, username, telegram_id')
      .eq('telegram_id', telegram_id.toString())

    if (error) {
      logger.error('Error getting user_id:', error)
      return null
    }

    return {
      user_id: data?.[0]?.user_id || null,
      username: data?.[0]?.username || null,
    }
  } catch (error) {
    logger.error('Error in getUid:', error)
    return null
  }
}
