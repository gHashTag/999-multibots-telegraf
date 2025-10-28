import { TelegramId } from '@/interfaces/telegram.interface'
import { logger } from '@/utils/enhancedLogger'
import { supabase } from '@/core/supabase'

export async function getUserByTelegramIdString(telegram_id: TelegramId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id.toString())
      .single()

    if (error) {
      logger.error('Error fetching user by Telegram ID:', error)
      return null
    }

    return data
  } catch (error) {
    logger.error('Unexpected error fetching user by Telegram ID:', error)
    return null
  }
}
