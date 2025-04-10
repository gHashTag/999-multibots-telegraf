import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '.'

export const updateUserVoice = async (
  telegram_id: TelegramId,
  voice_id_elevenlabs: string
) => {
  const { error } = await supabase
    .from('users')
    .update({ voice_id_elevenlabs })
    .eq('telegram_id', telegram_id.toString())
  if (error) {
    throw new Error(`Ошибка при обновлении пользователя: ${error.message}`)
  }
}
