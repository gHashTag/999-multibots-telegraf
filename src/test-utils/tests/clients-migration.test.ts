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
  total_amount: number
  total_count: number
  average_amount: number
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
      total_amount: 0,
      total_count: 0,
      average_amount: 0,
    }

    if (!payments || payments.length === 0) {
      logger.warn('⚠️ Нет платежей в старой таблице', {
        description: 'No payments found in old table',
        bot_name: botName,
        date_range: { start: startDate, end: endDate },
      })
      return stats
    }

    payments.forEach(payment => {
      if (payment.status === 'COMPLETED') {
        if (payment.payment_method === 'rub') {
          stats.total_amount += payment.amount
          stats.total_count += 1
        } else if (payment.payment_method === 'stars') {
          if (payment.type === 'money_income') {
            stats.total_amount += payment.amount
            stats.total_count += 1
          } else if (payment.type === 'money_expense') {
            stats.total_amount += Math.abs(payment.amount)
            stats.total_count += 1
          }
        } else if (payment.payment_method === 'bonus') {
          stats.total_amount += payment.amount
          stats.total_count += 1
        }
      }
    })

    stats.average_amount =
      stats.total_count > 0 ? stats.total_amount / stats.total_count : 0

    logger.info('📊 Статистика из старой таблицы', {
      description: 'Old table statistics',
      bot_name: botName,
      date_range: { start: startDate, end: endDate },
      stats,
      payments_count: payments.length,
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
      total_amount: 0,
      total_count: 0,
      average_amount: 0,
    }

    if (!payments || payments.length === 0) {
      logger.warn('⚠️ Нет платежей в новой таблице', {
        description: 'No payments found in new table',
        bot_name: botName,
        date_range: { start: startDate, end: endDate },
      })
      return stats
    }

    payments.forEach(payment => {
      if (payment.status === 'COMPLETED') {
        if (payment.payment_method === 'rub') {
          stats.total_amount += payment.amount
          stats.total_count += 1
        } else if (payment.payment_method === 'stars') {
          if (payment.type === 'money_income') {
            stats.total_amount += payment.amount
            stats.total_count += 1
          } else if (payment.type === 'money_expense') {
            stats.total_amount += Math.abs(payment.amount)
            stats.total_count += 1
          }
        } else if (payment.payment_method === 'bonus') {
          stats.total_amount += payment.amount
          stats.total_count += 1
        }
      }
    })

    stats.average_amount =
      stats.total_count > 0 ? stats.total_amount / stats.total_count : 0

    logger.info('📊 Статистика из новой таблицы', {
      description: 'New table statistics',
      bot_name: botName,
      date_range: { start: startDate, end: endDate },
      stats,
      payments_count: payments.length,
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

export async function testClientsMigration(): Promise<TestResult> {
  const testName = 'Clients Migration Test'

  try {
    logger.info('🚀 Начинаем тестирование миграции клиентов', {
      description: 'Starting clients migration test',
      bots_count: DEBUG_BOTS.length,
    })

    const results = await Promise.all(
      DEBUG_BOTS.map(async bot => {
        try {
          const oldStats = await getOldPaymentStats(bot.botName)
          const newStats = await getNewPaymentStats(bot.botName)

          // Проверяем совпадение статистики с погрешностью 1%
          const totalAmountDiff = Math.abs(
            oldStats.total_amount - newStats.total_amount
          )
          const totalAmountThreshold = oldStats.total_amount * 0.01 // 1% погрешность

          const totalCountDiff = Math.abs(
            oldStats.total_count - newStats.total_count
          )
          const totalCountThreshold = oldStats.total_count * 0.01 // 1% погрешность

          const statsMatch =
            totalAmountDiff <= totalAmountThreshold &&
            totalCountDiff <= totalCountThreshold

          if (!statsMatch) {
            logger.warn('⚠️ Несоответствие статистики', {
              description: 'Statistics mismatch',
              bot_name: bot.botName,
              bot_description: bot.description,
              old_stats: oldStats,
              new_stats: newStats,
              differences: {
                total_amount: totalAmountDiff,
                total_count: totalCountDiff,
              },
              thresholds: {
                total_amount: totalAmountThreshold,
                total_count: totalCountThreshold,
              },
            })
          } else {
            logger.info('✅ Статистика совпадает', {
              description: 'Statistics match',
              bot_name: bot.botName,
              bot_description: bot.description,
              old_stats: oldStats,
              new_stats: newStats,
            })
          }

          return {
            botName: bot.botName,
            description: bot.description,
            statsMatch,
            oldStats,
            newStats,
          }
        } catch (error) {
          logger.error('❌ Ошибка при проверке бота', {
            description: 'Error checking bot',
            error: error instanceof Error ? error.message : String(error),
            bot_name: bot.botName,
            bot_description: bot.description,
          })
          return {
            botName: bot.botName,
            description: bot.description,
            statsMatch: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      })
    )

    const failedBots = results.filter(result => !result.statsMatch)

    if (failedBots.length > 0) {
      logger.error('❌ Тест миграции клиентов завершен с ошибками', {
        description: 'Clients migration test completed with errors',
        failed_bots: failedBots.map(bot => ({
          name: bot.botName,
          description: bot.description,
          error: bot.error,
        })),
      })

      return {
        name: testName,
        success: false,
        message: `Ошибка миграции для ${failedBots.length} ботов`,
        error: new Error(
          `Несоответствие статистики для ботов: ${failedBots
            .map(bot => bot.botName)
            .join(', ')}`
        ),
      }
    }

    logger.info('✅ Тест миграции клиентов успешно завершен', {
      description: 'Clients migration test completed successfully',
      bots_checked: results.length,
    })

    return {
      name: testName,
      success: true,
      message: `Миграция успешно проверена для ${results.length} ботов`,
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error('❌ Ошибка при тестировании миграции клиентов', {
      description: 'Error in clients migration test',
      error: error.message,
    })

    return {
      name: testName,
      success: false,
      message: 'Ошибка при тестировании миграции клиентов',
      error,
    }
  }
}

// Запускаем тест если файл запущен напрямую
if (require.main === module) {
  ;(async () => {
    try {
      const results = await testClientsMigration()
      console.log('📊 Результаты тестов:', results)
      process.exit(0)
    } catch (error) {
      console.error('❌ Ошибка при запуске тестов:', error)
      process.exit(1)
    }
  })()
}
