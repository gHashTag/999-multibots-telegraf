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

/**
 * Получает всю статистику баланса пользователя одним запросом для конкретного бота.
 * Вызывает SQL-функцию get_user_balance_stats, которая должна быть обновлена для возврата детализированной структуры.
 */
export const getUserBalanceStats = async (
  userTelegramId: string,
  botName?: string
): Promise<UserBalanceStats | null> => {
  if (!userTelegramId) {
    logger.warn(
      '[getUserBalanceStats] Attempted to fetch stats without userTelegramId'
    )
    return null
  }

  const params: GetUserBalanceStatsParams = {
    p_user_telegram_id: userTelegramId,
  }
  if (botName) {
    params.p_bot_name = botName
  }

  logger.info('[getUserBalanceStats] Fetching stats with params:', params) // Лог параметров вызова

  try {
    const { data, error } = await supabase.rpc('get_user_balance_stats', params)

    logger.info('[getUserBalanceStats] Raw data from SQL function:', {
      data_received: data,
    }) // <--- ДОБАВЛЕН ЭТОТ ЛОГ

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

    if (!data) {
      logger.warn(
        '[getUserBalanceStats] SQL get_user_balance_stats не вернула данные.',
        { userTelegramId, botName }
      )
      return null
    }

    const resultFromSql = data as any // Получаем данные как any для безопасного маппинга

    // Обновляем validatedResult в соответствии с новым интерфейсом UserBalanceStats
    // и предполагаемой структурой ответа от SQL
    const validatedResult: UserBalanceStats = {
      user_telegram_id: String(
        resultFromSql.user_telegram_id || userTelegramId
      ),
      user_first_name: resultFromSql.user_first_name
        ? String(resultFromSql.user_first_name)
        : undefined,
      user_last_name: resultFromSql.user_last_name
        ? String(resultFromSql.user_last_name)
        : undefined,
      user_username: resultFromSql.user_username
        ? String(resultFromSql.user_username)
        : undefined,

      balance_rub: Number(resultFromSql.balance_rub) || 0,
      balance_xtr: Number(resultFromSql.balance_xtr) || 0,

      total_rub_deposited: Number(resultFromSql.total_rub_deposited) || 0,
      total_rub_purchases_count:
        Number(resultFromSql.total_rub_purchases_count) || 0,
      rub_purchase_details: Array.isArray(resultFromSql.rub_purchase_details)
        ? resultFromSql.rub_purchase_details.map(
            (p: any): RubPurchaseDetail => ({
              payment_date: formatDateSafe(p.payment_date),
              amount_rub: Number(p.amount_rub) || 0,
              payment_system: String(p.payment_system || 'N/A'),
              transaction_id: p.transaction_id
                ? String(p.transaction_id)
                : undefined,
            })
          )
        : [],

      total_rub_spent_for_xtr:
        Number(resultFromSql.total_rub_spent_for_xtr) || 0,
      total_xtr_purchased: Number(resultFromSql.total_xtr_purchased) || 0,
      total_xtr_purchases_count:
        Number(resultFromSql.total_xtr_purchases_count) || 0,
      xtr_purchase_details: Array.isArray(resultFromSql.xtr_purchase_details)
        ? resultFromSql.xtr_purchase_details.map(
            (p: any): XtrPurchaseDetail => ({
              purchase_date: formatDateSafe(p.purchase_date),
              xtr_amount: Number(p.xtr_amount) || 0,
              rub_amount: Number(p.rub_amount) || 0,
              payment_system: String(p.payment_system || 'N/A'),
              transaction_id: p.transaction_id
                ? String(p.transaction_id)
                : undefined,
            })
          )
        : [],

      total_xtr_spent_on_services:
        Number(resultFromSql.total_xtr_spent_on_services) || 0,
      total_service_usage_count:
        Number(resultFromSql.total_service_usage_count) || 0,
      service_usage_details: Array.isArray(resultFromSql.service_usage_details)
        ? resultFromSql.service_usage_details.map(
            (s: any): ServiceUsageDetail => ({
              usage_date: formatDateSafe(s.usage_date),
              xtr_cost: Number(s.xtr_cost) || 0,
              service_name: String(s.service_name || 'Unknown Service'),
              model_name: s.model_name ? String(s.model_name) : undefined,
              details: s.details ? String(s.details) : undefined,
              transaction_id: s.transaction_id
                ? String(s.transaction_id)
                : undefined,
            })
          )
        : [],

      first_payment_date: resultFromSql.first_payment_date
        ? formatDateSafe(resultFromSql.first_payment_date)
        : undefined,
      last_payment_date: resultFromSql.last_payment_date
        ? formatDateSafe(resultFromSql.last_payment_date)
        : undefined,
    }

    logger.info('[getUserBalanceStats] Статистика баланса успешно получена:', {
      userTelegramId,
      botName,
      // result: validatedResult // Можно залогировать, если нужно для отладки, но может быть много данных
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
