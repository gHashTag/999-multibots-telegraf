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
    // Production incident 2026-09-16 09:00:13 — telegram_id 391590340 was
    // answered in the wrong language and logged as "User not found". The row
    // existed: this account has MORE THAN ONE row in `users` (roughly 19 such
    // duplicate-row users are documented in this repository), and the previous
    // `.maybeSingle()` demands zero-or-one row, so two rows made PostgREST fail
    // with PGRST116. The saved language was discarded and the caller fell back
    // to a default — the users most likely to hit the wrong-language bug were
    // precisely the duplicated ones.
    //
    // Ordering is deliberate: newest `updated_at` first. The language_code the
    // user last chose lives on the row that was last written, and this matches
    // the ordering deduplicateUsers.ts already uses when it decides which of a
    // user's duplicate rows is canonical — so the language we read now is the
    // language that will survive deduplication.
    const { data, error } = await supabase
      .from('users')
      .select('language_code')
      .eq('telegram_id', telegram_id.toString())
      .order('updated_at', { ascending: false })
      .limit(1)

    if (error) {
      // Level is the routing decision: logger.error pages the owner's phone.
      // PGRST116 ("results contain N rows, requires 0 or 1") is caused by a
      // CUSTOMER having duplicate rows, not by our machinery failing, so it must
      // not wake anybody — it is a data-shape observation. It should no longer
      // be reachable now that we no longer call .maybeSingle(), but a stale
      // deploy or another single-row path can still produce it, and if it ever
      // returns we want the evidence in the logs without a 3am push.
      // Everything else — transport failure, permission denied, malformed
      // response — is OUR machinery and must still page.
      const isDuplicateRowShape = error.code === 'PGRST116'
      const throttleKey = `${telegram_id}:${error.code || 'unknown'}`
      if (shouldLogThrottled(throttleKey, Date.now())) {
        if (isDuplicateRowShape) {
          logger.warn(
            `[getUserLanguageFromDB] Duplicate rows for telegram_id ${telegram_id} (code: ${error.code}); not an incident, falling back to default language`,
            { code: error.code, details: error.details }
          )
          return null
        }
        logger.error(
          `[getUserLanguageFromDB] Database query FAILED for telegram_id ${telegram_id} (this is a database failure, NOT a missing user): ${error.message || 'Unknown error'} (code: ${error.code || 'N/A'})`,
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

    if (!Array.isArray(data)) {
      // A successful call must return rows. A non-array body means the response
      // was malformed — our machinery, not the customer's data. Page.
      const throttleKey = `malformed:${telegram_id}`
      if (shouldLogThrottled(throttleKey, Date.now())) {
        logger.error(
          `[getUserLanguageFromDB] Malformed database response for telegram_id ${telegram_id} (this is a database/transport failure, NOT a missing user): expected an array of rows, got ${typeof data}`
        )
      }
      return null
    }

    if (data.length === 0) {
      // Zero rows is a genuine "this user has no row" — a customer fact, not an
      // incident, so it stays at warn and pages nobody. The wording must stay
      // distinguishable from the database-failure branches above: before
      // 2026-09-16 both a failed query and a missing user were reported with the
      // same "User not found" sentence, so an outage of the `users` table would
      // have been reported, forever, as a stream of unknown users.
      const throttleKey = `notfound:${telegram_id}`
      if (shouldLogThrottled(throttleKey, Date.now())) {
        logger.warn(
          `[getUserLanguageFromDB] No user row exists for telegram_id: ${telegram_id} (database answered normally with zero rows)`
        )
      }
      return null
    }

    const language = data[0]?.language_code

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
