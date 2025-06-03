import { checkVoiceExists } from '@/core/elevenlabs'
import { supabase } from '@/core/supabase'

/**
 * Validates if a voice ID exists and is still available
 * If not, clears it from the database
 */
export async function validateAndCleanVoiceId(
  voiceId: string,
  telegramId: string
): Promise<boolean> {
  try {
    console.log(
      '[VoiceValidation] DEBUG: Starting validation for voice ID:',
      voiceId
    )
    console.log('[VoiceValidation] DEBUG: User telegram ID:', telegramId)

    const voiceExists = await checkVoiceExists(voiceId)

    if (!voiceExists) {
      console.error(
        `[VoiceValidation] Voice ID ${voiceId} no longer exists for user ${telegramId}`
      )

      // Clear the invalid voice ID from database
      try {
        await supabase
          .from('users')
          .update({ voice_id_elevenlabs: null })
          .eq('telegram_id', telegramId)
        console.log(
          `[VoiceValidation] Cleared invalid voice ID ${voiceId} for user ${telegramId}`
        )
      } catch (dbError) {
        console.error(
          '[VoiceValidation] Error clearing invalid voice ID from database:',
          dbError
        )
      }

      return false
    }

    console.log(
      '[VoiceValidation] DEBUG: Voice validation successful for:',
      voiceId
    )
    return true
  } catch (error) {
    console.error('[VoiceValidation] Error validating voice ID:', error)
    return false
  }
}

/**
 * Gets error message for missing or invalid voice avatar
 */
export function getVoiceAvatarErrorMessage(isRu: boolean): string {
  return isRu
    ? '❌ Ваш голосовой аватар больше не доступен или не создан. Пожалуйста, создайте новый голосовой аватар используя 🎤 Голос для аватара в главном меню.'
    : '❌ Your voice avatar is no longer available or not created. Please create a new voice avatar using 🎤 Voice for avatar in the main menu.'
}

/**
 * Gets message prompting user to create voice avatar
 */
export function getCreateVoiceAvatarMessage(isRu: boolean): string {
  return isRu
    ? '🎯 Для корректной работы обучите аватар используя 🎤 Голос для аватара в главном меню'
    : '🎯 For correct operation, train the avatar using 🎤 Voice for avatar in the main menu'
}
