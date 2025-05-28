import { TelegramId } from '@/interfaces/telegram.interface'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Получает баланс пользователя на основе транзакций в payments_v2
 * Вызывает SQL-функцию get_user_balance
 * ВСЕГДА получает свежие данные из БД (кэширование убрано)
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

    logger.info('🔍 Получение баланса пользователя из БД (без кэша):', {
      description: 'Getting user balance from database (no cache)',
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

    logger.info('✅ Баланс пользователя получен из БД:', {
      description: 'User balance retrieved from database',
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
 * @deprecated Функция больше не нужна, так как кэширование убрано
 * Инвалидирует кэш баланса для указанного пользователя
 */
export const invalidateBalanceCache = (telegram_id: TelegramId): void => {
  // Функция оставлена для совместимости, но ничего не делает
  logger.info('ℹ️ invalidateBalanceCache вызвана, но кэширование отключено:', {
    description: 'invalidateBalanceCache called but caching is disabled',
    telegram_id: normalizeTelegramId(telegram_id),
  })
}

// Новые определения интерфейсов для детальной статистики

export interface RubPurchaseDetail {
  payment_date: string // formatted as DD.MM.YYYY or ISO string
  amount_rub: number
  payment_system: string
  transaction_id?: string
}

export interface XtrPurchaseDetail {
  purchase_date: string // formatted as DD.MM.YYYY or ISO string
  xtr_amount: number
  rub_amount: number
  payment_system: string
  transaction_id?: string
}

export interface ServiceUsageDetail {
  usage_date: string // formatted as DD.MM.YYYY or ISO string
  xtr_cost: number
  service_name: string
  model_name?: string
  details?: string
  transaction_id?: string
}

export interface UserBalanceStats {
  user_telegram_id: string
  user_first_name?: string
  user_last_name?: string
  user_username?: string

  balance_rub?: number
  balance_xtr?: number

  total_rub_deposited?: number
  total_rub_purchases_count?: number
  rub_purchase_details?: RubPurchaseDetail[]

  total_rub_spent_for_xtr?: number
  total_xtr_purchased?: number
  total_xtr_purchases_count?: number
  xtr_purchase_details?: XtrPurchaseDetail[]

  total_xtr_spent_on_services?: number
  total_service_usage_count?: number
  service_usage_details?: ServiceUsageDetail[]

  first_payment_date?: string // ISO string
  last_payment_date?: string // ISO string
}

// Старые интерфейсы PaymentDetail и UserBalanceStats (старая структура) можно будет удалить или закомментировать,
// если они больше нигде не используются после того, как getUserBalanceStats будет обновлена
// для возврата новой структуры UserBalanceStats.
// Пока оставляем их, чтобы не сломать другие части, которые могли их использовать.

/**
 * @deprecated Используйте новую структуру UserBalanceStats и детализированные интерфейсы.
 * Интерфейс детальной информации о платеже
 */
/* // Закомментируем старое определение PaymentDetail
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
*/

/**
 * @deprecated Используйте новую структуру UserBalanceStats.
 * Интерфейс для статистики баланса
 */
/* // Закомментируем старое определение UserBalanceStats
export interface UserBalanceStats {
  stars: number // Баланс в звездах (переименовано с balance)
  total_added: number
  total_spent: number
  bonus_stars: number
  added_stars: number
  added_rub: number
  services: Record<string, number>
  payment_methods?: Record<string, number>
  payments?: PaymentDetail[] // Этот PaymentDetail также должен быть закомментирован или обновлен
}
*/
