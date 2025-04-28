import { supabase } from '@/core/supabase'

export const getUserData = async (telegram_id: string) => {
  const { data, error } = await supabase
    .from('users')
    .select(
      'username, first_name, last_name, company, position, designation, language_code, gender'
    )
    .eq('telegram_id', telegram_id.toString())
    .maybeSingle()

  if (error) {
    throw new Error(
      `Ошибка при получении данных пользователя: ${error.message}`
    )
  }

  return data
}
