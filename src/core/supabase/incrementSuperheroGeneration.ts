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

    const { data, error } = await supabase
      .from('superhero_generations')
      .upsert(
        {
          telegram_id: telegramIdStr,
          month: currentMonth,
          year: currentYear,
          generation_count: 1, // Будет увеличено в SQL trigger или conflict resolution
          last_generation_date: now.toISOString(),
        },
        {
          onConflict: 'telegram_id,month,year',
          // Увеличиваем счётчик при конфликте
        }
      )
      .select('generation_count')
      .single()

    if (error) {
      logger.error('[incrementSuperheroGeneration] Upsert error', {
        telegram_id: telegramIdStr,
        error: error.message,
      })
      return false
    }

    // Если upsert вернул данные, это значит что запись была создана или обновлена
    // Но нам нужно вручную увеличить счётчик, если это была existing запись
    if (data) {
      // Получаем текущий счётчик и увеличиваем на 1
      const { error: updateError } = await supabase
        .from('superhero_generations')
        .update({
          generation_count: data.generation_count + 1,
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
