import { supabase } from '@/core/supabase'
import { PRIMARY_FALLBACK_VOICE_ID, DEFAULT_VOICE_IDS } from '@/config'
import logger from '@/utils/logger'

export const getVoiceId = async (telegram_id: string) => {
  console.log('[getVoiceId] DEBUG: Looking for voice ID for user:', telegram_id)
  logger.info('[getVoiceId] Starting voice ID lookup', { telegram_id })

  const { data, error } = await supabase
    .from('users')
    .select('voice_id_elevenlabs')
    .eq('telegram_id', telegram_id.toString())
    .maybeSingle()

  if (error) {
    console.error('[getVoiceId] ERROR:', error)
    logger.error('[getVoiceId] Database error', {
      telegram_id,
      error: error.message,
    })
    throw new Error(
      `Ошибка при получении voice_id_elevenlabs: ${error.message}`
    )
  }

  console.log('[getVoiceId] DEBUG: Raw data from database:', data)
  console.log('[getVoiceId] DEBUG: Voice ID found:', data?.voice_id_elevenlabs)

  const userVoiceId = data?.voice_id_elevenlabs

  if (!userVoiceId) {
    logger.warn('[getVoiceId] No user voice ID found, using fallback', {
      telegram_id,
      fallbackVoiceId: PRIMARY_FALLBACK_VOICE_ID,
    })
    console.log(
      `[getVoiceId] No voice ID for user ${telegram_id}, using fallback: ${PRIMARY_FALLBACK_VOICE_ID}`
    )
    return PRIMARY_FALLBACK_VOICE_ID
  }

  logger.info('[getVoiceId] User voice ID found', {
    telegram_id,
    voiceId: userVoiceId,
  })

  return userVoiceId
}

/**
 * Получает резервный голос для случаев когда основной недоступен
 */
export const getFallbackVoiceId = (preferredLanguage?: 'ru' | 'en'): string => {
  // Можно в будущем добавить логику выбора голоса по языку
  logger.info('[getFallbackVoiceId] Returning primary fallback voice', {
    fallbackVoiceId: PRIMARY_FALLBACK_VOICE_ID,
    preferredLanguage,
  })
  return PRIMARY_FALLBACK_VOICE_ID
}

/**
 * Получает все доступные default голоса
 */
export const getAvailableDefaultVoices = () => {
  return DEFAULT_VOICE_IDS
}
