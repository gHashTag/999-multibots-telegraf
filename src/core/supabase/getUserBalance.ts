import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'

interface BalanceResult {
  total_balance: number
  income: number
  outcome: number
  commission: number
}

/**
 * Получает баланс пользователя из расчета транзакций и таблицы users
 * @param telegram_id - ID пользователя в Telegram
 * @param bot_name - Имя бота (опционально)
 * @returns Баланс пользователя или null в случае ошибки
 */
export const getUserBalance = async (
  telegram_id: string | number,
  bot_name: string
): Promise<number> => {
  try {
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение баланса пользователя:', {
      description: 'Getting user balance',
      telegram_id: normalizedId,
      bot_name,
    })

    // Сначала проверяем баланс в таблице users
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', normalizedId)
      .single()

    if (userError) {
      logger.error('❌ Ошибка получения данных пользователя:', {
        description: 'Error getting user data',
        error: userError,
        telegram_id: normalizedId,
      })
      throw userError
    }

    // Если пользователь найден, возвращаем его баланс
    if (userData) {
      logger.info('✅ Баланс получен из таблицы users:', {
        description: 'Balance retrieved from users table',
        telegram_id: normalizedId,
        balance: userData.balance,
      })
      return userData.balance
    }

    // Если пользователь не найден, считаем баланс из транзакций
    const { data: transactionData, error: transactionError } =
      await supabase.rpc('calculate_user_balance', {
        p_telegram_id: normalizedId,
        p_bot_name: bot_name,
      })

    if (transactionError) {
      logger.error('❌ Ошибка расчета баланса:', {
        description: 'Error calculating balance',
        error: transactionError,
        telegram_id: normalizedId,
      })
      throw transactionError
    }

    const balance = transactionData?.[0] as BalanceResult

    if (!balance) {
      logger.info('ℹ️ Транзакции не найдены:', {
        description: 'No transactions found',
        telegram_id: normalizedId,
      })
      return 0
    }

    logger.info('✅ Баланс рассчитан из транзакций:', {
      description: 'Balance calculated from transactions',
      telegram_id: normalizedId,
      total_balance: balance.total_balance,
      income: balance.income,
      outcome: balance.outcome,
      commission: balance.commission,
    })

    return balance.total_balance
  } catch (error) {
    logger.error('❌ Ошибка в getUserBalance:', {
      description: 'Error in getUserBalance function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: normalizeTelegramId(telegram_id),
    })
    throw error
  }
}
