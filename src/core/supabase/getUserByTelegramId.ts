import { supabase } from '.'

export async function getUserByTelegramId(telegram_id: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .single()

    if (error) {
      console.error('User not registered')
      return null
    }

    return data
  } catch (error) {
    console.error('Unexpected error fetching user by Telegram ID:', error)
    return null
  }
}
