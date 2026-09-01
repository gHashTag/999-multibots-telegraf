import { supabase } from './client'
import { logger } from '@/utils/logger'

/**
 * 🦸‍♂️ ИНКРЕМЕНТ СЧЁТЧИКА ГЕНЕРАЦИЙ СУПЕРГЕРОЕВ
 *
 * Атомарно увеличивает счётчик использований для текущего месяца
 * Использует upsert для безопасности при конкурентном доступе
 *
 * @param telegram_id - ID пользователя в Telegram
 * @returns true если инкремент успешен, false при ошибке
 */
export const incrementSuperheroGeneration = async (
  telegram_id: string | number
): Promise<boolean> => {
  const telegramIdStr = telegram_id.toString()
  const now = new Date()
  const currentMonth = now.getMonth() + 1 // 1-12
  const currentYear = now.getFullYear()

  logger.info(
    '[incrementSuperheroGeneration] Incrementing superhero generation count',
    {
      telegram_id: telegramIdStr,
      month: currentMonth,
      year: currentYear,
    }
  )

  try {
    // Сначала пытаемся использовать RPC функцию для атомарности
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'increment_superhero_generation_count',
      {
        user_telegram_id: telegramIdStr,
        target_month: currentMonth,
        target_year: currentYear,
      }
    )

    if (!rpcError && rpcData) {
      logger.info('[incrementSuperheroGeneration] RPC increment successful', {
        telegram_id: telegramIdStr,
        newCount: rpcData,
      })
      return true
    }

    // Fallback: используем upsert если RPC недоступна
    logger.warn(
      '[incrementSuperheroGeneration] RPC failed, using upsert fallback',
      {
        telegram_id: telegramIdStr,
        rpcError: rpcError?.message,
      }
    )

    // telegram_id,month,year is the composite key: read the current row and
    // insert-or-increment. The prior upsert-then-update was BROKEN -- supabase
    // upsert OVERWRITES the conflicting row's generation_count with the provided
    // 1 (it does not increment), then the follow-up set it to that 1 + 1 = 2, so
    // the monthly count was stuck at 2 forever and the 3/month free-superhero cap
    // (checkSuperheroGenerationUsage, maxUsage=3: currentUsage < 3) NEVER
    // triggered -> unlimited free superhero generations. Read-then-write is safe
    // here: this is only the RPC-unavailable fallback and the superhero path holds
    // an in-flight lock (avatarTransformQuotaGuard).
    const { data: existing, error: readError } = await supabase
      .from('superhero_generations')
      .select('generation_count')
      .eq('telegram_id', telegramIdStr)
      .eq('month', currentMonth)
      .eq('year', currentYear)
      .maybeSingle()

    if (readError) {
      logger.error('[incrementSuperheroGeneration] Fallback read error', {
        telegram_id: telegramIdStr,
        error: readError.message,
      })
      return false
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('superhero_generations')
        .update({
          generation_count: existing.generation_count + 1,
          last_generation_date: now.toISOString(),
        })
        .eq('telegram_id', telegramIdStr)
        .eq('month', currentMonth)
        .eq('year', currentYear)

      if (updateError) {
        logger.error('[incrementSuperheroGeneration] Update increment error', {
          telegram_id: telegramIdStr,
          error: updateError.message,
        })
        return false
      }
    } else {
      const { error: insertError } = await supabase
        .from('superhero_generations')
        .insert({
          telegram_id: telegramIdStr,
          month: currentMonth,
          year: currentYear,
          generation_count: 1,
          last_generation_date: now.toISOString(),
        })

      if (insertError) {
        logger.error('[incrementSuperheroGeneration] Fallback insert error', {
          telegram_id: telegramIdStr,
          error: insertError.message,
        })
        return false
      }
    }

    logger.info(
      '[incrementSuperheroGeneration] Fallback increment successful',
      {
        telegram_id: telegramIdStr,
        month: currentMonth,
        year: currentYear,
      }
    )

    return true
  } catch (error) {
    logger.error('[incrementSuperheroGeneration] Unexpected error', {
      telegram_id: telegramIdStr,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return false
  }
}
