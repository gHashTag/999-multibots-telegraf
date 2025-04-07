import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '.'

export const getUserData = async (telegram_id: TelegramId) => {
  const { data, error } = await supabase
    .from('users')
    .select(
      'username, first_name, last_name, company, position, designation, language_code'
    )
    .eq('telegram_id', BigInt(telegram_id))
    .maybeSingle()

  if (error) {
    throw new Error(
      `Ошибка при получении данных пользователя: ${error.message}`
    )
  }

  return data
}
