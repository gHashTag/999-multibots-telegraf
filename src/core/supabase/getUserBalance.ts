import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'

interface BalanceResult {
  total_balance: string
  income: string
  outcome: string
  commission: string
}

/**
 * Получает баланс пользователя из расчета транзакций в таблице payments_v2
 * @param telegram_id - ID пользователя в Telegram
 * @param bot_name - Имя бота (опционально)
 * @returns Баланс пользователя или 0 в случае ошибки
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

    // Преобразуем telegram_id в число для вызова функции базы данных
    const numericId = parseInt(normalizedId, 10)
    if (isNaN(numericId)) {
      logger.error('❌ Некорректный формат telegram_id:', {
        description: 'Invalid telegram_id format',
        telegram_id: normalizedId,
      })
      return 0
    }

    // Получаем баланс из таблицы payments_v2
    const { data: balanceData, error: balanceError } = await supabase.rpc(
      'calculate_user_balance',
      {
        p_telegram_id: numericId,
        p_bot_name: bot_name,
      }
    )

    if (balanceError) {
      logger.error('❌ Ошибка расчета баланса:', {
        description: 'Error calculating balance',
        error: balanceError,
        telegram_id: normalizedId,
      })
      return 0
    }

    const balance = balanceData?.[0] as BalanceResult

    if (!balance) {
      logger.info('ℹ️ Транзакции не найдены:', {
        description: 'No transactions found',
        telegram_id: normalizedId,
      })
      return 0
    }

    // Преобразуем строковые значения в числа
    const totalBalance = parseFloat(balance.total_balance)
    const income = parseFloat(balance.income)
    const outcome = parseFloat(balance.outcome)
    const commission = parseFloat(balance.commission)

    // Проверяем на NaN после преобразования
    if (isNaN(totalBalance)) {
      logger.error('❌ Ошибка преобразования баланса:', {
        description: 'Error converting balance to number',
        telegram_id: normalizedId,
        raw_balance: balance.total_balance,
      })
      return 0
    }

    logger.info('✅ Баланс рассчитан из транзакций:', {
      description: 'Balance calculated from transactions',
      telegram_id: normalizedId,
      total_balance: totalBalance,
      income: income,
      outcome: outcome,
      commission: commission,
    })

    return totalBalance
  } catch (error) {
    logger.error('❌ Ошибка в getUserBalance:', {
      description: 'Error in getUserBalance function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: normalizeTelegramId(telegram_id),
    })
    return 0 // Возвращаем 0 вместо выброса ошибки
  }
}
