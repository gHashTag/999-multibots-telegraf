/**
 * ⚠️ ЭТОТ МОДУЛЬ НЕ ИСПОЛНЯЕТСЯ.
 *
 * Ограничитель числа запросов к ИИ. Настоящих импортёров НОЛЬ: файл виден
 * только через реэкспорт в core/supabase/index.ts. То есть лимит не
 * применяется нигде.
 *
 * Кроме того, таблиц ai_requests в базе НЕТ — проверено
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
import { supabase } from '@/core/supabase'
import {
  SubscriptionType,
  getSubscriptionTier,
  TIER_LIMITS,
} from '@/interfaces/subscription.interface'

/**
 * Checks whether the user has exceeded their AI generation limit.
 *
 * Limits depend on the user's subscription tier:
 *   FREE   — 3 generations/day
 *   BASIC  — 50 generations/month
 *   PRO    — unlimited
 *   STUDIO — unlimited
 *
 * @returns `true` if the user has reached their limit (i.e. should be blocked).
 */
export async function isLimitAi(
  telegram_id: string,
  subscriptionType?: SubscriptionType | null
): Promise<boolean> {
  const tier = getSubscriptionTier(subscriptionType ?? null)
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS[SubscriptionType.FREE]

  // PRO, STUDIO, NEUROTESTER — unlimited
  if (limits.daily === null && limits.monthly === null) {
    return false
  }

  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // Получаем user_id по telegram_id из таблицы users
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('user_id')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (userError) {
    console.error('isLimitAi: Ошибка при получении user_id:', userError)
    return false
  }

  const user_id = userData?.user_id

  // --- BASIC tier: monthly limit ---
  if (limits.monthly !== null) {
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const { data: monthlyData, error: monthlyError } = await supabase
      .from('ai_requests')
      .select('count')
      .eq('user_id', user_id)
      .gte('created_at', firstOfMonth)

    if (monthlyError && monthlyError.code !== 'PGRST116') {
      console.error(
        'isLimitAi: Ошибка при получении месячного лимита:',
        monthlyError
      )
      return false
    }

    const monthlyTotal = (monthlyData || []).reduce(
      (sum: number, row: { count: number }) => sum + (row.count || 0),
      0
    )

    if (monthlyTotal >= limits.monthly) {
      return true // Monthly limit reached
    }

    // Record the request
    return await recordRequest(user_id, today)
  }

  // --- FREE tier: daily limit ---
  const dailyLimit = limits.daily ?? 3

  // Получаем последнюю запись для пользователя
  const { data: limitData, error: limitError } = await supabase
    .from('ai_requests')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (limitError && limitError.code !== 'PGRST116') {
    console.error('Ошибка при получении данных о лимите:', limitError)
    return false
  }

  if (!limitData || limitData.created_at.split('T')[0] !== today) {
    // Создаем новую запись на сегодня
    const { error: insertError } = await supabase
      .from('ai_requests')
      .insert({ user_id, count: 1, created_at: new Date().toISOString() })

    if (insertError) {
      console.error('Ошибка при создании новой записи:', insertError)
      return false
    }

    return false
  } else if (limitData.count < dailyLimit) {
    // Обновляем существующую запись
    const { error: updateError } = await supabase
      .from('ai_requests')
      .update({ count: limitData.count + 1 })
      .eq('id', limitData.id)

    if (updateError) {
      console.error('Ошибка при обновлении записи:', updateError)
      return false
    }

    return false
  }

  return true
}

/**
 * Records a single AI request for monthly-limited tiers.
 * @returns `false` (request is allowed).
 */
async function recordRequest(user_id: string, today: string): Promise<boolean> {
  const { data: existingData, error: fetchError } = await supabase
    .from('ai_requests')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('recordRequest: Ошибка при получении данных:', fetchError)
    return false
  }

  if (!existingData || existingData.created_at.split('T')[0] !== today) {
    const { error: insertError } = await supabase
      .from('ai_requests')
      .insert({ user_id, count: 1, created_at: new Date().toISOString() })

    if (insertError) {
      console.error('recordRequest: Ошибка при создании записи:', insertError)
    }
  } else {
    const { error: updateError } = await supabase
      .from('ai_requests')
      .update({ count: existingData.count + 1 })
      .eq('id', existingData.id)

    if (updateError) {
      console.error('recordRequest: Ошибка при обновлении записи:', updateError)
    }
  }

  return false
}
