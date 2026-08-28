import { logger } from '@/utils/logger'
import { supabase } from './client'

/**
 * Интерфейс для оптимизированного ответа статистики баланса
 */
export interface OptimizedBalanceStats {
  current_balance: number
  total_real_income: number
  total_bonus_income: number
  total_outcome: number
  total_transactions: number
  payment_methods: {
    rubles: {
      stars: number
      amount: number
      count: number
    }
    telegram_stars: {
      stars: number
      count: number
    }
  }
  services_breakdown: ServiceBreakdown[]
  recent_topups: RecentTransaction[]
  recent_expenses: RecentExpense[]
}

export interface ServiceBreakdown {
  service: string
  count: number
  total_stars: number
  avg_stars: number
  percentage: number
  last_used: string
}

export interface RecentTransaction {
  date: string
  stars: number
  amount: number
  currency: string
  payment_method: string
  description: string | null
}

export interface RecentExpense {
  date: string
  stars: number
  service: string
  description: string | null
}

/**
 * Интерфейс для трендов баланса
 */
export interface BalanceTrends {
  period: string
  timeline: TimelinePeriod[]
  service_trends: ServiceTrend[]
  summary: {
    total_income: number
    total_outcome: number
    transaction_count: number
    avg_transaction: number
  }
}

interface TimelinePeriod {
  period: string
  income: number
  outcome: number
  balance: number
  transactions: number
}

interface ServiceTrend {
  service: string
  usage_count: number
  total_spent: number
  avg_per_use: number
}

/**
 * Интерфейс для статистики бота
 */
export interface BotStatisticsSummary {
  summary: {
    unique_users: number
    total_transactions: number
    total_income: number
    total_outcome: number
    total_cost: number
    total_bonuses: number
  }
  top_users: Array<{
    telegram_id: number
    transactions: number
    spent: number
  }>
  services: Array<{
    service_type: string
    count: number
    revenue: number
    cost: number
  }>
  period: {
    start: string | null
    end: string | null
  }
}

/**
 * Получает оптимизированную статистику баланса пользователя
 * Использует SQL-функцию на стороне БД для минимизации передачи данных
 */
export async function getUserBalanceStatsOptimized(
  telegramId: string,
  botName?: string,
  limitServices: number = 10,
  limitTransactions: number = 5
): Promise<OptimizedBalanceStats | null> {
  try {
    logger.info('[getUserBalanceStatsOptimized] Fetching optimized stats', {
      telegramId,
      botName,
      limitServices,
      limitTransactions,
    })

    // Вызываем SQL-функцию через RPC
    const { data, error } = await supabase.rpc(
      'get_user_balance_stats_optimized',
      {
        p_telegram_id: parseInt(telegramId),
        p_bot_name: botName || null,
        p_limit_services: limitServices,
        p_limit_transactions: limitTransactions,
      }
    )

    if (error) {
      logger.error(
        '[getUserBalanceStatsOptimized] Error calling RPC function',
        {
          error: error.message,
          telegramId,
          botName,
        }
      )
      return null
    }

    if (!data) {
      logger.warn('[getUserBalanceStatsOptimized] No data returned', {
        telegramId,
        botName,
      })
      return null
    }

    logger.info('[getUserBalanceStatsOptimized] Successfully fetched stats', {
      telegramId,
      botName,
      hasData: !!data,
      currentBalance: data.current_balance,
    })

    return data as OptimizedBalanceStats
  } catch (error) {
    logger.error('[getUserBalanceStatsOptimized] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      botName,
    })
    return null
  }
}

/**
 * Получает тренды баланса пользователя за период
 */
export async function getBalanceTrends(
  telegramId: string,
  period: 'day' | 'week' | 'month' | 'year' = 'week',
  botName?: string
): Promise<BalanceTrends | null> {
  try {
    logger.info('[getBalanceTrends] Fetching balance trends', {
      telegramId,
      period,
      botName,
    })

    const { data, error } = await supabase.rpc('get_balance_trends', {
      p_telegram_id: parseInt(telegramId),
      p_period: period,
      p_bot_name: botName || null,
    })

    if (error) {
      logger.error('[getBalanceTrends] Error calling RPC function', {
        error: error.message,
        telegramId,
        period,
        botName,
      })
      return null
    }

    if (!data) {
      logger.warn('[getBalanceTrends] No data returned', {
        telegramId,
        period,
        botName,
      })
      return null
    }

    return data as BalanceTrends
  } catch (error) {
    logger.error('[getBalanceTrends] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      period,
      botName,
    })
    return null
  }
}

/**
 * Получает сводную статистику по боту
 */
export async function getBotStatisticsSummary(
  botName: string,
  startDate?: Date,
  endDate?: Date
): Promise<BotStatisticsSummary | null> {
  try {
    logger.info('[getBotStatisticsSummary] Fetching bot statistics', {
      botName,
      startDate,
      endDate,
    })

    const { data, error } = await supabase.rpc('get_bot_statistics_summary', {
      p_bot_name: botName,
      p_start_date: startDate?.toISOString() || null,
      p_end_date: endDate?.toISOString() || null,
    })

    if (error) {
      logger.error('[getBotStatisticsSummary] Error calling RPC function', {
        error: error.message,
        botName,
        startDate,
        endDate,
      })
      return null
    }

    if (!data) {
      logger.warn('[getBotStatisticsSummary] No data returned', {
        botName,
        startDate,
        endDate,
      })
      return null
    }

    return data as BotStatisticsSummary
  } catch (error) {
    logger.error('[getBotStatisticsSummary] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      botName,
      startDate,
      endDate,
    })
    return null
  }
}

/**
 * Обновляет материализованное представление дневной статистики
 * Рекомендуется вызывать периодически через cron или после массовых операций
 */
export async function refreshDailyBalanceStats(): Promise<boolean> {
  try {
    logger.info('[refreshDailyBalanceStats] Refreshing materialized view')

    const { error } = await supabase.rpc('refresh_daily_balance_stats')

    if (error) {
      logger.error('[refreshDailyBalanceStats] Error refreshing view', {
        error: error.message,
      })
      return false
    }

    logger.info('[refreshDailyBalanceStats] Successfully refreshed view')
    return true
  } catch (error) {
    logger.error('[refreshDailyBalanceStats] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Оптимизирует данные платежей (очистка старых, обновление статистики)
 * Рекомендуется вызывать периодически через cron
 */
export async function optimizePaymentData(): Promise<boolean> {
  try {
    logger.info('[optimizePaymentData] Starting payment data optimization')

    const { error } = await supabase.rpc('optimize_payment_data')

    if (error) {
      logger.error('[optimizePaymentData] Error optimizing data', {
        error: error.message,
      })
      return false
    }

    logger.info('[optimizePaymentData] Successfully optimized payment data')
    return true
  } catch (error) {
    logger.error('[optimizePaymentData] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Получает данные из материализованного представления дневной статистики
 */
export async function getDailyBalanceStats(
  botName: string,
  startDate?: Date,
  endDate?: Date
): Promise<any[] | null> {
  try {
    let query = supabase
      .from('daily_balance_stats')
      .select('*')
      .eq('bot_name', botName)
      .order('date', { ascending: false })

    if (startDate) {
      query = query.gte('date', startDate.toISOString().split('T')[0])
    }

    if (endDate) {
      query = query.lte('date', endDate.toISOString().split('T')[0])
    }

    const { data, error } = await query

    if (error) {
      logger.error('[getDailyBalanceStats] Error fetching daily stats', {
        error: error.message,
        botName,
        startDate,
        endDate,
      })
      return null
    }

    return data
  } catch (error) {
    logger.error('[getDailyBalanceStats] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      botName,
      startDate,
      endDate,
    })
    return null
  }
}
