import { supabase } from '@/core/supabase'

export const getUserData = async (telegram_id: string) => {
  // telegram_id is NOT unique in `users` (~19 ids have 2-3 rows); `.maybeSingle()`
  // throws PGRST116 for them. Take the latest row instead (mirror getUserModel /
  // getUserByTelegramId), same null-on-absence contract.
  const { data: rows, error } = await supabase
    .from('users')
    .select(
      'username, first_name, last_name, company, position, designation, language_code, gender'
    )
    .eq('telegram_id', telegram_id.toString())
    .order('updated_at', { ascending: false })
    .limit(1)
  const data = rows?.[0] ?? null

  if (error) {
    throw new Error(
      `Ошибка при получении данных пользователя: ${error.message}`
    )
  }

  return data
}
