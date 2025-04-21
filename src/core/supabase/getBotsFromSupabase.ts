import { isSupabaseConfigured } from '@/config'
import { supabaseAdmin } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Получает информацию о ботах из базы данных Supabase
 * @returns Массив с информацией о ботах
 */
export async function getBotsFromSupabase() {
  // Проверяем, настроен ли Supabase
  if (!isSupabaseConfigured) {
    logger.warn(
      'Supabase не настроен. Невозможно получить ботов из базы данных.'
    )
    return []
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bots')
      .select('*')
      .eq('is_active', true)

    if (error) {
      logger.error(`Ошибка при получении ботов из Supabase: ${error.message}`)
      return []
    }

    if (!data || data.length === 0) {
      logger.info('В Supabase не найдено активных ботов')
      return []
    }

    logger.info(`Получено ${data.length} ботов из Supabase`)
    return data
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Ошибка при получении ботов из Supabase: ${errorMessage}`)
    return []
  }
}
