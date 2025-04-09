import { TelegramId } from '@/types/telegram.interface'
import { supabase } from '.'

export const getVoiceId = async (telegram_id: TelegramId) => {
  const { data, error } = await supabase
    .from('users')
    .select('voice_id_elevenlabs')
    .eq('telegram_id', telegram_id.toString())
    .maybeSingle()
  if (error) {
    throw new Error(
      `Ошибка при получении voice_id_elevenlabs: ${error.message}`
    )
  }
  return data?.voice_id_elevenlabs
}
