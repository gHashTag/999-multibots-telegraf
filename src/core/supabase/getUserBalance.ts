import type { TelegramId } from '@/interfaces/telegram.interface'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

// Кэш для хранения балансов пользователей
type BalanceCache = {
  [key: string]: {
    balance: number
    timestamp: number
  }
}

// Время жизни кэша баланса в миллисекундах (30 секунд)
const BALANCE_CACHE_TTL = 30 * 1000

// Кэш балансов пользователей
const balanceCache: BalanceCache = {}

/**
 * Получает баланс пользователя на основе транзакций в payments_v2
 * Вызывает SQL-функцию get_user_balance
 * Использует локальный кэш для уменьшения количества запросов к БД
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
    const cacheKey = `${normalizedId}`
    const now = Date.now()

    // Проверяем, есть ли данные в кэше и не истек ли срок их действия
    if (
      balanceCache[cacheKey] &&
      now - balanceCache[cacheKey].timestamp < BALANCE_CACHE_TTL
    ) {
      logger.info('💾 Получение баланса из кэша:', {
        description: 'Getting user balance from cache',
        telegram_id: normalizedId,
        bot_name,
        cached_balance: balanceCache[cacheKey].balance,
      })
      return balanceCache[cacheKey].balance
    }

    logger.info('🔍 Получение баланса пользователя из БД:', {
      description: 'Getting user balance from database',
      telegram_id: normalizedId,
      bot_name,
    })

    // Получаем баланс из функции get_user_balance
    const { data: stars, error } = await supabase.rpc('get_user_balance', {
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

    const balance = stars || 0

    // Сохраняем результат в кэш
    balanceCache[cacheKey] = {
      balance,
      timestamp: now,
    }

    logger.info('✅ Баланс пользователя получен и кэширован:', {
      description: 'User balance retrieved and cached',
      telegram_id: normalizedId,
      stars: balance,
      bot_name,
    })

    return balance
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
 * Инвалидирует кэш баланса для указанного пользователя
 * Должен вызываться после всех операций, изменяющих баланс
 */
export const invalidateBalanceCache = (telegram_id: TelegramId): void => {
  const normalizedId = normalizeTelegramId(telegram_id)
  const cacheKey = `${normalizedId}`

  if (balanceCache[cacheKey]) {
    delete balanceCache[cacheKey]
    logger.info('🔄 Кэш баланса инвалидирован:', {
      description: 'Balance cache invalidated',
      telegram_id: normalizedId,
    })
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
  stars: number // Баланс в звездах (переименовано с balance)
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
        stars: 0,
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
        stars: 0,
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
      stars: Number(stats.stars) || 0, // получаем из поля stars, не balance
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
        stars: result.stars,
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
      stars: 0,
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
