import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

interface BalanceResult {
  total_balance: number
  income: number
  outcome: number
  commission: number
}

/**
 * Получает баланс пользователя из расчета транзакций
 * @param telegram_id - ID пользователя в Telegram
 * @param bot_name - Имя бота (опционально)
 * @returns Баланс пользователя или null в случае ошибки
 */
export const getUserBalance = async (
  telegram_id: string | number,
  bot_name: string
): Promise<number> => {
  try {
    logger.info('🔍 Getting user balance', { telegram_id, bot_name })

    const { data, error } = await supabase.rpc('calculate_user_balance', {
      p_telegram_id: telegram_id.toString(),
      p_bot_name: bot_name,
    })

    if (error) {
      logger.error('❌ Error getting user balance', {
        error,
        telegram_id,
        bot_name,
      })
      throw error
    }

    if (!data || data.length === 0) {
      logger.info('ℹ️ No balance data found, returning 0', {
        telegram_id,
        bot_name,
      })
      return 0
    }

    const balance = data[0] as BalanceResult

    logger.info('✅ User balance retrieved', {
      telegram_id,
      bot_name,
      total_balance: balance.total_balance,
      income: balance.income,
      outcome: balance.outcome,
      commission: balance.commission,
    })

    return balance.total_balance
  } catch (error) {
    logger.error('❌ Error in getUserBalance', { error, telegram_id, bot_name })
    throw error
  }
}
