import { TelegramId } from '@/interfaces/telegram.interface'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { logger } from '@/utils/logger'
import {
  getTokenBalance,
  WalletUnavailableError,
} from '@/core/wallet/tokenWallet'

/**
 * The balance comes from `user_tokens`, the only live wallet (owner decision
 * 2026-09-20, step 3). The `get_user_balance` RPC over `payments_v2` is no
 * longer called: the archive stays for auditing, but it no longer decides what
 * anyone can afford.
 */
/**
 * Баланс НЕ УДАЛОСЬ УЗНАТЬ — это не то же самое, что баланс равен нулю.
 * Бросается только когда самой функции/таблицы нет в базе.
 */
export class BalanceUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BalanceUnavailableError'
  }
}

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

    // Step 3 of the single-wallet plan: the balance lives in `user_tokens`, and
    // that is what the bots must spend from. `payments_v2` keeps receiving its
    // audit rows but no longer decides what anyone can afford — otherwise the
    // same payment is spendable in the bots and in the mini app at once.
    //
    // Balances were carried on 2026-09-20 and checked before the switch: nobody
    // holding money backed by a real payment sees a smaller number here. What
    // does drop is test data and admin grants, which is the point.
    //
    // An unreachable wallet must NOT read as a zero balance, so the error is
    // translated and rethrown rather than swallowed.
    try {
      const balance = await getTokenBalance(normalizedId.toString())
      logger.info('✅ Баланс пользователя получен из user_tokens:', {
        description: 'User balance retrieved from the live wallet',
        telegram_id: normalizedId,
        stars: balance,
        bot_name,
      })
      return balance
    } catch (walletError) {
      if (walletError instanceof WalletUnavailableError) {
        throw new BalanceUnavailableError(
          `живой кошелёк недоступен: баланс не определён, а не равен нулю. ${walletError.message}`
        )
      }
      throw walletError
    }
  } catch (error) {
    logger.error('❌ Ошибка в getUserBalance:', {
      description: 'Error in getUserBalance function',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      telegram_id,
    })
    // Без этого пробрасывания throw выше ловился бы здесь же и снова
    // превращался в 0 — правка выглядела бы сделанной и не делала ничего.
    if (error instanceof BalanceUnavailableError) throw error
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
