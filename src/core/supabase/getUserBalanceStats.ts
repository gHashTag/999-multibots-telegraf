import { logger } from '@/utils/logger'
import { supabase } from './client'
import {
  TelegramId,
  normalizeTelegramId,
} from '../../interfaces/telegram.interface'
import {
  UserBalanceStats,
  RubPurchaseDetail,
  XtrPurchaseDetail,
  ServiceUsageDetail,
} from './getUserBalance'

// Добавляем определение интерфейса здесь
interface GetUserBalanceStatsParams {
  p_user_telegram_id: string
  p_bot_name?: string // Сделаем bot_name опциональным, как в SQL
}

// Новый интерфейс для статистики по боту с учетом себестоимости
export interface BotStatistics {
  bot_name: string
  neurovideo_income: number
  stars_topup_income: number
  total_income: number
  total_outcome: number
  total_cost: number // Себестоимость в звездах
  net_profit: number // Чистая прибыль (доход - расход - себестоимость)
}

// Новый интерфейс для результата SQL-функции
export interface UserBalanceStatsResult {
  stats: BotStatistics[]
}

/**
 * Получает всю статистику баланса пользователя одним запросом для конкретного бота.
 * Вызывает SQL-функцию get_user_balance_stats, которая должна быть обновлена для возврата детализированной структуры.
 */
export const getUserBalanceStats = async (
  userTelegramId: string,
  botName?: string
): Promise<UserBalanceStatsResult | null> => {
  if (!userTelegramId) {
    logger.warn(
      '[getUserBalanceStats] Attempted to fetch stats without userTelegramId'
    )
    return null
  }

  try {
    // Функция get_user_balance_stats теперь принимает только один параметр - user_telegram_id
    const { data, error } = await supabase.rpc('get_user_balance_stats', {
      user_telegram_id: userTelegramId,
    })

    logger.info('[getUserBalanceStats] Raw data from SQL function:', {
      data_received: data,
    })

    if (error) {
      logger.error(
        '[getUserBalanceStats] Ошибка при вызове SQL get_user_balance_stats:',
        {
          userTelegramId,
          botName,
          error_message: error.message,
          error_details: error,
        }
      )
      return null
    }

    if (!data || !data.stats) {
      logger.warn(
        '[getUserBalanceStats] SQL get_user_balance_stats не вернула данные.',
        { userTelegramId, botName }
      )
      return null
    }

    // Преобразуем статистику из SQL в типизированный формат
    const validatedResult: UserBalanceStatsResult = {
      stats: Array.isArray(data.stats)
        ? data.stats.map(
            (stat: any): BotStatistics => ({
              bot_name: String(stat.bot_name || 'unknown'),
              neurovideo_income: Number(stat.neurovideo_income || 0),
              stars_topup_income: Number(stat.stars_topup_income || 0),
              total_income: Number(stat.total_income || 0),
              total_outcome: Number(stat.total_outcome || 0),
              total_cost: Number(stat.total_cost || 0),
              net_profit: Number(stat.net_profit || 0),
            })
          )
        : [],
    }

    // Если указан конкретный бот, фильтруем результаты только для него
    if (botName) {
      validatedResult.stats = validatedResult.stats.filter(
        stat => stat.bot_name === botName
      )
    }

    logger.info('[getUserBalanceStats] Статистика баланса успешно получена:', {
      userTelegramId,
      botName,
      stats_count: validatedResult.stats.length,
    })

    return validatedResult
  } catch (e) {
    logger.error('[getUserBalanceStats] Непредвиденная ошибка:', {
      userTelegramId,
      botName,
      error: e instanceof Error ? e.message : String(e),
      error_stack: e instanceof Error ? e.stack : undefined,
    })
    return null
  }
}

// Вспомогательная функция для безопасного форматирования даты, если она приходит из RPC
// Может быть такой же, как в statsCommand, или вынесена в utils
const formatDateSafe = (dateString: any): string => {
  if (dateString === null || typeof dateString === 'undefined') return 'N/A' // Более строгая проверка
  if (
    typeof dateString !== 'string' &&
    typeof dateString !== 'number' &&
    !(dateString instanceof Date)
  ) {
    // Разрешаем числа и объекты Date
    return 'Invalid Input Type'
  }
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid Date' // Проверка на валидность даты
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  } catch (e) {
    logger.warn(
      '[formatDateSafe] Ошибка при форматировании даты в getUserBalanceStats',
      { input: dateString, error: e }
    )
    return 'Formatting Error'
  }
}
