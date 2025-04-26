import type { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '@/core/supabase'

export async function getUserByTelegramIdString(telegram_id: TelegramId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id.toString())
      .single()

    if (error) {
      console.error('Error fetching user by Telegram ID:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Unexpected error fetching user by Telegram ID:', error)
    return null
  }
}
