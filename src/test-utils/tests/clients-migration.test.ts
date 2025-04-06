import { TEST_CONFIG } from '../test-config'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { TestResult } from '../types'

interface DebugConfig {
  userId: number
  botName: string
  description: string
}

const DEBUG_BOTS: DebugConfig[] = [
  {
    userId: 144022504,
    botName: 'neuro_blogger_bot',
    description: 'Нейро Блоггер',
  },
  {
    userId: 352374518,
    botName: 'MetaMuse_Manifest_bot',
    description: 'MetaMuse Manifest - основной бот',
  },
  {
    userId: 2086031075,
    botName: 'NeuroLenaAssistant_bot',
    description: 'Нейро Лена',
  },
  {
    userId: 144022504,
    botName: 'ai_koshey_bot',
    description: 'AI Кощей',
  },
  {
    userId: 435572800,
    botName: 'Gaia_Kamskaia_bot',
    description: 'Gaia Kamskaia',
  },
  {
    userId: 6419070693,
    botName: 'LeeSolarbot',
    description: 'Lee Solar',
  },
  {
    userId: 1254048880,
    botName: 'ZavaraBot',
    description: 'Zavara',
  },
]

interface PaymentStats {
  totalRubIncome: number
  totalStarsFromRub: number
  totalStarsIncome: number
  totalStarsSpent: number
  totalBonusStars: number
}

const getStartOfLastMonth = (): Date => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 1)
}

const getEndOfLastMonth = (): Date => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 0)
}

const getOldPaymentStats = async (botName: string): Promise<PaymentStats> => {
  try {
    const startDate = getStartOfLastMonth()
    const endDate = getEndOfLastMonth()

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('bot_name', botName)
      .gte('payment_date', startDate.toISOString())
      .lte('payment_date', endDate.toISOString())

    if (error) {
      logger.error('❌ Ошибка при получении старой статистики', {
        description: 'Error getting old payment stats',
        error: error.message,
        details: error,
        bot_name: botName,
        date_range: { start: startDate, end: endDate },
      })
      throw error
    }

    const stats: PaymentStats = {
      totalRubIncome: 0,
      totalStarsFromRub: 0,
      totalStarsIncome: 0,
      totalStarsSpent: 0,
      totalBonusStars: 0,
    }

    payments?.forEach(payment => {
      if (payment.status === 'COMPLETED') {
        if (payment.payment_method === 'rub') {
          stats.totalRubIncome += payment.amount
          stats.totalStarsFromRub += payment.stars
        } else if (payment.payment_method === 'stars') {
          if (payment.type === 'money_income') {
            stats.totalStarsIncome += payment.amount
          } else if (payment.type === 'money_expense') {
            stats.totalStarsSpent += Math.abs(payment.amount)
          }
        } else if (payment.payment_method === 'bonus') {
          stats.totalBonusStars += payment.amount
        }
      }
    })

    logger.info('📊 Статистика из старой таблицы', {
      description: 'Old table statistics',
      bot_name: botName,
      date_range: { start: startDate, end: endDate },
      stats,
      payments_count: payments?.length || 0,
    })

    return stats
  } catch (error) {
    logger.error('❌ Ошибка при получении старой статистики', {
      description: 'Error getting old payment stats',
      error: error instanceof Error ? error.message : String(error),
      bot_name: botName,
    })
    throw error
  }
}

const getNewPaymentStats = async (botName: string): Promise<PaymentStats> => {
  try {
    const startDate = getStartOfLastMonth()
    const endDate = getEndOfLastMonth()

    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('bot_name', botName)
      .gte('payment_date', startDate.toISOString())
      .lte('payment_date', endDate.toISOString())

    if (error) {
      logger.error('❌ Ошибка при получении новой статистики', {
        description: 'Error getting new payment stats',
        error: error.message,
        details: error,
        bot_name: botName,
        date_range: { start: startDate, end: endDate },
      })
      throw error
    }

    const stats: PaymentStats = {
      totalRubIncome: 0,
      totalStarsFromRub: 0,
      totalStarsIncome: 0,
      totalStarsSpent: 0,
      totalBonusStars: 0,
    }

    payments?.forEach(payment => {
      if (payment.status === 'COMPLETED') {
        if (payment.payment_method === 'rub') {
          stats.totalRubIncome += payment.amount
          stats.totalStarsFromRub += payment.stars
        } else if (payment.payment_method === 'stars') {
          if (payment.type === 'money_income') {
            stats.totalStarsIncome += payment.amount
          } else if (payment.type === 'money_expense') {
            stats.totalStarsSpent += Math.abs(payment.amount)
          }
        } else if (payment.payment_method === 'bonus') {
          stats.totalBonusStars += payment.amount
        }
      }
    })

    logger.info('📊 Статистика из новой таблицы', {
      description: 'New table statistics',
      bot_name: botName,
      date_range: { start: startDate, end: endDate },
      stats,
      payments_count: payments?.length || 0,
    })

    return stats
  } catch (error) {
    logger.error('❌ Ошибка при получении новой статистики', {
      description: 'Error getting new payment stats',
      error: error instanceof Error ? error.message : String(error),
      bot_name: botName,
    })
    throw error
  }
}

const compareStats = (
  oldStats: PaymentStats,
  newStats: PaymentStats
): boolean => {
  const threshold = 0.01 // Допустимая погрешность в 1%

  const isWithinThreshold = (a: number, b: number): boolean => {
    if (a === 0 && b === 0) return true
    if (a === 0 || b === 0) return false
    const diff = Math.abs((a - b) / a)
    return diff <= threshold
  }

  const comparison = {
    totalRubIncome: isWithinThreshold(
      oldStats.totalRubIncome,
      newStats.totalRubIncome
    ),
    totalStarsFromRub: isWithinThreshold(
      oldStats.totalStarsFromRub,
      newStats.totalStarsFromRub
    ),
    totalStarsIncome: isWithinThreshold(
      oldStats.totalStarsIncome,
      newStats.totalStarsIncome
    ),
    totalStarsSpent: isWithinThreshold(
      oldStats.totalStarsSpent,
      newStats.totalStarsSpent
    ),
    totalBonusStars: isWithinThreshold(
      oldStats.totalBonusStars,
      newStats.totalBonusStars
    ),
  }

  logger.info('🔍 Результаты сравнения', {
    description: 'Comparison results',
    comparison,
  })

  return Object.values(comparison).every(Boolean)
}

export const runClientsMigrationTests = async (): Promise<TestResult[]> => {
  const results: TestResult[] = []
  const startDate = getStartOfLastMonth()
  const endDate = getEndOfLastMonth()

  try {
    logger.info('🎯 Начало тестирования миграции клиентов', {
      description: 'Starting clients migration tests',
      total_clients: DEBUG_BOTS.length,
      date_range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    })

    for (const client of DEBUG_BOTS) {
      logger.info('🔍 Проверка статистики для клиента', {
        description: 'Checking client statistics',
        bot_name: client.botName,
        client_description: client.description,
      })

      const oldStats = await getOldPaymentStats(client.botName)
      const newStats = await getNewPaymentStats(client.botName)
      const statsMatch = compareStats(oldStats, newStats)

      results.push({
        name: `Migration Test - ${client.description}`,
        success: statsMatch,
        message: statsMatch
          ? `✅ Статистика успешно перенесена для ${client.description}`
          : `❌ Несоответствие в статистике для ${client.description}`,
        details: {
          botName: client.botName,
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          oldStats,
          newStats,
          difference: {
            totalRubIncome: newStats.totalRubIncome - oldStats.totalRubIncome,
            totalStarsFromRub:
              newStats.totalStarsFromRub - oldStats.totalStarsFromRub,
            totalStarsIncome:
              newStats.totalStarsIncome - oldStats.totalStarsIncome,
            totalStarsSpent:
              newStats.totalStarsSpent - oldStats.totalStarsSpent,
            totalBonusStars:
              newStats.totalBonusStars - oldStats.totalBonusStars,
          },
        },
      })

      logger.info('📊 Результаты сравнения статистики', {
        description: 'Statistics comparison results',
        bot_name: client.botName,
        client_description: client.description,
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        old_stats: oldStats,
        new_stats: newStats,
        match: statsMatch,
      })
    }

    logger.info('✅ Тестирование миграции клиентов завершено', {
      description: 'Clients migration testing completed',
      total_tests: results.length,
      successful_tests: results.filter(r => r.success).length,
      date_range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    })
  } catch (error) {
    logger.error('❌ Ошибка при тестировании миграции клиентов', {
      description: 'Error during clients migration testing',
      error: error instanceof Error ? error.message : String(error),
      details: error,
    })

    results.push({
      name: 'Clients Migration Testing',
      success: false,
      message: `❌ Ошибка при тестировании: ${
        error instanceof Error ? error.message : String(error)
      }`,
      details: {
        error,
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      },
    })
  }

  return results
}
