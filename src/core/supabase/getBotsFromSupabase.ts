/**
 * ⚠️ ЭТОТ МОДУЛЬ НЕ ИСПОЛНЯЕТСЯ.
 *
 * Список ботов берётся из переменных окружения, а не отсюда. Настоящих
 * импортёров НОЛЬ.
 *
 * Кроме того, таблиц bots в базе НЕТ — проверено
 * запросом к PostgREST (код 42P01). Даже если модуль подключить, он не
 * заработает без схемы.
 *
 * Замеры: docs/audit/table-seams.md, docs/audit/unregistered-functions.md.
 * Инструменты: scripts/probe-table-seams.cjs, scripts/probe-reachability.cjs.
 *
 * Не удаляю: это может быть незаконченная работа, а не мусор — решение о
 * судьбе за владельцем. Пометка нужна, чтобы следующий читатель не принял
 * код за рабочий и не потратил время, как потратил я.
 */
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
