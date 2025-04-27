import { supabase } from '@/core/supabase'

export const incrementLimit = async ({
  telegram_id,
  amount,
}: {
  telegram_id: number
  amount: number
}) => {
  const { data, error } = await supabase
    .from('users')
    .select('limit')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error && error.code === 'PGRST116') {
    const { error: insertError } = await supabase
      .from('users')
      .insert({ telegram_id: telegram_id.toString(), limit: amount })

    if (insertError) {
      console.error('Ошибка при добавлении нового telegram_id:', insertError)
      return false
    }
  } else if (data) {
    const newLimit = data.limit + amount
    const { error: updateError } = await supabase
      .from('users')
      .update({ limit: newLimit })
      .eq('telegram_id', telegram_id.toString())

    if (updateError) {
      console.error('Ошибка при обновлении limit для telegram_id:', updateError)
      return false
    }
  } else {
    console.error('Ошибка при проверке существования telegram_id:', error)
    return false
  }

  return true
}
