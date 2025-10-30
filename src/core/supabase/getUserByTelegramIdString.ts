import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '@/core/supabase'

export async function getUserByTelegramIdString(telegram_id: TelegramId) {
  try {
    // 🛡️ BEST PRACTICE: Robust query with duplicate handling
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id.toString())
      .order('updated_at', { ascending: false }) // Latest first
      .limit(10) // Safety limit

    if (error) {
      console.error('Error fetching user by Telegram ID:', error)
      return null
    }

    if (!users || users.length === 0) {
      console.log(`No user found for telegram_id ${telegram_id}`)
      return null
    }

    // 🚨 BEST PRACTICE: Handle duplicates gracefully
    if (users.length > 1) {
      console.warn(`DUPLICATE WARNING: Found ${users.length} users for telegram_id ${telegram_id}. Using most recent.`)
    }

    return users[0] // Most recent user
  } catch (error) {
    console.error('Unexpected error fetching user by Telegram ID:', error)
    return null
  }
}
