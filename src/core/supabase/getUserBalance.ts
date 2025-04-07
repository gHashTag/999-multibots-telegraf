import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { supabase } from './index'
import { logger } from '@/utils/logger'

/**
 * Получает баланс пользователя на основе транзакций в payments_v2
 * Вызывает SQL-функцию get_user_balance
 */
export const getUserBalance = async (
  telegram_id: TelegramId,
  bot_name?: string
): Promise<number> => {
  try {
    if (!telegram_id) {
      logger.warn('⚠️ Запрос баланса без telegram_id:', {
        description: 'Balance request without telegram_id',
        bot_name,
      })
      return 0
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение баланса пользователя:', {
      description: 'Getting user balance',
      telegram_id: normalizedId,
      bot_name,
    })

    // Получаем баланс из функции get_user_balance
    const { data: balance, error } = await supabase.rpc('get_user_balance', {
      user_telegram_id: normalizedId.toString(), // Важно передать в виде строки
    })

    if (error) {
      logger.error('❌ Ошибка получения баланса:', {
        description: 'Error getting balance',
        error: error.message,
        error_details: error,
        telegram_id: normalizedId,
      })
      return 0
    }

    logger.info('✅ Баланс пользователя получен:', {
      description: 'User balance retrieved',
      telegram_id: normalizedId,
      balance: balance || 0,
      bot_name,
    })

    return balance || 0
  } catch (error) {
    logger.error('❌ Ошибка в getUserBalance:', {
      description: 'Error in getUserBalance function',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      telegram_id,
    })
    return 0
  }
}

/**
 * Интерфейс детальной информации о платеже
 */
export interface PaymentDetail {
  currency: string
  stars: string
  amount: string
  payment_date: string
  type: string
  description: string
  payment_method: string
  status: string
}

/**
 * Интерфейс для статистики баланса
 */
export interface UserBalanceStats {
  balance: number
  total_added: number
  total_spent: number
  bonus_stars: number
  added_stars: number
  added_rub: number
  services: Record<string, number>
  payment_methods?: Record<string, number>
  payments?: PaymentDetail[]
}

/**
 * Получает всю статистику баланса пользователя одним запросом
 * Вызывает SQL-функцию get_user_balance_stats
 */
export const getUserBalanceStats = async (
  telegram_id: TelegramId,
  bot_name?: string
): Promise<UserBalanceStats> => {
  try {
    if (!telegram_id) {
      logger.warn('⚠️ Запрос статистики баланса без telegram_id:', {
        description: 'Balance stats request without telegram_id',
        bot_name,
      })
      return {
        balance: 0,
        total_added: 0,
        total_spent: 0,
        bonus_stars: 0,
        added_stars: 0,
        added_rub: 0,
        services: {},
        payment_methods: {},
        payments: [],
      }
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение статистики баланса пользователя:', {
      description: 'Getting user balance statistics',
      telegram_id: normalizedId,
      bot_name,
    })

    // Получаем статистику из функции get_user_balance_stats
    const { data: stats, error } = await supabase.rpc(
      'get_user_balance_stats',
      {
        user_telegram_id: normalizedId.toString(), // Важно передать в виде строки
      }
    )

    if (error) {
      logger.error('❌ Ошибка получения статистики баланса:', {
        description: 'Error getting balance statistics',
        error: error.message,
        error_details: error,
        telegram_id: normalizedId,
      })
      return {
        balance: 0,
        total_added: 0,
        total_spent: 0,
        bonus_stars: 0,
        added_stars: 0,
        added_rub: 0,
        services: {},
        payment_methods: {},
        payments: [],
      }
    }

    const result: UserBalanceStats = {
      balance: Number(stats.balance) || 0,
      total_added: Number(stats.total_added) || 0,
      total_spent: Number(stats.total_spent) || 0,
      bonus_stars: Number(stats.bonus_stars) || 0,
      added_stars: Number(stats.added_stars) || 0,
      added_rub: Number(stats.added_rub) || 0,
      services: stats.services || {},
      payment_methods: stats.payment_methods || {},
      payments: stats.payments || [],
    }

    logger.info('✅ Статистика баланса пользователя получена:', {
      description: 'User balance statistics retrieved',
      telegram_id: normalizedId,
      stats: {
        balance: result.balance,
        total_added: result.total_added,
        total_spent: result.total_spent,
        payment_methods_count: Object.keys(result.payment_methods || {}).length,
        payments_count: (result.payments || []).length,
      },
      bot_name,
    })

    return result
  } catch (error) {
    logger.error('❌ Ошибка в getUserBalanceStats:', {
      description: 'Error in getUserBalanceStats function',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      telegram_id,
    })
    return {
      balance: 0,
      total_added: 0,
      total_spent: 0,
      bonus_stars: 0,
      added_stars: 0,
      added_rub: 0,
      services: {},
      payment_methods: {},
      payments: [],
    }
  }
}
