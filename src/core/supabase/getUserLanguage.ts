import { supabase } from './client'
import { logger } from '@/utils/logger'

/**
 * Получает язык пользователя из базы данных
 * @param telegram_id - Telegram ID пользователя
 * @returns Promise<'ru' | 'en' | null> - язык пользователя или null если не найден
 */
export const getUserLanguageFromDB = async (
  telegram_id: string | number
): Promise<'ru' | 'en' | null> => {
  if (!telegram_id) {
    logger.error('[getUserLanguageFromDB] Missing telegram_id.')
    return null
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('language_code')
      .eq('telegram_id', telegram_id.toString())
      .maybeSingle()

    if (error) {
      logger.error(
        `[getUserLanguageFromDB] Error fetching language for telegram_id ${telegram_id}:`,
        {
          error: error.message,
          details: error.details,
        }
      )
      return null
    }

    if (!data) {
      logger.warn(
        `[getUserLanguageFromDB] User not found for telegram_id: ${telegram_id}`
      )
      return null
    }

    const language = data.language_code

    // Валидируем и нормализуем язык
    if (language === 'ru' || language === 'en') {
      return language
    }

    // Если в БД другой язык, возвращаем null для fallback
    if (language) {
      logger.info(
        `[getUserLanguageFromDB] Unsupported language "${language}" for telegram_id ${telegram_id}, will use fallback`
      )
    }

    return null
  } catch (err) {
    logger.error(
      `[getUserLanguageFromDB] Unexpected error for telegram_id ${telegram_id}:`,
      { error: err }
    )
    return null
  }
}
