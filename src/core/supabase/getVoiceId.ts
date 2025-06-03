import { supabase } from '@/core/supabase'

export const getVoiceId = async (telegram_id: string) => {
  console.log('[getVoiceId] DEBUG: Looking for voice ID for user:', telegram_id)

  const { data, error } = await supabase
    .from('users')
    .select('voice_id_elevenlabs')
    .eq('telegram_id', telegram_id.toString())
    .maybeSingle()

  if (error) {
    console.error('[getVoiceId] ERROR:', error)
    throw new Error(
      `Ошибка при получении voice_id_elevenlabs: ${error.message}`
    )
  }

  console.log('[getVoiceId] DEBUG: Raw data from database:', data)
  console.log('[getVoiceId] DEBUG: Voice ID found:', data?.voice_id_elevenlabs)

  return data?.voice_id_elevenlabs
}
