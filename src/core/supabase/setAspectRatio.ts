import { TelegramId } from '@/interfaces/telegram.interface';
import { supabase } from '.'

export const setAspectRatio = async (
  telegram_id: TelegramId,
  aspect_ratio: string
) => {
  console.log(telegram_id, aspect_ratio, 'setAspectRatio')
  const { error } = await supabase
    .from('users')
    .update({ aspect_ratio: aspect_ratio })
    .eq('telegram_id', telegram_id.toString())

  if (error) {
    console.error('Ошибка при установке aspect_ratio для telegram_id:', error)
    return false
  }
  return true
}
