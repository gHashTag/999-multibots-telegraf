import { supabase } from './client'
import { logger } from '@/utils/logger'

// 🔇 Throttle для ошибок - не логируем одну и ту же ошибку чаще чем раз в 60 секунд
// Exported for unit testing of the bounded-throttle behaviour.
export const errorThrottle = new Map<string, number>()
const ERROR_THROTTLE_MS = 60000 // 1 минута

// Returns true if this key has not logged within the throttle window (and then
// records `now`). It also prunes expired entries so `errorThrottle` cannot grow
// unbounded for the process lifetime: it is a process-wide singleton shared by
// the language middleware across every bot, and an entry older than the window
// is dead weight (the next event would log regardless). The sweep runs only
// when a log actually fires — i.e. rarely — so it stays cheap.
export function shouldLogThrottled(key: string, now: number): boolean {
  const last = errorThrottle.get(key) || 0
  if (now - last <= ERROR_THROTTLE_MS) return false
  errorThrottle.set(key, now)
  for (const [k, ts] of errorThrottle) {
    if (now - ts > ERROR_THROTTLE_MS) errorThrottle.delete(k)
  }
  return true
}

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
      // 🔇 Throttle: не спамим одной ошибкой
      const throttleKey = `${telegram_id}:${error.code || 'unknown'}`
      if (shouldLogThrottled(throttleKey, Date.now())) {
        logger.error(
          `[getUserLanguageFromDB] Error fetching language for telegram_id ${telegram_id}: ${error.message || 'Unknown error'} (code: ${error.code || 'N/A'})`,
          {
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          }
        )
      }
      return null
    }

    if (!data) {
      // 🔇 Throttle: не спамим "user not found" для каждого запроса
      const throttleKey = `notfound:${telegram_id}`
      if (shouldLogThrottled(throttleKey, Date.now())) {
        logger.warn(
          `[getUserLanguageFromDB] User not found for telegram_id: ${telegram_id}`
        )
      }
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
    // 🔇 Throttle: не спамим unexpected errors
    const throttleKey = `exception:${telegram_id}`
    if (shouldLogThrottled(throttleKey, Date.now())) {
      logger.error(
        `[getUserLanguageFromDB] Unexpected error for telegram_id ${telegram_id}: ${err instanceof Error ? err.message : String(err)}`,
        { error: err }
      )
    }
    return null
  }
}
