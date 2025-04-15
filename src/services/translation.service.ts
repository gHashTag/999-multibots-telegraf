import { logger } from '../utils/logger'
import { supabase } from '../core/supabase'

/**
 * Получает перевод по ключу и языку
 */
export async function getTranslation(key: string, is_ru: boolean): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('translations')
      .select('*')
      .eq('key', key)
      .eq('language_code', is_ru ? 'ru' : 'en')
      .single()

    if (error) {
      logger.error('❌ Error fetching translation:', {
        description: 'Failed to fetch translation',
        key,
        language: is_ru ? 'ru' : 'en',
        error: error.message
      })
      
      // Возвращаем ключ как fallback
      return key
    }

    return data.text
  } catch (error) {
    logger.error('❌ Error in translation service:', {
      description: 'Translation service error',
      key,
      language: is_ru ? 'ru' : 'en',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    // Возвращаем ключ как fallback
    return key
  }
} 