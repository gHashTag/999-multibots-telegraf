import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { Translation } from '@/interfaces/translations.interface'

/**
 * Получает переводы для подписок из базы данных
 */
export async function getSubscriptionTranslations(
  languageCode: string = 'ru',
  bot_name: string = 'neuro_blogger_bot'
): Promise<Translation[]> {
  try {
    logger.info('🔍 Fetching subscription translations', {
      description: 'Getting translations from database',
      languageCode,
      bot_name,
    })

    const { data: translations, error } = await supabase
      .from('translations')
      .select('*')
      .or('key.ilike.%subscription%,key.ilike.%plan%')
      .eq('language_code', languageCode)
      .eq('bot_name', bot_name)

    if (error) {
      logger.error('❌ Error fetching translations:', {
        description: 'Database error',
        error: error.message,
        languageCode,
        bot_name,
      })
      return []
    }

    if (!translations || translations.length === 0) {
      logger.warn('⚠️ No translations found:', {
        description: 'Empty translations result',
        languageCode,
        bot_name,
      })
      return []
    }

    logger.info('✅ Successfully fetched translations:', {
      description: 'Translations retrieved',
      count: translations.length,
      languageCode,
      bot_name,
    })

    return translations as Translation[]
  } catch (error) {
    logger.error('❌ Unexpected error:', {
      description: 'Error in getSubscriptionTranslations',
      error: error instanceof Error ? error.message : String(error),
      languageCode,
      bot_name,
    })
    return []
  }
}
