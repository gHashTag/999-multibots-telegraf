import { TelegramId } from '@/interfaces/telegram.interface';
import { supabase } from '.'

export const incrementGeneratedImages = async (telegram_id: TelegramId) => {
  const { data, error } = await supabase
    .from('users')
    .select('count')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error && error.code === 'PGRST116') {
    const { error: insertError } = await supabase
      .from('users')
      .insert({ telegram_id: telegram_id.toString(), count: 1 })

    if (insertError) {
      console.error('Ошибка при добавлении нового telegram_id:', insertError)
      return false
    }
  } else if (data) {
    const newCount = data.count + 1
    const { error: updateError } = await supabase
      .from('users')
      .update({ count: newCount })
      .eq('telegram_id', telegram_id.toString())

    if (updateError) {
      console.error('Ошибка при обновлении count для telegram_id:', updateError)
      return false
    }
  } else {
    console.error('Ошибка при проверке существования telegram_id:', error)
    return false
  }

  return true
}
