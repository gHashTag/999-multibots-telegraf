import { supabase } from './client'
import { logger } from '@/utils/logger'

/**
 * Обновляет язык пользователя в базе данных
 * @param telegram_id - Telegram ID пользователя
 * @param language_code - Код языка ('ru' или 'en')
 * @returns Promise<boolean> - true если обновление успешно
 */
export const updateUserLanguage = async (
  telegram_id: string | number,
  language_code: 'ru' | 'en'
): Promise<boolean> => {
  logger.info(
    `[updateUserLanguage] Attempting to update language for telegram_id: ${telegram_id} to ${language_code}`
  )

  if (!telegram_id || !language_code) {
    logger.error('[updateUserLanguage] Missing telegram_id or language_code.', {
      telegram_id,
      language_code,
    })
    return false
  }

  try {
    const { error } = await supabase
      .from('users')
      .update({ language_code: language_code })
      .eq('telegram_id', telegram_id.toString())

    if (error) {
      logger.error(
        `[updateUserLanguage] Error updating language for telegram_id ${telegram_id}:`,
        {
          error: error.message,
          details: error.details,
          hint: error.hint,
        }
      )
      return false
    }

    logger.info(
      `[updateUserLanguage] Successfully updated language for telegram_id: ${telegram_id} to ${language_code}`
    )
    return true
  } catch (err) {
    logger.error(
      `[updateUserLanguage] Unexpected error for telegram_id ${telegram_id}:`,
      { error: err }
    )
    return false
  }
}
