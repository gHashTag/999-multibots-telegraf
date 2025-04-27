import { supabase } from './'

export async function getUserById(telegram_id: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
  return data[0]
}
