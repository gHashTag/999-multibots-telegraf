import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export const getTelegramIdByUserId = async (
  userId: string
): Promise<number | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('user_id', userId)
      .single()

    if (error) {
      logger.error('Ошибка при получении telegram_id:', error)
      return null
    }

    return data?.telegram_id || null
  } catch (error) {
    logger.error('Ошибка в getTelegramIdByUserId:', error)
    throw error
  }
}
